import { isEmpty, isEqual } from 'lodash-es';
import { reactive, watch } from 'vue';

import { type Access, accessValues, isAccess } from './access';
import { AccessChangedAction, AccessChangingAction } from './actions/access-actions';
import ActionsMap from './actions/actions-map';
import {
  ContributionChangedAction,
  ContributionChangedActionClassIdentifier,
} from './actions/contribution-changed-action';
import FieldActionBase from './actions/field-action-base';
import { ValidChangedAction } from './actions/valid-changed-action';
import { ValueChangedAction, ValueChangedActionClassIdentifier } from './actions/value-changed-action';
import { VisibilityChangedAction, VisibilityChangingAction } from './actions/visibility-actions';
import { type Container } from './container';
import { type ElementSlots } from './element-state';
import { AbortEventHandlingException, type Extras, IBindParams } from './field.interface';
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
import { Validator } from './validators/validator';
import { isVisibility, type Visibility, visibilityValues } from './visibility';

/**
 * The bindings made from a declaration, held outside it and weakly: a binding is released with the record it
 * belongs to, and the declaration must not be what keeps it alive. It is what lets a rule registered on an item
 * template reach the rows that already exist - the declaration has no other way to name them.
 */
const bindingsMade = new WeakMap<object, Set<WeakRef<FieldBase>>>();

/**
 * The parameter keys that name what to register on an element rather than what it holds. The constructor that
 * receives them registers them and applies the rest, and `bind()` hands its overrides over whole, so they are
 * named here to keep them out of both the element's members and its extended properties.
 */
const registrationParams: ReadonlySet<string> = new Set(['validators', 'actions']);

/** a value as an error message names it: a string quoted, anything else as it prints */
const describe = (value: unknown) => (typeof value === 'string' ? `'${value}'` : String(value));

/** the accepted values as an error message lists them */
const listOf = (values: readonly string[]) => values.map(describe).join(', ');

/**
 * Refuses a parameter object naming `enabled`. `enabled` is read from `access` and has no setter, and a parameter
 * object that reaches an element past the type system - parsed from JSON, typed `any` - would otherwise have it
 * dropped by `bind()` or rejected with a TypeError that does not say what to write instead.
 */
function refuseEnabled(params: object): void {
  if (Object.hasOwn(params, 'enabled')) {
    throw new TypeError(
      `enabled is read from access and cannot be assigned; state access instead: ${listOf(accessValues)}`,
    );
  }
}

/**
 * How many elements are waiting for the record they belong to. A container that completes a record asks this
 * before it walks anything, so a form built out of elements that answer for themselves alone pays nothing for
 * the mechanism.
 */
let incompleteRecords = 0;

export abstract class FieldBase<T = any, X extends object = Extras> {
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
   * Names the element's class, which is what a structural comparison of two elements answers on. An element keeps
   * its state in private class fields, so a walk over own keys reaches none of it; lodash reads this tag through
   * Object.prototype.toString before it compares anything, and a tag it does not know ends the comparison there.
   * Two elements are therefore equal only where they are the same element. What they hold is compared as
   * isEqual(a.value, b.value).
   *
   * It is an accessor on the prototype, so an element carries nothing for it, and `Object.prototype.toString`
   * answers `[object Field]` rather than `[object Object]`. Each class states its own name as a literal: a
   * minifier renames the class itself, so reading the constructor's name would report whatever the build called
   * it.
   */
  get [Symbol.toStringTag](): string {
    return 'FormElement';
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

  /**
   * A new element of this one's class over `data`: same class, same registered actions, same extended properties,
   * and the change history starting over. It is how a declaration is put to work over a record - every row a
   * `List` builds is its item template bound to that row's data - and the element it is called on is what the new
   * one answers `declaration` with.
   *
   * `data` of `undefined` is no data supplied and the new element carries what this one holds; an explicit `null`
   * is data and clears. `overrides` states the rest: `originalValue` is read by key presence, `access` and
   * `visibility` fall back to this element's, and extended properties it names are written over the ones carried
   * over. The new element is detached - no `parent`, no `fieldName` - so it is free to be taken by a container.
   */
  abstract bind(data?: T, overrides?: IBindParams<T, X>): FieldBase<T, X>;

  /**
   * Exchanges the data this element holds for `data`, in place. The element is the same instance afterwards - its
   * identity, its actions, its extended properties and its place in whatever container holds it all stand - and it
   * ends up in the state `bind(data)` would have produced: the values are written, the change history starts over
   * and the validators run. It is what recycles one element across records, which is what a virtualised renderer
   * does with the rows it keeps.
   *
   * The element makes no statement of its own about the exchange: no `ValueChangedAction` fires for it, the way
   * none fires for an element that was just built. Its members do announce theirs, and a verdict that moves is
   * announced as always - a rebound element that is invalid says so to the container holding it. A change an
   * open transaction is already owed an announcement for stands: the commit reports the pair measured from
   * where the element was when the transaction opened.
   *
   * The data is measured against the element's `declaration`, so a key a record leaves out is taken from the
   * declaration rather than left as the previous record had it.
   */
  rebind(data: T): this {
    transactional((tx) => {
      tx.touch(this);
      // the baseline of a change the transaction has yet to announce stays where it is: the element is already
      // enrolled to report that change, and moving the baseline to the record it ends up over would erase the
      // report. Both are read before the reset, which enrols the element itself and, on a container, writes the
      // baseline of its own.
      const owed = tx.willAnnounceValue(this);
      const { announcedValue, announcedContribution, validatedValue } = this.#raw;
      this.resetTo(this.declaration, data);
      // with nothing owed, what the element now holds and sends is recorded as announced, so the commit reports no
      // change of either for it
      if (owed) Object.assign(this.#raw, { announcedValue, announcedContribution, validatedValue });
      else this.recordAnnounced();
    });
    return this;
  }

  /** contains original field value as was provided at creation */
  get originalValue(): T {
    return this.#state.originalValue;
  }

  set originalValue(newValue: T) {
    this.touchState();
    this.#state.originalValue = newValue;
  }

  /**
   * The extended properties this element carries: what a consumer attached to it beyond the members the class
   * declares, such as the label, hint or css class a UI layer binds to the input it renders the element with.
   * The read is tracked, so a template rendering off `field.extra.label` re-renders when the property is written.
   *
   * Every property is optional here, whatever `X` states: a parameter object need not carry one and
   * setExtendedValues writes as few as a caller likes, so a property `X` declares as required is present only
   * once something has written it.
   *
   * The object is frozen and setExtendedValues is the way to change it: it is the object a transaction captured,
   * and one written in place would leave a rollback with nothing to put back.
   */
  get extra(): Readonly<Partial<X>> {
    return this.#state.extra as Readonly<Partial<X>>;
  }

  /**
   * Writes extended properties. The values given are merged over the ones the element carries, so a write of one
   * property leaves the others standing, and the merged set replaces the object the element held.
   */
  setExtendedValues(values: Partial<X>): void {
    this.touchState();
    this.#state.extra = Object.freeze({ ...this.#raw.extra, ...values });
  }

  /**
   * The extended properties a parameter object carries: every key the element does not answer for itself. A key
   * the element answers for at the time the parameters are applied - `value`, `access`, an accessor a subclass
   * adds - is the element's own; a key that only Object.prototype answers for is nobody's declaration and counts
   * as extended, and `validators` and `actions` are neither, since they state what to register on the element.
   *
   * A member a subclass declares as a class field is not among the keys the element answers for: class fields are
   * defined on the instance after the base constructor returns, and the parameters are applied inside it. A
   * subclass that wants a parameter of its own name assigned to it declares that member as an accessor.
   */
  protected extendedOf(params: object): Partial<X> {
    // the accumulator carries no prototype, so a params key of `__proto__` - which is what a parameter object
    // parsed out of JSON can carry - becomes an own property of it instead of reaching the setter Object.prototype
    // holds and replacing the accumulator's prototype, which would make the ownership test below answer for keys
    // nothing put there
    const extended: Record<string, any> = Object.create(null);
    Object.entries(params).forEach(([key, value]) => {
      if (registrationParams.has(key)) return;
      if (!(key in this) || Object.hasOwn(Object.prototype, key)) extended[key] = value;
    });
    return extended as Partial<X>;
  }

  /**
   * Applies a parameter object: the members the element answers for are assigned to the element and the rest
   * become its extended properties. Assigning a getter-only member throws a TypeError, which is what a caller
   * naming `valid` or `parent` past the type system gets.
   */
  protected assignParams(params: object): void {
    refuseEnabled(params);
    const extended = this.extendedOf(params);
    Object.entries(params).forEach(([key, value]) => {
      if (Object.hasOwn(extended, key) || registrationParams.has(key)) return;
      (this as any)[key] = value;
    });
    if (!isEmpty(extended)) this.setExtendedValues(extended);
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
   * The two validation counters are the slots the element keeps: they count runs that are in flight, and a
   * rollback cannot un-start one. Put back, the counts would no longer match the endValidating calls still to come.
   */
  protected [TxRestore](snapshot: TxSnapshot): void {
    const validating = this.#raw.validatingCount;
    const validatingChildren = this.#raw.validatingChildren;
    Object.assign(this.#state, snapshot);
    this.#state.validatingCount = validating;
    this.#state.validatingChildren = validatingChildren;
  }

  /**
   * True while an asynchronous validation is in flight on this element or on anything below it, so a form answers
   * for the whole tree it holds. The answer is a pair of counters rather than a walk: the element's own runs, and
   * how many of its children answer the same question with true. A child that starts running while it was idle,
   * or stops while it was the last one running, moves its container's tally, and a tally that changes the
   * container's own answer moves the one above it - the transition costs the nesting depth and the read costs
   * nothing.
   */
  get validating(): boolean {
    return this.#state.validatingCount > 0 || this.#state.validatingChildren > 0;
  }

  /** announces the start of one asynchronous validation run; validators pair it with endValidating */
  beginValidating(): void {
    const wasIdle = !this.validating;
    this.#state.validatingCount++;
    if (wasIdle) this.container?.childValidatingChanged(true);
  }

  /** announces the end of one asynchronous validation run */
  endValidating(): void {
    // a stray call is a no-op: the count never goes below zero, and nothing above is told of a stop that the
    // element never started
    if (this.#raw.validatingCount === 0) return;
    this.#state.validatingCount--;
    if (!this.validating) this.container?.childValidatingChanged(false);
  }

  /**
   * Records that a child started or stopped answering `validating` with true, and carries the transition further
   * up where it changes this element's own answer. Only a `Container` has children, and it implements this; it is
   * declared here because a child tells its container through it.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected childValidatingChanged(started: boolean): void {}

  /**
   * True while an `Action.execute()` at or below this element has yet to settle. An `Action` answers for its own
   * runs; a container answers for the actions below it; anything else answers false, because an element that is
   * not an action has nothing to execute.
   *
   * It states one thing and `validating` states the other, so a form that gates a submit button on the tree being
   * idle reads both.
   */
  get busy(): boolean {
    return false;
  }

  /**
   * Resolves once nothing at or below this element is running - no asynchronous validation, no `Action.execute()`
   * that has yet to settle. It is what a submit path awaits instead of polling `validating` and `busy`, and it
   * resolves at once where nothing is running to begin with.
   *
   * It answers for the moment it resolves and makes no promise about the one after: work started later leaves the
   * element running again, so a caller that has to act on a settled tree reads what it needs immediately after
   * awaiting rather than at its leisure.
   */
  settled(): Promise<void> {
    if (!this.validating && !this.busy) return Promise.resolve();
    return new Promise((resolve) => {
      // sync flush, so the promise settles with the write that ended the last run rather than a tick after it
      const stop = watch(
        () => this.validating || this.busy,
        (running) => {
          if (running) return;
          stop();
          resolve();
        },
        { flush: 'sync' },
      );
    });
  }

  /**
   * List of errors. The array handed out is the one the element holds, and a validator writes into it in place,
   * so a transaction that is open takes the element into its record here: a rollback that put back everything
   * except the errors would leave a state the form never held.
   *
   * The array and its members are Vue proxies, not the raw instances a validator returned - `field.errors[0] ===
   * myError` is `false` for the very error that produced it. Unwrapping here would lose the tracked read a
   * template needs to re-render when a message behind a `Ref` changes; `toRaw()` compares identity instead.
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
   *
   * The type is `Container`, which names no members: a sibling lookup states which container it expects, either
   * with `field.parent instanceof Group` or with a cast where the structure guarantees it.
   */
  get parent(): Container | undefined {
    return this.#state.parent;
  }

  /**
   * The same link at the type the internals reach through. The hooks a child tells its container things through -
   * childValidatingChanged, childValidityChanged - are declared here, and a protected member is reachable only
   * through the class that declares it; `Container` overrides them, so the link is read as a `FieldBase`.
   */
  private get container(): FieldBase | undefined {
    return this.#state.parent;
  }

  /** when member of a Group, fieldName specifies the name of this field. Written by the group, read-only after */
  get fieldName(): string | undefined {
    return this.#state.fieldName;
  }

  /**
   * The element this one was declared as: itself for an element built from parameters, and the element it was
   * bound from for a binding - transitively, so a binding of a binding names the same one. Every row a `List`
   * builds from an item template is a binding of it, so a row's member and the template's member it stands for
   * answer with the same element, and an action registered on the template can tell the two apart.
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
   * members are bound before any of them holds the row, so a validator comparing two of them runs before the
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
      this.boundActions?.triggerEager(this, this.contribution, this.contribution);
      tx.markValidityDirty(this);
    });
  }

  /**
   * The map an element that was declared rather than bound registers its actions in, absent while it has registered
   * none. A binding holds no map of its own: `boundActions` reads the one its declaration holds.
   */
  declare protected _actions?: ActionsMap;

  /**
   * The actions this element answers to, absent where nothing is registered. A binding holds the very map its
   * declaration holds rather than a copy of it, so the slot is read directly: what a trigger costs is one property
   * read, and a rule registered on a `List`'s item template reaches every row through the map they share - the
   * rows built before the registration as much as the ones built after.
   */
  protected get boundActions(): ActionsMap | undefined {
    return this._actions;
  }

  /** Records that `binding` was made from this element, so a later registration can reach it. */
  protected noteBinding(binding: FieldBase): void {
    let made = bindingsMade.get(this);
    if (!made) {
      made = new Set();
      bindingsMade.set(this, made);
    }
    made.add(new WeakRef(binding));
  }

  /**
   * The bindings made from this element that are still alive, and this element itself. The dead references are
   * dropped as they are found, which is what keeps the set from growing over the life of a long-lived declaration.
   */
  protected get boundElements(): FieldBase[] {
    const declaration = this.declaration;
    const made = bindingsMade.get(declaration);
    const alive: FieldBase[] = [declaration];
    if (!made) return alive;
    made.forEach((ref) => {
      const binding = ref.deref();
      if (!binding) made.delete(ref);
      else alive.push(binding);
    });
    return alive;
  }

  /**
   * The map registrations go into: the declaration's, since that is where behaviour lives. The map is made on the
   * first registration and handed to every binding already made from the declaration, so all of them go on reading
   * one map through a slot of their own.
   */
  protected get actions(): ActionsMap {
    const declaration = this.declaration;
    if (!declaration._actions) {
      const map = new ActionsMap();
      declaration.boundElements.forEach((element) => {
        element._actions = map;
      });
    }
    return declaration._actions!;
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
   * The last step of a construction: it runs inside the transaction the construction is, with the parameters
   * applied and the value in place, before the element records what it was built as.
   *
   * A subclass overrides it to complete what the element was built with. What it writes here is part of the
   * construction rather than a change of it: the element announces no ValueChangedAction, and what the hook
   * leaves is what its eager actions and its validators run over, once. An element whose parameters named no
   * `originalValue` is baselined on the value the hook left and so starts unchanged; one that named a baseline is
   * measured against it, as any element is. A `Field` writes `_value`: the value setter states a change, and
   * this is not one.
   *
   * A container completes itself through its members, and a member carries a construction of its own: the write
   * reaches it as any later one would, so the member announces it and reports itself changed. A member that is to
   * start unchanged is baselined here as well - `this.fields.x.originalValue = this.fields.x.value`.
   *
   * `params` is the parameter object the constructor received, where it received one.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected constructed(params?: object): void {}

  /**
   * Re-reads what the next announcements will report as replaced. A contribution is composed only where something
   * listens for it, so the copy is re-read here; a leaf records what it holds at every announcement, so that copy
   * is always current, and a container that skipped composing what nobody was listening for re-reads its own too.
   */
  protected refreshPreviousValue(): void {
    this.#raw.announcedContribution = this.contribution;
  }

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
      if (child.parent) throw new TypeError('This element already belongs to a container - pass a bind() of it');
      tx.touch(child);
      child.#state.fieldName = fieldName;
      const detached = new Map<FieldBase, Access>([[child, child.effectiveAccess], ...child.effectiveAccessBelow()]);
      // only a Container calls this, since only a container holds children
      child.#state.parent = this as unknown as Container;
      // the containers above now decide what the child sends, so it is checked again where that moved
      child.revalidateWhereChanged(detached);
      this.adoptChild(child);
    });
  }

  /** Takes a child into this element's invalid tally; a container calls it once the child's parent link exists. */
  protected adoptChild(child: FieldBase): void {
    transactional((tx) => {
      tx.touch(this);
      if (!child.#raw.valid) this.#raw.invalidChildren++;
      // a run in flight below the child now runs below this element too. The validation counters are outside the
      // snapshot, so the transfer hands the rollback an undo of its own, and that undo reads the child at rollback
      // time: a run that starts below the child while the transaction holds it is one this element counts too, and
      // it is still in flight when the rollback hands the child back
      if (child.validating) this.childValidatingChanged(true);
      tx.whenRolledBack(() => {
        if (child.validating) this.childValidatingChanged(false);
      });
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
      // the undo reads the child at rollback time for the same reason adoptChild's does: what this element carries
      // again is the runs the child has in flight when it comes back, not the ones it had when it left
      if (child.validating) this.childValidatingChanged(false);
      tx.whenRolledBack(() => {
        if (child.validating) this.childValidatingChanged(true);
      });
      child.#state.parent = undefined;
      // the name goes with the link: it is the name a container held the element under, and the element belongs to
      // none, so it is as detached as one a bind() produced
      child.#state.fieldName = undefined;
      tx.markValidityDirty(this);
    });
  }

  /**
   * Brings this element to the state a fresh binding of `source` carrying `value` would be in: `value` is written
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
      const assigned = this.value !== target;
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
   * Records a child's new verdict in this element's tally. Only a `Container` has children, and it implements
   * this; it is declared here for the reason `childValidatingChanged` is.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected childValidityChanged(nowValid: boolean): void {}

  // default property handlers
  /**
   * How a rendering layer shows this element. It is presentation alone: what the element sends and whether it is
   * validated are its `access`, and no visibility changes either.
   */
  get visibility(): Visibility {
    return this.#state.visibility;
  }

  set visibility(newValue: Visibility) {
    const oldValue = this.#state.visibility;
    // writing what the element already holds is not a change, so nothing runs for it: no *Changing* handler, no
    // enrolment in the transaction, no *Changed* event. It is the rule the value setter states as well
    if (newValue === oldValue) return;
    transactional((tx) => {
      const alteredValue = this.boundActions?.trigger(VisibilityChangingAction, this, newValue, oldValue);
      // a handler that ended the run refused the write: nothing is written and nothing is announced
      if (alteredValue instanceof AbortEventHandlingException) return;
      const written = alteredValue ?? newValue;
      if (!isVisibility(written))
        throw new Error(`${describe(written)} is not a visibility: ${listOf(visibilityValues)}`);
      tx.touch(this);
      this.#state.visibility = written;
      this.boundActions?.trigger(VisibilityChangedAction, this, written, oldValue);
    });
  }

  /**
   * What this element accepts and what it sends: `'editable'` and `'readonly'` send its value, `'disabled'` sends
   * nothing and `'disabled-null'` sends `null`, and only `'editable'` accepts input. The validators run over what
   * the element sends and only where it is sent at all, as `effectiveAccess` states, so a switch of access runs
   * them again here and below.
   */
  get access(): Access {
    return this.#state.access;
  }

  set access(newValue: Access) {
    const oldValue = this.#state.access;
    // as with visibility: what the element already holds is no change, and nothing runs for it
    if (newValue === oldValue) return;
    transactional((tx) => {
      const alteredValue = this.boundActions?.trigger(AccessChangingAction, this, newValue, oldValue);
      // as with visibility: a handler that ended the run refused the write
      if (alteredValue instanceof AbortEventHandlingException) return;
      const written = alteredValue ?? newValue;
      if (!isAccess(written)) throw new Error(`${describe(written)} is not an access: ${listOf(accessValues)}`);
      tx.touch(this);
      const oldContribution = this.contribution;
      const below = this.effectiveAccessBelow();
      this.#state.access = written;
      this.revalidateWhereChanged(below);
      // a leaf's validators run at the change, over what it now sends; a container's run at the commit, where what
      // it sends is composed
      if (!this.composesValue) this.boundActions?.triggerEager(this, this.contribution, oldContribution);
      // what the element sends changed, so its contribution and that of every container above it is measured again
      // at the commit; what any of them holds did not change
      this.contributionChanged(tx);
      this.boundActions?.trigger(AccessChangedAction, this, written, oldValue);
    });
  }

  /**
   * The access this element has once the containers above it are taken into account. A container that sends nothing
   * or `null` in place of what it holds sends none of its members, so below a `'disabled'` or `'disabled-null'`
   * container every element is `'disabled'`; below a `'readonly'` one an `'editable'` element is `'readonly'`.
   * Anywhere else it is the element's own access.
   *
   * It is what decides whether the element's validators run: an element that is `'disabled'` here is sent nowhere,
   * so its validators reach no verdict and it carries none of their errors. Anywhere else they run over what the
   * element sends - its value, or `null`.
   */
  get effectiveAccess(): Access {
    const own = this.access;
    const above = this.parent?.effectiveAccess;
    if (above === 'disabled' || above === 'disabled-null') return 'disabled';
    if (above === 'readonly' && own === 'editable') return 'readonly';
    return own;
  }

  /**
   * True where `access` is `'editable'`: the element accepts input. It reads `access` and nothing else, and it is a
   * statement about input rather than about data - `'readonly'` is not enabled and still sends its value. What an
   * element sends is read from `access`.
   */
  get enabled(): boolean {
    return this.access === 'editable';
  }

  /**
   * True where `effectiveAccess` is `'editable'`: this element and every container above it accept input. A
   * rendering layer binds one read instead of walking the parent chain: a container that is not editable states
   * that its section cannot be edited, and the inputs rendered from the members inside it read that here.
   */
  get effectiveEnabled(): boolean {
    return this.effectiveAccess === 'editable';
  }

  /** The effective access of every element below this one, read before a change that may move it. */
  private effectiveAccessBelow(): Map<FieldBase, Access> {
    const seen = new Map<FieldBase, Access>();
    const visit = (element: FieldBase) => {
      element.members.forEach((member) => {
        seen.set(member, member.effectiveAccess);
        visit(member);
      });
    };
    visit(this);
    return seen;
  }

  /**
   * Runs the validators again on every element whose effective access moved since `before` was read: one that stops
   * being sent drops their errors, and one that starts being sent is checked over what it now sends.
   */
  private revalidateWhereChanged(before: Map<FieldBase, Access>): void {
    before.forEach((access, element) => {
      if (element.effectiveAccess !== access) element.rerunEagerActions();
    });
  }

  /**
   * What this element contributes to its container's `value` or `fullValue`: its own value, `null` in its place, or
   * nothing. It is the one place the rule is stated - every container composes its values by asking it.
   *
   * `fullValue` states everything the form holds, so every element contributes its value there. `value` states
   * what the form sends, and `access` decides it: `'disabled'` leaves the element out and `'disabled-null'` sends
   * `null`, whatever a container holds below it.
   */
  protected serializesAs(purpose: 'value' | 'fullValue'): 'value' | 'null' | 'omit' {
    if (purpose === 'fullValue') return 'value';
    switch (this.access) {
      case 'disabled':
        return 'omit';
      case 'disabled-null':
        return 'null';
      default:
        return 'value';
    }
  }

  /** What `child` contributes to this container, asked the way `childComposesValue` asks what it is. */
  protected childSerializesAs(child: FieldBase, purpose: 'value' | 'fullValue'): 'value' | 'null' | 'omit' {
    return child.serializesAs(purpose);
  }

  /**
   * What this element sends to its container's `value`: its value where its access sends it, `null` for
   * `'disabled-null'`, and `undefined` for `'disabled'`, whose key or row is left out. It is what the element's
   * validators run over and what `ContributionChangedAction` reports.
   */
  get contribution(): unknown {
    switch (this.serializesAs('value')) {
      case 'omit':
        return undefined;
      case 'null':
        return null;
      default:
        return this.value;
    }
  }

  /**
   * What `ValueChangedAction` reports this element as holding: its value. A container holds every member's value
   * whatever the member sends, so it answers with its `fullValue`.
   */
  protected get holding(): any {
    return this.value;
  }

  /**
   * Carries a change of what this element sends: the element is enrolled so the commit measures its contribution
   * and re-forms its verdict, and the container's value is built again.
   */
  private contributionChanged(tx: Transaction): void {
    tx.markValueChanged(this, false);
    tx.markValidityDirty(this);
    this.bumpValueVersion();
    this.parent?.notifyValueChanged();
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
   * Whether `child` composes its value from members of its own. It is what lets a container tell a nested
   * container from a leaf without knowing the classes below it, the way `resetChild` reaches a reset it does not
   * know the shape of.
   */
  protected childComposesValue(child: FieldBase): boolean {
    return child.composesValue;
  }

  /**
   * Announces what this element holds and what it sends, as they became over the transaction. Each pair carried is
   * (now, at the last announcement), so a value that went A -> B -> A within the transaction says nothing, and the
   * events an operation states rather than an element's state - an item added, an item removed - are emitted first,
   * in the order the operations happened.
   *
   * A container's validators read what it sends, which is composed here and nowhere else, so they run first, where
   * that moved; a leaf's have run at the write. `ValueChangedAction` reports what the element holds, and
   * `ContributionChangedAction` what it sends to its container.
   */
  protected [TxAnnounceValue](tx: Transaction, dirty: boolean, force: boolean, structural?: TxStructuralEvent[]): void {
    structural?.forEach((event) => this.boundActions?.trigger(event.actionClass, this, event.item, event.index));
    if (!dirty) return;
    const actions = this.boundActions;
    const composes = this.composesValue;
    const same = (a: unknown, b: unknown) => (composes ? isEqual(a, b) : a === b);

    // a container composes what it sends only where its validators read it
    if (composes && actions?.hasEager) {
      const sent = this.contribution;
      const validated = this.#raw.validatedValue;
      if (force || !isEqual(sent, validated)) {
        tx.touch(this);
        this.#raw.validatedValue = sent;
        actions.triggerEager(this, sent, validated);
      }
    }

    // what a container holds is only composed where something receives it; a leaf's is its value, read for free.
    // The record of what was announced is written before the event: a handler that changes something while it runs
    // opens a change of its own, and that one is measured against this announcement
    if (!composes || actions?.willTrigger(ValueChangedActionClassIdentifier)) {
      const held = this.holding;
      const announced = this.#raw.announcedValue;
      if (force || !same(held, announced)) {
        tx.touch(this);
        this.#raw.announcedValue = held;
        actions?.trigger(ValueChangedAction, this, held, announced);
      }
    }

    if (actions?.willTrigger(ContributionChangedActionClassIdentifier)) {
      const contribution = this.contribution;
      const announced = this.#raw.announcedContribution;
      if (!same(contribution, announced)) {
        tx.touch(this);
        this.#raw.announcedContribution = contribution;
        actions.trigger(ContributionChangedAction, this, contribution, announced);
      }
    }
  }

  /**
   * Records what this element holds and sends as what was last announced, so the commit that follows reports no
   * change of either. A construction calls it over the state it ends on, and so does an element brought to the
   * state a fresh binding would be in.
   */
  protected recordAnnounced(): void {
    this.#raw.announcedValue = this.holding;
    this.#raw.announcedContribution = this.contribution;
    this.#raw.validatedValue = this.contribution;
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
    const holder = this.container;
    if (holder) {
      tx.touch(holder);
      holder.childValidityChanged(newValid);
      tx.markValidityDirty(holder);
    }
    this.boundActions?.trigger(ValidChangedAction, this, newValid, oldValid);
  }

  validate(revalidate: boolean = false) {
    transactional((tx) => {
      if (revalidate) this.boundActions?.triggerEager(this, this.contribution, this.contribution);
      tx.markValidityDirty(this);
    });
  }

  get valid() {
    // the slot is read rather than the errors getter, which takes the element into an open transaction: reading a
    // verdict changes nothing, and there is nothing for a rollback to put back
    return this.#state.errors.length === 0;
  }

  get fullValue(): T {
    return this.value;
  }

  get isChanged(): boolean {
    return !isEqual(this.value, this.originalValue);
  }

  /**
   * Brings a fresh element into the state a binding of `source` is in: it records what it was declared as, takes
   * on the extended properties and the actions `source` carries, and runs the eager ones over the value it was
   * built with. The extended properties `overrides` states are written over the ones `source` carries, and they
   * are in place before the eager pass, so an action reading one sees what the binding ends up carrying. The
   * actions are the very instances `source` holds - what a binding takes on is data, not behaviour - and each is
   * told about this element as it is taken on, so an action serving several bindings knows all of them.
   */
  protected boundFrom(source: FieldBase<any, X>, newValue: any, oldValue: any, overrides?: object): void {
    if (overrides) refuseEnabled(overrides);
    this.#raw.declaration = source.declaration;
    const extended: Partial<X> = { ...source.extra, ...(overrides && this.extendedOf(overrides)) };
    if (!isEmpty(extended)) this.setExtendedValues(extended);
    const declaration = this.declaration;
    declaration.noteBinding(this);
    // the map is the declaration's own and is taken on rather than copied, so a rule registered on the declaration
    // after this binding was made reaches it too. A declaration with nothing registered has no map, and the one it
    // makes later is handed to this element then
    const actions = declaration._actions;
    if (!actions) return;
    this._actions = actions;
    actions.bindTo(this);
    actions.triggerEager(this, newValue, oldValue);
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
      this.registered(tx, action);
    });
    return this;
  }

  /**
   * Registers `action` so that `before` wraps it: `before` reaches it through the `supr` it is handed, instead of
   * ending the run there. It is how an action is added to a chain someone else built and still sits inside a
   * handler already registered, which registration order alone cannot arrange. `before` has to be registered on
   * this element under the same identifier.
   */
  registerActionBefore(action: FieldActionBase, before: FieldActionBase): this {
    transactional((tx) => {
      if (!tx.willAnnounceValue(this)) this.refreshPreviousValue();
      this.actions.register(action, before);
      this.registered(tx, action);
    });
    return this;
  }

  /**
   * Drops `action` from this element and answers whether it held it. The instance goes on serving every other
   * element it was registered on: what is dropped is this element's registration, not the action. A validator
   * withdraws the errors it put on this element as it goes, so the verdict the element reports is the one the
   * validators it still holds reach.
   */
  unregisterAction(action: FieldActionBase): boolean {
    let dropped = false;
    transactional((tx) => {
      const actions = this.boundActions;
      if (!actions) return;
      dropped = actions.unregister(action);
      if (!dropped) return;
      tx.touch(this);
      // a run still in flight was started by a validator this element may no longer hold, and its verdict is one
      // the element must not take on
      if (action instanceof Validator) this.#state.validationEpoch++;
      // the action served the declaration and every binding made from it, so it is released from all of them
      const elements = this.boundElements;
      tx.whenRolledBack(() => {
        actions.register(action);
        elements.forEach((element) => action.boundToBinding(element));
      });
      elements.forEach((element) => action.unregisterFrom(element));
    });
    return dropped;
  }

  /**
   * Records that `action` is now registered on this element, and that a rollback has to take that back. The
   * registration is not one of the state slots the snapshot covers, so it hands its own undo in.
   */
  private registered(tx: Transaction, action: FieldActionBase): void {
    // the action serves the declaration, so it serves every binding made from it - the ones that already exist as
    // much as the ones still to be made. An eager action states something about the value each of them holds, so
    // it reaches those values at once rather than waiting for the next change; the group it joined runs whole,
    // because the new action may be wrapped by ones registered before it and its own `supr` reaches those.
    const elements = this.boundElements;
    elements.forEach((element) => {
      action.boundToBinding(element);
      if (action.eager) {
        // what the action ran over is what a container's validators were last run over
        element.#raw.validatedValue = element.contribution;
        this.actions.triggerEagerFor(action.classIdentifier, element, element.contribution, element.originalValue);
      }
    });
    tx.whenRolledBack(() => {
      if (this.boundActions?.unregister(action)) elements.forEach((element) => action.unregisterFrom(element));
    });
  }

  triggerAction<T2 extends FieldActionBase>(
    actionClass: (abstract new (...args: any[]) => T2) & { classIdentifier: symbol },
    ...params: any[]
  ): any {
    // an element with no map has nothing registered, and ActionsMap.trigger answers null for exactly that case
    const actions = this.boundActions;
    return actions ? actions.trigger(actionClass, this, ...params) : null;
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
      const actions = this.boundActions;
      if (actions) {
        // the release names this element, because the same instance goes on serving every other element it was
        // registered on
        const elements = this.boundElements;
        actions.validators.forEach((validator) => {
          actions.unregister(validator);
          tx.whenRolledBack(() => {
            actions.register(validator);
            elements.forEach((element) => validator.boundToBinding(element));
          });
          // each of them withdraws the errors it put on every element it validated
          elements.forEach((element) => validator.unregisterFrom(element));
        });
      }
      this.errors = [];
      // the errors are gone before the recomputation, so the commit forms the verdict over the cleared state and
      // routes the validity transition through the usual path: the ValidChangedAction fires and the parent
      // re-evaluates
      this.validate();
    });
  }
}
