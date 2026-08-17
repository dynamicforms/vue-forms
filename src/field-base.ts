import { isBoolean, isEqual } from 'lodash-es';
import { computed, reactive, toRaw, type ComputedRef } from 'vue';

import ActionsMap from './actions/actions-map';
import { EnabledChangedAction, EnabledChangingAction } from './actions/enabled-actions';
import FieldActionBase from './actions/field-action-base';
import { ValidChangedAction } from './actions/valid-changed-action';
import { VisibilityChangedAction, VisibilityChangingAction } from './actions/visibility-actions';
import DisplayMode from './display-mode';
import { IFieldConstructorParams } from './field.interface';
import { type Group } from './group';
import { ValidationError } from './validators/validation-error';

/**
 * The computed behind a container's `valid`, held outside the element it belongs to. A computed refers back to
 * itself through its dependency record, and JSON.stringify and lodash isEqual both walk own enumerable
 * properties, so an element carrying one as a property would be a cycle to either of them.
 */
const validReads = new WeakMap<object, ComputedRef<boolean>>();

export abstract class FieldBase<T = any> {
  /**
   * A field is a Vue reactive proxy from construction onwards: the base constructor returns the proxy, and a
   * derived class's `this` is whatever super() returned, so every subclass constructor, field initializer and
   * method sees the proxy. Consequence: plain `field.property = value` is tracked, with no wrapper in between.
   */
  constructor() {
    return reactive(this) as this;
  }

  abstract get value(): T;
  abstract set value(newValue: T);

  abstract get touched(): boolean;
  abstract set touched(touched: boolean);

  abstract clone(overrides?: Partial<IFieldConstructorParams<T>>): FieldBase<T>;

  declare originalValue: T; // contains original field value as was provided at creation

  private validatingCount = 0;

  /** true while at least one asynchronous validator is still running for this field */
  get validating(): boolean {
    return this.validatingCount > 0;
  }

  /** announces the start of one asynchronous validation run; validators pair it with endValidating */
  beginValidating(): void {
    this.validatingCount++;
  }

  /** announces the end of one asynchronous validation run */
  endValidating(): void {
    this.validatingCount = Math.max(0, this.validatingCount - 1);
  }

  protected _valid: boolean = true; // is current value valid as per FE and BE validators?

  errors: ValidationError[] = []; // list of errors

  declare parent?: Group; // when member of a Group, parent will specify that group

  declare fieldName?: string; // when member of a Group, fieldName specifies the name of this field

  /**
   * The map this element registers its actions in, absent while it has registered none. Code that only triggers
   * reads this slot rather than `actions`, so an element with nothing registered stays free of a map: `actions`
   * allocates one for whoever asks, and a trigger over an empty map does nothing anyway. Writers assign it
   * directly too - a write through the accessor makes the reactive proxy read the old value first, which is the
   * one read that would allocate the map the assignment is about to replace.
   */
  declare protected _actions?: ActionsMap;

  protected get actions(): ActionsMap {
    if (!this._actions) this._actions = new ActionsMap();
    return this._actions;
  }

  protected set actions(newValue: ActionsMap) {
    this._actions = newValue;
  }

  private _valueVersion: number = 0;

  /**
   * Counts the writes that have changed the value of this element or of anything below it. A container reads it
   * before answering from its value cache, and the read is an ordinary tracked one, so an effect that took a
   * cached value still re-runs when a descendant is written.
   */
  protected get valueVersion(): number {
    return this._valueVersion;
  }

  /**
   * Marks the value of this element and of every ancestor as superseded. It walks the parent chain, so it costs
   * the nesting depth: an ancestor rebuilds its value the next time one is asked of it, instead of being walked
   * here for a reader that may never come.
   */
  protected bumpValueVersion(): void {
    this._valueVersion++;
    let ancestor: FieldBase | undefined = this.parent;
    while (ancestor) {
      ancestor._valueVersion++;
      ancestor = ancestor.parent;
    }
  }

  /**
   * Re-reads the value that the next ValueChangedAction will report as the one it replaces. An element with
   * nothing listening does not build its value at all, so the copy it holds is from before the changes nobody
   * received; a registration that adds a listener refreshes it here.
   */
  protected refreshPreviousValue(): void {}

  /** Number of direct children whose last validate() ended on an invalid verdict. */
  protected invalidChildren: number = 0;

  /**
   * The verdict validate() records and announces: this element's own errors plus the tally of children that
   * reported themselves invalid, so a container forms it without walking its members. `valid` is the read path
   * and answers over the live errors arrays instead; the two differ only for an error written into a member
   * without a validate() call, which is the documented cost of pushing errors by hand.
   */
  protected get countedValid(): boolean {
    return this.errors.length === 0 && this.invalidChildren === 0;
  }

  /**
   * Makes this element the container of `child`: it installs the back-reference and takes the child into the
   * invalid tally. An element belongs to one container at a time, so a child that already carries the link is
   * refused; releaseChild() takes the link away again, and an element released that way can be handed on.
   *
   * The link must stay non-enumerable: Group.value iterates its fields, and lodash isEqual and JSON.stringify walk
   * own enumerable properties, so an enumerable back-reference makes all three recurse into the container.
   * defineProperty has no trap on a reactive proxy, so it reaches the underlying object.
   */
  protected takeChild(child: FieldBase): void {
    if (child.parent) throw new TypeError('This element already belongs to a container - pass a clone() of it');
    Object.defineProperty(child, 'parent', { get: () => this, configurable: true, enumerable: false });
    this.adoptChild(child);
  }

  /** Takes a child into this element's invalid tally; a container calls it once the child's parent link exists. */
  protected adoptChild(child: FieldBase): void {
    if (!child._valid) this.invalidChildren++;
  }

  /**
   * Drops a child out of this element's invalid tally and takes its back-reference away. An element keeps no link
   * to a container that no longer holds it: it would go on moving that container's tally, and the link is what
   * stands in the way of the element being taken by another container.
   */
  protected releaseChild(child: FieldBase): void {
    if (!child._valid) this.invalidChildren--;
    delete child.parent;
  }

  /**
   * Brings this element to the state a fresh clone of `source` carrying `value` would be in: `value` is written
   * where the caller supplied one and `source`'s own value where it did not, the change history - originalValue,
   * touched - starts over and the errors are dropped and re-established by the validators. A container that reuses
   * an element at a position it already holds calls it, so the element is indistinguishable from one built for
   * that position.
   */
  protected resetTo(source: FieldBase, value: any): void {
    const target = value === undefined ? source.value : value;
    const outerValidation = this.suppressValidation;
    this.suppressValidation = true;
    let assigned: boolean;
    let dropped: boolean;
    try {
      dropped = this.errors.length > 0;
      if (dropped) this.errors = [];
      this.touched = false;
      assigned = this.enabled && this.value !== target;
      this.value = target;
      this.originalValue = this.value;
    } finally {
      this.suppressValidation = outerValidation;
    }
    // an assignment that went through ran the validators over the new value. Where it was a no-op they run here
    // if there were errors to drop, and otherwise not at all: the verdict they reached over the value the field
    // still holds is the one that stands.
    this.validate(!assigned && dropped);
  }

  /** Resets a member. It is what lets a container reach the reset of a child whose class it does not know. */
  protected resetChild(child: FieldBase, source: FieldBase, value: any): void {
    child.resetTo(source, value);
  }

  /**
   * Records a child's new verdict. The child reports it itself, from validate(), so the tally is right even while
   * the climb that would otherwise carry the change is held back.
   */
  protected childValidityChanged(nowValid: boolean): void {
    this.invalidChildren += nowValid ? -1 : 1;
  }

  /**
   * The composed verdict a container answers `valid` with, memoised by Vue. The walk over the members is what
   * makes an error pushed into one of them visible without a validate() call, and the computed keeps that walk
   * from repeating while nothing it read has moved.
   */
  protected get validRead(): boolean {
    const element = toRaw(this);
    let read = validReads.get(element);
    if (!read) {
      read = computed(() => this.composeValid());
      validReads.set(element, read);
    }
    return read.value;
  }

  /** What validRead computes. A leaf answers over its own errors; a container adds its members. */
  protected composeValid(): boolean {
    return this.errors.length === 0;
  }

  // default property handlers
  private _visibility: DisplayMode = DisplayMode.FULL;

  get visibility(): DisplayMode {
    return this._visibility;
  }

  set visibility(newValue: DisplayMode) {
    const oldValue = this._visibility;
    const alteredValue = this._actions?.trigger(VisibilityChangingAction, this, newValue, oldValue);
    if (!DisplayMode.isDefined(alteredValue ?? newValue)) throw new Error('visibility must be a DisplayMode constant');
    this._visibility = DisplayMode.fromAny(alteredValue ?? newValue);
    this._actions?.trigger(VisibilityChangedAction, this, this._visibility, oldValue);
  }

  private _enabled: boolean = true;

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(newValue: boolean) {
    const oldValue = this._enabled;
    const alteredValue = this._actions?.trigger(EnabledChangingAction, this, newValue, oldValue);
    if (!isBoolean(alteredValue ?? newValue)) throw new Error('Enabled value must be boolean');
    this._enabled = alteredValue ?? newValue;
    // a disabled field is left out of the value its group serializes, so the switch changes the value of every
    // container above it just as a write to the value itself would
    if (this._enabled !== oldValue) this.bumpValueVersion();
    this._actions?.trigger(EnabledChangedAction, this, this._enabled, oldValue);
  }

  /**
   * While true, validate() on this field does nothing at all: it neither recomputes _valid nor emits
   * ValidChangedAction, and nothing climbs to the parent. A container that walks its members one by one - assigning
   * them a value, or revalidating them - sets it for the duration of the walk, so a member's upward climb cannot
   * announce the verdict of a half-applied value or of a half-revalidated set, and clears it in a finally block
   * followed by its own validate(). That call recomputes over the finished state and emits the net transition, so
   * the deferral cannot swallow a real change.
   */
  protected suppressValidation: boolean = false;

  /**
   * While true, a validity change is still recomputed and still announced on this field, but it is not passed up to
   * the parent: the climb is only remembered and carried out by flushParentValidityClimb(). A setter that notifies
   * the parent of the new value itself holds it over the notifying region, so the parent forms its verdict once,
   * over the finished value, instead of once over the value being replaced and once over the value replacing it.
   */
  protected suppressParentValidityClimb: boolean = false;

  private parentValidityClimbPending: boolean = false;

  /** Carries out the climb that a validity change made while suppressParentValidityClimb was held, if there was one. */
  protected flushParentValidityClimb(): void {
    if (!this.parentValidityClimbPending) return;
    this.parentValidityClimbPending = false;
    this.parent?.validate();
  }

  validate(revalidate: boolean = false) {
    if (this.suppressValidation) return;
    if (revalidate) this._actions?.triggerEager(this, this.value, this.value);
    const oldValid = this._valid;
    const newValid = this.countedValid;
    this._valid = newValid;
    if (newValid !== oldValid) {
      // the verdict goes to the container that holds this element, and a container that released it holds it no
      // longer: the link is gone with the release, so a dropped row moves no tally
      const container = this.parent;
      // the container's tally is corrected first, so a handler and the recomputation below it both read a count
      // that already includes this verdict, and it is corrected even where the climb is held back or refused
      container?.childValidityChanged(newValid);
      this._actions?.trigger(ValidChangedAction, this, newValid, oldValid);
      // a container's validity is composed of its members', so a member that changes it without a value change
      // (asynchronous validator, externally pushed error) has to make the container re-evaluate. The call passes
      // no revalidate, so it only recomputes, and it climbs no further than the first ancestor whose own
      // validity stays the same.
      if (container) {
        if (this.suppressParentValidityClimb) this.parentValidityClimbPending = true;
        else container.validate();
      }
    }
  }

  get valid() {
    return this.errors.length === 0;
  }

  get fullValue(): any {
    return this.value;
  }

  get isChanged(): boolean {
    return !isEqual(this.value, this.originalValue);
  }

  /**
   * Registers the actions a constructor received in its parameters: registration without the eager trigger,
   * because a constructor ends with a single this.actions.triggerEager(...) over the finished value, and an
   * eager action registered here would otherwise also run once per registration, over a half-built field.
   */
  protected registerInitialActions(actions: FieldActionBase[]): void {
    actions.forEach((action) => {
      this.actions.register(action);
      action.boundToField(this);
    });
  }

  registerAction(action: FieldActionBase): this {
    this.refreshPreviousValue();
    this.actions.register(action);
    action.boundToField(this);
    if (action.eager) {
      // When adding eager actions, execute them immediately
      this.actions.trigger(Object.getPrototypeOf(action).constructor, this, this.value, this.originalValue);
    }
    return this;
  }

  triggerAction<T2 extends FieldActionBase>(
    actionClass: (abstract new (...args: any[]) => T2) & { classIdentifier: symbol },
    ...params: any[]
  ): any {
    // an element with no map has nothing registered, and ActionsMap.trigger answers null for exactly that case
    return this._actions ? this._actions.trigger(actionClass, this, ...params) : null;
  }

  private _validationEpoch: number = 0;

  /**
   * Generation counter of the validators attached to this field. A Validator reads it when a run starts and drops
   * a result whose epoch no longer matches, so a validation still in flight when clearValidators() is called
   * cannot push an error onto a field that no longer has the validator that produced it.
   */
  get validationEpoch(): number {
    return this._validationEpoch;
  }

  clearValidators(): void {
    this._validationEpoch++;
    if (this._actions) this.actions = this._actions.cloneWithoutValidators();
    this.errors = [];
    // the errors are gone before the recomputation, so validate() sees the cleared state and routes the validity
    // transition through the usual path: the ValidChangedAction fires and the parent re-evaluates
    this.validate();
  }
}
