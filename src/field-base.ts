import { isBoolean, isEqual } from 'lodash-es';
import { computed, reactive, type ComputedRef } from 'vue';

import ActionsMap from './actions/actions-map';
import { EnabledChangedAction, EnabledChangingAction } from './actions/enabled-actions';
import FieldActionBase from './actions/field-action-base';
import { ValidChangedAction } from './actions/valid-changed-action';
import { ValueChangedAction, ValueChangedActionClassIdentifier } from './actions/value-changed-action';
import { VisibilityChangedAction, VisibilityChangingAction } from './actions/visibility-actions';
import DisplayMode from './display-mode';
import { type ElementSlots } from './element-state';
import { IFieldConstructorParams } from './field.interface';
import { type Group } from './group';
import {
  currentTransaction,
  type Transaction,
  TxAnnounceValue,
  TxCapture,
  TxRestore,
  TxSettleValidity,
  type TxSnapshot,
  type TxStructuralEvent,
  transactional,
} from './transaction';
import { ValidationError } from './validators/validation-error';

/**
 * The computed behind a container's `valid`, held outside the element it belongs to. A computed refers back to
 * itself through its dependency record, and JSON.stringify and lodash isEqual both walk own enumerable
 * properties, so an element carrying one as a property would be a cycle to either of them.
 */
const validReads = new WeakMap<object, ComputedRef<boolean>>();

/**
 * How many elements are waiting for the record they belong to. A container that completes a record asks this
 * before it walks anything, so a form built out of elements that answer for themselves alone pays nothing for
 * the mechanism.
 */
let incompleteRecords = 0;

export abstract class FieldBase<T = any> {
  /**
   * Vue's getTargetType answers INVALID for an object that carries __v_skip, so reactive() hands an element back
   * unwrapped and no element is ever behind a proxy of its own. isReactive() reads the second flag, and it stays
   * true because what carries an element's reactivity - its state - is a reactive object.
   *
   * Two consequences for a consumer, both silent. watch(field, cb) with a bare element as the source registers
   * no dependency, because the deep traversal Vue starts for a reactive source stops on __v_skip; the supported
   * form is watch(() => field.value, cb). And readonly(field) hands the element straight back, so the value it
   * returns is the element itself and a write through it reaches the field; what a caller hands out instead is
   * the value, which is frozen, or a computed over it.
   */
  get __v_skip(): boolean {
    return true;
  }

  get __v_isReactive(): boolean {
    return true;
  }

  /**
   * The element's mutable state, in an object beside the element. `#state` is the tracked view of it: a slot read
   * through it inside an effect subscribes the effect to that slot, and a write to the slot re-runs the effect.
   * `#raw` is the same object without the proxy, for the bookkeeping nothing renders from.
   *
   * They are private class fields, so no reflection over the element reaches the state or the parent link it
   * carries, and a subclass reads its own slot type through the accessors below.
   */
  readonly #state: ElementSlots<T>;

  readonly #raw: ElementSlots<T>;

  constructor(slots: ElementSlots<T>) {
    this.#raw = slots;
    this.#state = reactive(slots) as ElementSlots<T>;
  }

  /** the tracked view of this element's state; a subclass narrows the return type to its own slots */
  protected get state(): ElementSlots<T> {
    return this.#state;
  }

  /** the untracked view of this element's state; a subclass narrows the return type to its own slots */
  protected get raw(): ElementSlots<T> {
    return this.#raw;
  }

  abstract get value(): T;
  abstract set value(newValue: T);

  abstract get touched(): boolean;
  abstract set touched(touched: boolean);

  abstract clone(overrides?: Partial<IFieldConstructorParams<T>>): FieldBase<T>;

  /** contains original field value as was provided at creation */
  get originalValue(): T {
    return this.#state.originalValue;
  }

  set originalValue(newValue: T) {
    this.touchState();
    this.#state.originalValue = newValue;
  }

  /**
   * Takes this element into the record of the open transaction, where one is open. A write of a single slot that
   * announces nothing calls it instead of opening a transaction of its own: on its own such a write is already
   * atomic, and inside a transaction it has to be part of what a rollback puts back.
   */
  protected touchState(): void {
    currentTransaction()?.touch(this);
  }

  /**
   * Records the whole of this element's mutable state, so that a rolled-back transaction can put it back exactly
   * as it found it. The errors array is copied because a validator writes into the array it is handed rather than
   * replacing it, and a subclass copies whatever else it holds by reference the same way.
   *
   * What is not in the snapshot is the action map, which no write touches: an operation that replaces it hands
   * the transaction its own undo instead, so this stays the one shape every element captures.
   */
  protected [TxCapture](): TxSnapshot {
    return { ...this.#raw, errors: [...this.#raw.errors] };
  }

  /**
   * Puts a captured state back. It writes through the tracked view, so an effect that ran on the state the
   * transaction produced runs again on the state it is being returned to, and only for the slots that differ.
   *
   * validatingCount is the one slot the element keeps: it counts runs that are in flight, and a rollback cannot
   * un-start one. Put back, the count would no longer match the endValidating calls still to come.
   */
  protected [TxRestore](snapshot: TxSnapshot): void {
    const validating = this.#raw.validatingCount;
    Object.assign(this.#state, snapshot);
    this.#state.validatingCount = validating;
  }

  /** true while at least one asynchronous validator is still running for this field */
  get validating(): boolean {
    return this.#state.validatingCount > 0;
  }

  /** announces the start of one asynchronous validation run; validators pair it with endValidating */
  beginValidating(): void {
    this.#state.validatingCount++;
  }

  /** announces the end of one asynchronous validation run */
  endValidating(): void {
    this.#state.validatingCount = Math.max(0, this.#state.validatingCount - 1);
  }

  /**
   * List of errors. The array handed out is the one the element holds, and a validator writes into it in place,
   * so a transaction that is open takes the element into its record here: a rollback that put back everything
   * except the errors would leave a state the form never held.
   */
  get errors(): ValidationError[] {
    this.touchState();
    return this.#state.errors;
  }

  set errors(newValue: ValidationError[]) {
    this.touchState();
    this.#state.errors = newValue;
  }

  /**
   * The container that holds this element: the Group it is a member of, or the List whose row it is, and
   * undefined while no container holds it. The container writes it; everyone else reads it. The read is tracked,
   * so an effect rendering off the link - `v-if="field.parent"` - re-runs when a container takes the element or
   * releases it.
   */
  get parent(): Group | undefined {
    return this.#state.parent as Group | undefined;
  }

  /** when member of a Group, fieldName specifies the name of this field. Written by the group, read-only after */
  get fieldName(): string | undefined {
    return this.#state.fieldName;
  }

  /**
   * The element this one was declared as: itself for an element built from parameters, and the element it was
   * cloned from for a clone - transitively, so a clone of a clone names the same one. Every row a `List` builds
   * from an item template is a clone, so a row's member and the template's member it stands for answer with the
   * same element, and an action registered on the template can tell the two apart.
   */
  get declaration(): FieldBase {
    return this.#raw.declaration ?? this;
  }

  /** The elements this one holds: a Group's members, a List's rows, none for a leaf. */
  protected get members(): FieldBase[] {
    return [];
  }

  /**
   * Every element in this element's subtree, this element included, that was declared as `declaration`. It answers
   * the question a shared action asks when the record it changed in is not the record its targets live in - a form
   * field that every row of a list reacts to - and it costs the subtree, so it is the path taken only when the
   * cheaper one, resolving within a single record, does not apply.
   */
  bindingsOf(declaration: FieldBase): FieldBase[] {
    const canonical = declaration.declaration;
    const found: FieldBase[] = [];
    const visit = (element: FieldBase) => {
      if (element.declaration === canonical) found.push(element);
      element.members.forEach(visit);
    };
    visit(this);
    return found;
  }

  /** set while an eager pass over this element is waiting for the record the element belongs to */
  declare protected _recordPending?: boolean;

  /**
   * States that an eager pass over this element reached an element it needs and did not find it, because the
   * record this element belongs to was not assembled at the time: a `List` row is built member by member and its
   * members are cloned before any of them holds the row, so a validator comparing two of them runs before the
   * row exists. The container that finishes the record runs the pass again, and a pass that still reaches
   * nothing says so again, so the next container above answers for it.
   */
  markRecordIncomplete(): void {
    if (this._recordPending) return;
    this._recordPending = true;
    incompleteRecords++;
  }

  /**
   * Runs the eager passes outstanding in `element`'s subtree, now that the record it belongs to is assembled. A
   * container calls it where it has just made a record complete: a Group that has written its members, and a
   * List that has taken a row, which is what gives the row's fields the form above it.
   */
  protected completeRecords(element: FieldBase = this): void {
    if (incompleteRecords === 0) return;
    transactional(() => {
      const visit = (current: FieldBase) => {
        if (current._recordPending) {
          current._recordPending = false;
          incompleteRecords--;
          current.rerunEagerActions();
        }
        current.members.forEach(visit);
      };
      visit(element);
    });
  }

  /** Runs this element's eager actions over the value it holds and re-forms the verdict they reach. */
  private rerunEagerActions(): void {
    transactional((tx) => {
      this._actions?.triggerEager(this, this.value, this.value);
      tx.markValidityDirty(this);
    });
  }

  /**
   * The map this element registers its actions in, absent while it has registered none. Code that only triggers
   * reads this slot rather than `actions`, so an element with nothing registered stays free of a map: `actions`
   * allocates one for whoever asks, and a trigger over an empty map does nothing anyway.
   */
  declare protected _actions?: ActionsMap;

  protected get actions(): ActionsMap {
    if (!this._actions) this._actions = new ActionsMap();
    return this._actions;
  }

  protected set actions(newValue: ActionsMap) {
    this._actions = newValue;
  }

  /**
   * Counts the writes that have changed the value of this element or of anything below it. A container reads it
   * before answering from its value cache, and the read is an ordinary tracked one, so an effect that took a
   * cached value still re-runs when a descendant is written.
   */
  protected get valueVersion(): number {
    return this.#state.valueVersion;
  }

  /**
   * Marks the value of this element and of every ancestor as superseded. It walks the parent chain, so it costs
   * the nesting depth: an ancestor rebuilds its value the next time one is asked of it, instead of being walked
   * here for a reader that may never come. The walk also brings each element into the open transaction, so a
   * rollback puts the versions back and no reader is left holding a cache the tree no longer supports.
   */
  protected bumpValueVersion(): void {
    transactional((tx) => {
      tx.touch(this);
      this.#state.valueVersion++;
      let ancestor: FieldBase | undefined = this.parent;
      while (ancestor) {
        tx.touch(ancestor);
        ancestor.#state.valueVersion++;
        ancestor = ancestor.parent;
      }
    });
  }

  /**
   * States that this element's value changed and that every container above it therefore holds a different value
   * too. Nothing is announced here: the transaction works out at commit which of the elements enrolled actually
   * ends up holding a different value, and announces those once each.
   *
   * `force` states that the caller already knows this element's value changed - one item more or fewer is a
   * different list whatever the items compare as - so the commit announces it without composing a comparison.
   */
  protected propagateValueChanged(force: boolean = false): void {
    transactional((tx) => {
      tx.markValueChanged(this, force);
      tx.markValidityDirty(this);
      this.parent?.notifyValueChanged();
    });
  }

  /**
   * Re-reads the value that the next ValueChangedAction will report as the one it replaces. A leaf records what
   * it announced at every announcement, so its copy is always current and there is nothing to re-read; a
   * container that skipped composing a value nobody was listening for overrides this.
   */
  protected refreshPreviousValue(): void {}

  /**
   * The verdict validate() records and announces: this element's own errors plus the tally of children that
   * reported themselves invalid, so a container forms it without walking its members. `valid` is the read path
   * and answers over the live errors arrays instead; the two differ only for an error written into a member
   * without a validate() call, which is the documented cost of pushing errors by hand.
   */
  protected get countedValid(): boolean {
    return this.#raw.errors.length === 0 && this.#raw.invalidChildren === 0;
  }

  /**
   * Makes this element the container of `child`: it installs the back-reference, records the name a Group holds
   * the child under, and takes the child into the invalid tally. An element belongs to one container at a time,
   * so a child that already carries the link is refused; releaseChild() takes the link away again, and an element
   * released that way can be handed on. The child's state is unreachable from outside FieldBase, so a container
   * writes the two slots through here rather than on the child.
   */
  protected takeChild(child: FieldBase, fieldName?: string): void {
    transactional((tx) => {
      if (child.parent) throw new TypeError('This element already belongs to a container - pass a clone() of it');
      tx.touch(child);
      child.#state.fieldName = fieldName;
      child.#state.parent = this;
      this.adoptChild(child);
    });
  }

  /** Takes a child into this element's invalid tally; a container calls it once the child's parent link exists. */
  protected adoptChild(child: FieldBase): void {
    transactional((tx) => {
      tx.touch(this);
      if (!child.#raw.valid) this.#raw.invalidChildren++;
      // the tally moved, so the verdict this element carries may no longer be the one its members support
      tx.markValidityDirty(this);
    });
  }

  /**
   * Drops a child out of this element's invalid tally and takes its back-reference away. An element keeps no link
   * to a container that no longer holds it: it would go on moving that container's tally, and the link is what
   * stands in the way of the element being taken by another container.
   */
  protected releaseChild(child: FieldBase): void {
    transactional((tx) => {
      tx.touch(this);
      tx.touch(child);
      if (!child.#raw.valid) this.#raw.invalidChildren--;
      child.#state.parent = undefined;
      tx.markValidityDirty(this);
    });
  }

  /**
   * Brings this element to the state a fresh clone of `source` carrying `value` would be in: `value` is written
   * where the caller supplied one and `source`'s own value where it did not, the change history - originalValue,
   * touched - starts over and the errors are dropped and re-established by the validators. A container that reuses
   * an element at a position it already holds calls it, so the element is indistinguishable from one built for
   * that position.
   */
  protected resetTo(source: FieldBase, value: any): void {
    transactional(() => {
      const target = value === undefined ? source.value : value;
      const dropped = this.errors.length > 0;
      if (dropped) this.errors = [];
      this.touched = false;
      const assigned = this.enabled && this.value !== target;
      this.value = target;
      this.originalValue = this.value;
      // an assignment that went through ran the validators over the new value. Where it was a no-op they run here
      // if there were errors to drop, and otherwise not at all: the verdict they reached over the value the field
      // still holds is the one that stands.
      this.validate(!assigned && dropped);
    });
  }

  /** Resets a member. It is what lets a container reach the reset of a child whose class it does not know. */
  protected resetChild(child: FieldBase, source: FieldBase, value: any): void {
    child.resetTo(source, value);
  }

  /**
   * Records a child's new verdict in this element's tally. The child reports it as it settles, and the commit
   * settles the deepest element first, so the tally a container reads when its own turn comes is finished.
   */
  protected childValidityChanged(nowValid: boolean): void {
    this.#raw.invalidChildren += nowValid ? -1 : 1;
  }

  /**
   * The composed verdict a container answers `valid` with, memoised by Vue. The walk over the members is what
   * makes an error pushed into one of them visible without a validate() call, and the computed keeps that walk
   * from repeating while nothing it read has moved.
   */
  protected get validRead(): boolean {
    let read = validReads.get(this);
    if (!read) {
      read = computed(() => this.composeValid());
      validReads.set(this, read);
    }
    return read.value;
  }

  /** What validRead computes. A leaf answers over its own errors; a container adds its members. */
  protected composeValid(): boolean {
    return this.#state.errors.length === 0;
  }

  // default property handlers
  get visibility(): DisplayMode {
    return this.#state.visibility;
  }

  set visibility(newValue: DisplayMode) {
    transactional((tx) => {
      const oldValue = this.#state.visibility;
      const alteredValue = this._actions?.trigger(VisibilityChangingAction, this, newValue, oldValue);
      if (!DisplayMode.isDefined(alteredValue ?? newValue)) {
        throw new Error('visibility must be a DisplayMode constant');
      }
      tx.touch(this);
      this.#state.visibility = DisplayMode.fromAny(alteredValue ?? newValue);
      this._actions?.trigger(VisibilityChangedAction, this, this.#state.visibility, oldValue);
    });
  }

  get enabled(): boolean {
    return this.#state.enabled;
  }

  set enabled(newValue: boolean) {
    transactional((tx) => {
      const oldValue = this.#state.enabled;
      const alteredValue = this._actions?.trigger(EnabledChangingAction, this, newValue, oldValue);
      if (!isBoolean(alteredValue ?? newValue)) throw new Error('Enabled value must be boolean');
      tx.touch(this);
      this.#state.enabled = alteredValue ?? newValue;
      // a disabled field is left out of the value its group serializes, so the switch changes the value of every
      // container above it just as a write to the value itself would
      if (this.#state.enabled !== oldValue) this.bumpValueVersion();
      this._actions?.trigger(EnabledChangedAction, this, this.#state.enabled, oldValue);
    });
  }

  /**
   * True for an element whose value is composed of its members'. The commit builds such a value only where
   * something receives it, compares it by content rather than by identity, and runs the element's own validators
   * with the announcement: a container's validators read the composed value, which exists only once the members
   * have been written. A leaf's validators have run at the write instead, so its announcement carries no eager
   * pass of its own.
   */
  protected get composesValue(): boolean {
    return false;
  }

  /**
   * Announces what this element's value became over the transaction. The pair carried is (value now, value at the
   * last announcement), so a value that went A -> B -> A within the transaction says nothing, and the events an
   * operation states rather than an element's state - an item added, an item removed - are emitted first, in the
   * order the operations happened.
   */
  protected [TxAnnounceValue](tx: Transaction, dirty: boolean, force: boolean, structural?: TxStructuralEvent[]): void {
    structural?.forEach((event) => this._actions?.trigger(event.actionClass, this, event.item, event.index));
    if (!dirty) return;
    const actions = this._actions;
    // the pair a container carries is only composed where something receives it: with no ValueChangedAction and
    // no eager action riding along, walking the members would produce an object nobody reads
    if (this.composesValue && !actions?.willTrigger(ValueChangedActionClassIdentifier)) return;
    const newValue = this.value;
    const oldValue = this.#raw.announcedValue;
    if (!force && (this.composesValue ? isEqual(newValue, oldValue) : newValue === oldValue)) return;
    tx.touch(this);
    // the record of what was announced is written before the event: a handler that changes something while it
    // runs opens a change of its own, and that one is measured against this announcement
    this.#raw.announcedValue = newValue;
    if (this.composesValue) actions?.trigger(ValueChangedAction, this, newValue, oldValue);
    else actions?.triggerChain(ValueChangedActionClassIdentifier, this, newValue, oldValue);
  }

  /**
   * Forms the verdict this element ends the transaction with and announces a transition of it. The container is
   * told first, so a handler reads a tally that already includes this verdict, and it is enrolled in the same
   * transaction: its own verdict is composed of its members', so a member that moves without a value change - an
   * asynchronous validator, an error pushed in by hand - is what makes the container re-form its own. The
   * transaction settles the deepest element first, so a container is reached only once its members have decided.
   */
  protected [TxSettleValidity](tx: Transaction): void {
    const oldValid = this.#raw.valid;
    const newValid = this.countedValid;
    if (newValid === oldValid) return;
    tx.touch(this);
    this.#raw.valid = newValid;
    // the verdict goes to the container that holds this element, and a container that released it holds it no
    // longer: the link is gone with the release, so a dropped row moves no tally
    const container = this.parent;
    if (container) {
      tx.touch(container);
      container.childValidityChanged(newValid);
      tx.markValidityDirty(container);
    }
    this._actions?.trigger(ValidChangedAction, this, newValid, oldValid);
  }

  validate(revalidate: boolean = false) {
    transactional((tx) => {
      if (revalidate) this._actions?.triggerEager(this, this.value, this.value);
      tx.markValidityDirty(this);
    });
  }

  get valid() {
    // the slot is read rather than the errors getter, which takes the element into an open transaction: reading a
    // verdict changes nothing, and there is nothing for a rollback to put back
    return this.#state.errors.length === 0;
  }

  get fullValue(): any {
    return this.value;
  }

  get isChanged(): boolean {
    return !isEqual(this.value, this.originalValue);
  }

  /**
   * Brings a fresh clone of `source` into the state a clone is in: it records what it was declared as, takes on
   * the actions `source` carries and runs the eager ones over the value it was built with. The actions are the
   * very instances `source` holds - what a clone copies is data, not behaviour - and each is told about this
   * element as it is taken on, so an action serving several clones knows all of them.
   */
  protected clonedFrom(source: FieldBase, newValue: any, oldValue: any): void {
    this.#raw.declaration = source.declaration;
    const actions = source._actions;
    if (!actions) return;
    this._actions = actions.clone();
    this._actions.bindTo(this);
    this._actions.triggerEager(this, newValue, oldValue);
  }

  /**
   * Registers the actions a constructor received in its parameters: registration without the eager trigger,
   * because a constructor ends with a single this.actions.triggerEager(...) over the finished value, and an
   * eager action registered here would otherwise also run once per registration, over a half-built field.
   */
  protected registerInitialActions(actions: FieldActionBase[]): void {
    actions.forEach((action) => {
      this.actions.register(action);
      action.boundToBinding(this);
    });
  }

  registerAction(action: FieldActionBase): this {
    transactional((tx) => {
      // the baseline of a change the transaction has yet to announce stays where it is: the element is already
      // enrolled to report that change, and moving the baseline to the value it now holds would erase the report
      if (!tx.willAnnounceValue(this)) this.refreshPreviousValue();
      this.actions.register(action);
      action.boundToBinding(this);
      if (action.eager) {
        // When adding eager actions, execute them immediately
        this.actions.trigger(Object.getPrototypeOf(action).constructor, this, this.value, this.originalValue);
      }
    });
    return this;
  }

  triggerAction<T2 extends FieldActionBase>(
    actionClass: (abstract new (...args: any[]) => T2) & { classIdentifier: symbol },
    ...params: any[]
  ): any {
    // an element with no map has nothing registered, and ActionsMap.trigger answers null for exactly that case
    return this._actions ? this._actions.trigger(actionClass, this, ...params) : null;
  }

  /**
   * Generation counter of the validators attached to this field. A Validator reads it when a run starts and drops
   * a result whose epoch no longer matches, so a validation still in flight when clearValidators() is called
   * cannot push an error onto a field that no longer has the validator that produced it.
   */
  get validationEpoch(): number {
    return this.#state.validationEpoch;
  }

  clearValidators(): void {
    transactional((tx) => {
      tx.touch(this);
      this.#state.validationEpoch++;
      if (this._actions) {
        const previous = this._actions;
        const dropped = previous.validators;
        // the map is replaced rather than written, so the snapshot does not reach it: a rollback that put back
        // every slot but this would leave the element without the validators the verdict it reports was reached
        // with
        tx.whenRolledBack(() => {
          this._actions = previous;
        });
        this.actions = previous.cloneWithoutValidators();
        // releasing a validator's listeners is what a rollback could not take back, so it waits for the commit:
        // until then the map the element carried is still the one a rollback puts back, validators and all. The
        // release names this element, because the same validator instance goes on serving every other element it
        // was registered on
        tx.whenCommitted(() => dropped.forEach((validator) => validator.unregisterFrom(this)));
      }
      this.errors = [];
      // the errors are gone before the recomputation, so the commit forms the verdict over the cleared state and
      // routes the validity transition through the usual path: the ValidChangedAction fires and the parent
      // re-evaluates
      this.validate();
    });
  }
}
