import { isEmpty, isEqual } from 'lodash-es';
import { reactive, watch } from 'vue';

import { type Access, accessValues, isAccess } from './access';
import { AccessChangedAction, AccessChangingAction } from './actions/access-actions';
import ActionsMap from './actions/actions-map';
import {
  ContributionChangedAction,
  ContributionChangedActionClassIdentifier,
} from './actions/contribution-changed-action';
import { EnabledChangedAction, EnabledChangingAction } from './actions/enabled-actions';
import FieldActionBase from './actions/field-action-base';
import { ValidChangedAction } from './actions/valid-changed-action';
import { ValueChangedAction, ValueChangedActionClassIdentifier } from './actions/value-changed-action';
import { VisibilityChangedAction, VisibilityChangingAction } from './actions/visibility-actions';
import { type Container } from './container';
import { noteElement, noteInternal } from './devtools/api';
import { BeginValidating, type ElementSlots, ValidationEpoch } from './element-state';
import { AbortEventHandlingException, type Extras, IBindParams } from './field.interface';
import {
  currentTransaction,
  type Transaction,
  SentNowhere,
  TxAnnounceValue,
  TxCapture,
  TxRestore,
  TxAnnounceFlags,
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
 * belongs to, and the declaration does not keep it alive. A rule registered on an item template reaches the rows
 * that already exist through this map; the declaration holds no other reference to them.
 */
const bindingsMade = new WeakMap<object, Set<WeakRef<FieldBase>>>();

/**
 * The parameter keys that name what to register on an element. The constructor registers them and applies the
 * other keys, and `bind()` passes its overrides on whole, so these keys are listed here to keep them out of both
 * the element's members and its extended properties.
 */
const registrationParams: ReadonlySet<string> = new Set(['validators', 'actions']);

/**
 * Whether `key` names an accessor (a getter, a setter or both) declared on `element`'s prototype chain below
 * `Object.prototype`. A construction parameter with such a key is assigned to the element; any other key is an
 * extended property.
 */
function accessorOf(element: object, key: string): boolean {
  for (let proto = Object.getPrototypeOf(element); proto && proto !== Object.prototype;) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key);
    if (descriptor) return descriptor.get !== undefined || descriptor.set !== undefined;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}

/** formats a value for an error message: a string quoted, anything else through String() */
const describe = (value: unknown) => (typeof value === 'string' ? `'${value}'` : String(value));

/** formats the accepted values as a list for an error message */
const listOf = (values: readonly string[]) => values.map(describe).join(', ');

/**
 * Throws a TypeError for a parameter object that contains `enabled`. `enabled` is read from `access` and has no
 * setter. Without this check, a parameter object that bypasses the type system (parsed from JSON, typed `any`)
 * has the key dropped by `bind()`, or rejected with a TypeError that does not name `access` as the replacement.
 */
function refuseEnabled(params: object): void {
  if (Object.hasOwn(params, 'enabled')) {
    throw new TypeError(
      `enabled is read from access and cannot be assigned; state access instead: ${listOf(accessValues)}`,
    );
  }
}

/**
 * The number of elements waiting for the record they belong to. A container that completes a record reads this
 * before it walks anything, so a form in which no element waits for its record does no walk.
 */
let incompleteRecords = 0;

export abstract class FieldBase<T = any, X extends object = Extras> {
  /**
   * Vue's getTargetType returns INVALID for an object that has __v_skip, so reactive() returns an element
   * unwrapped and no element is wrapped in a proxy of its own. isReactive() reads the second flag, which is true
   * because the element's state, which holds its reactivity, is a reactive object.
   *
   * Two consequences for a consumer, neither of which raises an error. watch(field, cb) with a bare element as the
   * source registers no dependency, because Vue's deep traversal of a reactive source stops on __v_skip; use
   * watch(() => field.value, cb). readonly(field) returns the element itself, so a write through the result
   * reaches the field; to pass a read-only view, pass the value (which is frozen) or a computed over it.
   */
  get __v_skip(): boolean {
    return true;
  }

  get __v_isReactive(): boolean {
    return true;
  }

  /**
   * The tag that a structural comparison of two elements uses. An element keeps its state in private class fields,
   * so a walk over own keys reaches none of it. lodash reads this tag through Object.prototype.toString before it
   * compares anything and stops at a tag it does not recognise, so two elements are equal only if they are the
   * same element. To compare what they hold, use isEqual(a.value, b.value).
   *
   * It is an accessor on the prototype, so it adds no own property to an element, and `Object.prototype.toString`
   * returns `[object Field]` instead of `[object Object]`. Each class declares its name as a literal, because a
   * minifier renames the class and the constructor's name would be the minified one.
   */
  get [Symbol.toStringTag](): string {
    return 'FormElement';
  }

  /**
   * The element's mutable state, in an object beside the element. `#state` is the tracked view of it: a slot read
   * through it inside an effect subscribes the effect to that slot, and a write to the slot re-runs the effect.
   * `#raw` is the same object without the proxy, used for bookkeeping that nothing renders from.
   *
   * Both are private class fields, so reflection over the element does not reach the state or the parent link in
   * it. A subclass reads its own slot type through the accessors below.
   */
  readonly #state: ElementSlots<T>;

  readonly #raw: ElementSlots<T>;

  constructor(slots: ElementSlots<T>) {
    this.#raw = slots;
    this.#state = reactive(slots) as ElementSlots<T>;
    noteElement(this);
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
   * Returns a new element of this one's class over `data`, with the same registered actions and extended
   * properties and a new change history. Every row a `List` builds is its item template bound to that row's data.
   * The new element's `declaration` is the element `bind()` is called on.
   *
   * `data` of `undefined` means no data: the new element holds what this one holds. An explicit `null` is data and
   * clears the value. In `overrides`, `originalValue` is applied when the key is present, `access` and `visibility`
   * default to this element's, and the extended properties given are written over the copied ones. The new element
   * is detached (no `parent`, no `fieldName`), so a container can take it.
   */
  abstract bind(data?: T, overrides?: IBindParams<T, X>): FieldBase<T, X>;

  /**
   * Replaces the data this element holds with `data`, in place. The instance, its actions, its extended properties
   * and its position in its container are unchanged, and the element ends in the state `bind(data)` produces: the
   * values are written, the change history starts over and the validators run. A virtualised renderer uses it to
   * reuse one element across records.
   *
   * No `ValueChangedAction` fires for the element itself, as for a newly built element. Its members announce their
   * changes, and a change of validity is announced as usual: a rebound element that is invalid updates the invalid
   * count of its container. If an open transaction already has a pending value change for the element, the commit
   * announces it with the value the element had when the transaction opened as the old value.
   *
   * Keys missing from `data` are taken from the element's `declaration`, not from the previous record.
   */
  rebind(data: T): this {
    transactional((tx) => {
      tx.touch(this);
      // the baseline of a change the transaction has yet to announce is kept: the element is already enrolled to
      // announce that change, and moving the baseline to the new record would cancel the announcement. Both are
      // read before the reset, which enrols the element and, on a container, writes its own baseline.
      const owed = tx.willAnnounceValue(this);
      const { announcedValue, announcedContribution, validatedValue } = this.#raw;
      this.resetTo(this.declaration, data);
      // with no pending change, what the element now holds and sends is recorded as announced, so the commit
      // announces no change of either
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
   * The extended properties of this element: properties a consumer attached beyond the members the class declares,
   * such as the label, hint or css class a UI layer binds to the input it renders for the element. The read is
   * tracked, so a template that reads `field.extra.label` re-renders when the property is written.
   *
   * Every property is optional here, whatever `X` declares: a parameter object need not contain any, and
   * setExtendedValues can write any subset, so a property `X` declares as required is present only after it has
   * been written.
   *
   * The object is frozen; change it with setExtendedValues. A transaction captures this object, so an in-place
   * write would leave a rollback with no previous state to restore.
   */
  get extra(): Readonly<Partial<X>> {
    return this.#state.extra as Readonly<Partial<X>>;
  }

  /**
   * Writes extended properties. The given values are merged over the existing ones, so a write of one property
   * keeps the others, and the merged object replaces the one the element held.
   */
  setExtendedValues(values: Partial<X>): void {
    this.touchState();
    this.#state.extra = Object.freeze({ ...this.#raw.extra, ...values });
  }

  /**
   * Returns the extended properties in a parameter object: every key that is not a member of the element. A key
   * that is a member when the parameters are applied (`value`, `access`, an accessor a subclass adds) belongs to
   * the element. A key that exists only on Object.prototype counts as extended. `validators` and `actions` are
   * neither: they name what to register on the element.
   *
   * A member a subclass declares as a class field is not a member at this point: class fields are defined on the
   * instance after the base constructor returns, and the parameters are applied inside it. A subclass that needs a
   * parameter assigned to a member of the same name declares that member as an accessor.
   */
  protected extendedOf(params: object): Partial<X> {
    // the accumulator has no prototype, so a params key of `__proto__` (possible in a parameter object parsed from
    // JSON) becomes an own property instead of calling the Object.prototype setter and replacing the accumulator's
    // prototype, which would make the ownership test below match keys that were never added
    const extended: Record<string, any> = Object.create(null);
    Object.entries(params).forEach(([key, value]) => {
      if (registrationParams.has(key)) return;
      if (!accessorOf(this, key)) extended[key] = value;
    });
    return extended as Partial<X>;
  }

  /**
   * Applies a parameter object: a key that names an accessor of the element is assigned to the element, and every
   * other key becomes an extended property. A key named like a method or another non-accessor member (`validate`,
   * `bind`, `settled`) is stored in `extra` and leaves the member as it is. Assigning a getter-only accessor throws a
   * TypeError, so a parameter object that bypasses the type system and contains `valid` or `parent` throws.
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
   * Adds this element to the record of the open transaction, if one is open. A write of a single slot that announces
   * nothing calls it instead of opening a transaction: outside a transaction such a write is atomic, and inside one
   * it must be restored by a rollback.
   */
  protected touchState(): void {
    currentTransaction()?.touch(this);
  }

  /**
   * Records all of this element's mutable state, so that a rolled-back transaction restores it exactly. The errors
   * array is copied because a validator modifies the array in place, and a subclass copies any other state it holds
   * by reference in the same way.
   *
   * The action map is not in the snapshot: no write modifies it, and an operation that replaces it registers its
   * own undo with the transaction, so every element captures the same shape.
   */
  protected [TxCapture](): TxSnapshot {
    return { ...this.#raw, errors: [...this.#raw.errors] };
  }

  /**
   * Restores a captured state. It writes through the tracked view, so an effect that ran on the state the
   * transaction produced runs again on the restored state, for the slots that differ.
   *
   * The two validation counters are not restored: they count runs in flight, and a rollback does not cancel a run.
   * Restored counts would not match the endValidating calls still to come.
   */
  protected [TxRestore](snapshot: TxSnapshot): void {
    const validating = this.#raw.validatingCount;
    const validatingChildren = this.#raw.validatingChildren;
    Object.assign(this.#state, snapshot);
    this.#state.validatingCount = validating;
    this.#state.validatingChildren = validatingChildren;
  }

  /**
   * True while an asynchronous validation is in flight on this element or on any element below it, so on a form it
   * covers the whole tree. It is computed from two counters, without a walk: the element's own runs, and the number
   * of its children whose `validating` is true. A child that becomes validating or stops validating updates its
   * container's counter, and a change of the container's `validating` updates the counter above it. A transition
   * costs one step per nesting level; a read costs one counter comparison.
   */
  get validating(): boolean {
    return this.#state.validatingCount > 0 || this.#state.validatingChildren > 0;
  }

  /**
   * Counts one asynchronous validation run as started and returns the function that counts it as ended. The
   * function ends that run only: a second call does nothing, so `validating` and `settled()` cannot report the end
   * of a run that is still in flight.
   */
  [BeginValidating](): () => void {
    const wasIdle = !this.validating;
    this.#state.validatingCount++;
    if (wasIdle) this.container?.childValidatingChanged(true);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.#state.validatingCount--;
      if (!this.validating) this.container?.childValidatingChanged(false);
    };
  }

  /**
   * Records that a child's `validating` became true or false, and passes the transition up if it changes this
   * element's own `validating`. Only a `Container` has children and implements this; it is declared here because a
   * child calls it on its container.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected childValidatingChanged(started: boolean): void {}

  /**
   * True while an `Action.execute()` at or below this element has not settled. On an `Action` it covers its own
   * runs, on a container the actions below it; on any other element it is false.
   *
   * It does not include validation; `pending` covers both.
   */
  get busy(): boolean {
    return false;
  }

  /**
   * True while an asynchronous validation or an `Action.execute()` at or below this element has not settled:
   * `validating || busy`. It is reactive, so a template binds a submit button to it. `settled()` resolves when it
   * turns false.
   */
  get pending(): boolean {
    return this.validating || this.busy;
  }

  /**
   * Resolves when nothing at or below this element is running: no asynchronous validation and no unsettled
   * `Action.execute()`, which is when `pending` is false. A submit path awaits it instead of polling `pending`. If
   * nothing is running, the returned promise is already resolved.
   *
   * It covers only the moment it resolves: work started later makes the element run again, so a caller that needs
   * a settled tree reads what it needs immediately after the await.
   */
  settled(): Promise<void> {
    if (!this.pending) return Promise.resolve();
    return new Promise((resolve) => {
      // sync flush, so the promise resolves in the write that ended the last run, not a tick later
      const stop = watch(
        () => this.pending,
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
   * List of errors. The returned array is the one the element holds, and a validator modifies it in place, so this
   * getter adds the element to an open transaction's record: otherwise a rollback would restore everything except
   * the errors.
   *
   * The array and its members are Vue proxies, not the raw instances a validator returned: `field.errors[0] ===
   * myError` is `false` even for the same error. Compare identity with `toRaw()`.
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
   * undefined while no container holds it. Only the container writes it. The read is tracked, so an effect that
   * reads it (`v-if="field.parent"`) re-runs when a container takes or releases the element.
   *
   * The type is `Container`, which declares no members: a sibling lookup narrows it, either with
   * `field.parent instanceof Group` or with a cast where the structure guarantees the type.
   */
  get parent(): Container | undefined {
    return this.#state.parent;
  }

  /**
   * The same link, typed as `FieldBase` for internal calls. The hooks a child calls on its container
   * (childValidatingChanged, childValidityChanged) are declared here, and a protected member is reachable only
   * through the class that declares it; `Container` overrides them.
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
   * bound from for a binding, transitively, so a binding of a binding has the same declaration. Every row a `List`
   * builds from its item template is a binding of it, so a row's member and the corresponding item template member
   * have the same `declaration`, and an action registered on the item template can distinguish the two.
   */
  get declaration(): FieldBase {
    return this.#raw.declaration ?? this;
  }

  /** The elements this one holds: a Group's members, a List's rows, none for a leaf. */
  protected get members(): FieldBase[] {
    return [];
  }

  /**
   * Returns every element in this element's subtree, this element included, whose declaration is `declaration`. A
   * shared action uses it when the change happened in a different record than its targets (a form field that every
   * row of a list reacts to). It walks the subtree, so it is used only when resolution within a single record does
   * not apply.
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
   * Marks that an eager pass over this element did not find an element it needs, because the record this element
   * belongs to was not assembled yet: a `List` row is built member by member and its members are bound before the
   * row holds them, so a validator comparing two of them runs before the row exists. The container that completes
   * the record runs the pass again; a pass that still finds nothing marks the element again, and the next container
   * above runs it.
   */
  markRecordIncomplete(): void {
    if (this._recordPending) return;
    this._recordPending = true;
    incompleteRecords++;
  }

  /**
   * Runs the pending eager passes in `element`'s subtree, once the record it belongs to is assembled. A container
   * calls it after it completes a record: a Group after it has written its members, and a List after it has taken a
   * row, which connects the row's elements to the form above it.
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

  /** Runs this element's eager actions over the value it holds and recomputes its validity. */
  private rerunEagerActions(): void {
    transactional((tx) => {
      this.boundActions?.triggerEager(this, this.contribution, this.contribution);
      tx.markValidityDirty(this);
    });
  }

  /**
   * The map of actions registered on a declaration; undefined until one is registered. A binding has no map of its
   * own: its slot holds the same map as its declaration.
   */
  declare protected _actions?: ActionsMap;

  /**
   * The actions registered for this element; undefined if none are registered. A binding holds its declaration's
   * map itself, not a copy, so a trigger reads one property, and a rule registered on a `List`'s item template
   * reaches every row through the shared map, including rows built before the registration.
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
   * The live bindings made from this element's declaration, and the declaration itself. Dead references are removed
   * when found, so the set does not grow over the life of a long-lived declaration.
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
   * The map registrations go into: the declaration's. The map is created on the first registration and assigned to
   * every binding already made from the declaration, so all of them read one map through their own slot.
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
   * Counts the writes that have changed the value of this element or of any element below it. A container reads it
   * before returning its cached value, and the read is tracked, so an effect that read a cached value re-runs when
   * a descendant is written.
   */
  protected get valueVersion(): number {
    return this.#state.valueVersion;
  }

  /**
   * Marks the value of this element and of every ancestor as outdated. It walks the parent chain only (one step per
   * nesting level); an ancestor rebuilds its value on the next read. The walk adds each element to the open
   * transaction, so a rollback restores the versions and no cached value outlives the state it was built from.
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
   * Marks that this element's value changed, and with it the value of every container above it. Nothing is
   * announced here: at commit the transaction determines which enrolled elements hold a different value and
   * announces each of them once.
   *
   * `force` means the caller has established that the value changed (a list with one item more or fewer is a
   * different list whatever the items compare as), so the commit announces it without a comparison.
   */
  protected propagateValueChanged(force: boolean = false): void {
    transactional((tx) => {
      tx.markValueChanged(this, force);
      tx.markValidityDirty(this);
      this.parent?.notifyValueChanged();
    });
  }

  /**
   * The last step of a construction: it runs inside the construction's transaction, with the parameters applied and
   * the value in place, before the element records its initial state.
   *
   * A subclass overrides it to complete the element. What it writes here is part of the construction, not a
   * change: the element announces no ValueChangedAction, and its eager actions and validators run once over the
   * state the hook leaves. An element whose parameters contain no `originalValue` takes the value the hook left as
   * its `originalValue` and starts unchanged; one whose parameters contain `originalValue` is compared against it.
   * A `Field` writes `_value` here, because the value setter records a change.
   *
   * A container completes itself through its members, and each member has already been constructed: the write
   * reaches it as a regular change, so the member announces it and reports itself changed. To have a member start
   * unchanged, set its baseline here as well: `this.fields.x.originalValue = this.fields.x.value`.
   *
   * `params` is the parameter object the constructor received, if any.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected constructed(params?: object): void {}

  /**
   * Re-reads the old value the next announcements will report. A contribution is composed only when something
   * listens for it, so the stored copy is re-read here. A leaf records its value at every announcement, so that
   * copy is always current; a container, which composes its held value only for a listener, re-reads that too.
   */
  protected refreshPreviousValue(): void {
    this.#raw.announcedContribution = this.contribution;
  }

  /**
   * The validity validate() records and announces: computed from this element's own errors and the count of invalid
   * children, so a container computes it without walking its members. `valid` reads the live errors arrays instead;
   * the two differ only for an error written into a member without a validate() call, which is the documented
   * limitation of writing errors by hand.
   */
  protected get countedValid(): boolean {
    return this.#raw.errors.length === 0 && this.#raw.invalidChildren === 0;
  }

  /**
   * Makes this element the container of `child`: it sets the back-reference, records the name a Group holds the
   * child under, and adds the child to the invalid count. An element belongs to one container at a time, so a
   * child that already has a parent throws a TypeError; releaseChild() removes the link, after which the element
   * can be taken by another container. The child's state is private to FieldBase, so a container writes the two
   * slots through this method.
   */
  protected takeChild(child: FieldBase, fieldName?: string): void {
    transactional((tx) => {
      if (child.parent) throw new TypeError('This element already belongs to a container - pass a bind() of it');
      tx.touch(child);
      child.#state.fieldName = fieldName;
      // below an editable container every element keeps its own effective access, so only a container that narrows
      // access needs the check
      const narrowing = this.effectiveAccess !== 'editable';
      const detached = narrowing ? child.effectiveAccessFromHere() : undefined;
      // only a Container calls this, since only a container holds children
      child.#state.parent = this as unknown as Container;
      // the containers above now determine what the child sends, so elements whose effective access changed are
      // validated again
      if (detached) child.revalidateWhereChanged(detached);
      this.adoptChild(child);
    });
  }

  /** Adds a child to this element's invalid count; a container calls it after setting the child's parent link. */
  protected adoptChild(child: FieldBase): void {
    transactional((tx) => {
      tx.touch(this);
      if (!child.#raw.valid && child.countsInContainer) this.#raw.invalidChildren++;
      // a run in flight below the child is now also below this element. The validation counters are outside the
      // snapshot, so the transfer registers its own undo, which reads the child at rollback time: a run that starts
      // below the child during the transaction is counted here too, and is still in flight after the rollback
      if (child.validating) this.childValidatingChanged(true);
      tx.whenRolledBack(() => {
        if (child.validating) this.childValidatingChanged(false);
      });
      // the invalid count changed, so this element's validity is recomputed
      tx.markValidityDirty(this);
    });
  }

  /**
   * Removes a child from this element's invalid count and clears its back-reference. With the link left in place,
   * the element would keep updating that container's invalid count and could not be taken by another container.
   */
  protected releaseChild(child: FieldBase): void {
    transactional((tx) => {
      tx.touch(this);
      tx.touch(child);
      if (!child.#raw.valid && child.countsInContainer) this.#raw.invalidChildren--;
      // released from a container that narrowed its access, the child is validated again where its effective
      // access changed
      const attached = this.effectiveAccess !== 'editable' ? child.effectiveAccessFromHere() : undefined;
      // the undo reads the child at rollback time, as in adoptChild: after the rollback this element counts the runs
      // the child has in flight at that time
      if (child.validating) this.childValidatingChanged(false);
      tx.whenRolledBack(() => {
        if (child.validating) this.childValidatingChanged(true);
      });
      child.#state.parent = undefined;
      // the name is cleared with the link, so the element is as detached as one bind() returns
      child.#state.fieldName = undefined;
      if (attached) child.revalidateWhereChanged(attached);
      tx.markValidityDirty(this);
    });
  }

  /**
   * Sets this element to the state of a new binding of `source` with `value`: `value` is written if supplied, and
   * `source`'s value otherwise; the change history (originalValue, touched) starts over, and the errors are cleared
   * and set again by the validators. A container that reuses an element at a position calls it, so the element is
   * indistinguishable from one built for that position.
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
      // an assignment that changed the value ran the validators over the new value. If it was a no-op, they run
      // here only if errors were cleared; otherwise the existing validation result for the unchanged value is kept.
      this.validate(!assigned && dropped);
    });
  }

  /** Resets a member. A container calls it to reset a child of any class. */
  protected resetChild(child: FieldBase, source: FieldBase, value: any): void {
    child.resetTo(source, value);
  }

  /**
   * Records a child's new validity in this element's invalid count. Only a `Container` has children and implements
   * this; it is declared here for the same reason as `childValidatingChanged`.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected childValidityChanged(nowValid: boolean): void {}

  // default property handlers
  /**
   * How a rendering layer shows this element. It affects presentation only: what the element sends and whether it
   * is validated are determined by `access`, and visibility changes neither.
   */
  get visibility(): Visibility {
    return this.#state.visibility;
  }

  set visibility(newValue: Visibility) {
    const oldValue = this.#state.visibility;
    // writing the current value is not a change, so nothing runs: no *Changing* handler, no enrolment in the
    // transaction, no *Changed* event. The value setter follows the same rule
    if (newValue === oldValue) return;
    transactional((tx) => {
      const alteredValue = this.boundActions?.trigger(VisibilityChangingAction, this, newValue, oldValue);
      // a handler that aborted the run cancels the write: nothing is written and nothing is announced
      if (alteredValue instanceof AbortEventHandlingException) return;
      const written = alteredValue ?? newValue;
      if (!isVisibility(written))
        throw new Error(`${describe(written)} is not a visibility: ${listOf(visibilityValues)}`);
      // a handler that returned the current value refused the write
      if (written === oldValue) return;
      tx.touch(this);
      // the commit announces the net change: the value before the transaction's first write against the last one
      if (this.#raw.announcedVisibility === undefined) this.#raw.announcedVisibility = oldValue;
      this.#state.visibility = written;
      tx.markFlagsDirty(this);
    });
  }

  /**
   * What this element accepts and what it sends: `'editable'` and `'readonly'` send its value, `'disabled'` sends
   * nothing and `'disabled-null'` sends `null`, and only `'editable'` accepts input. The validators run over what
   * the element sends, and only where it is sent at all (see `effectiveAccess`), so a change of access runs them
   * again on this element and below it.
   */
  get access(): Access {
    return this.#state.access;
  }

  set access(newValue: Access) {
    const oldValue = this.#state.access;
    // as with visibility: writing the current value is not a change, and nothing runs
    if (newValue === oldValue) return;
    transactional((tx) => {
      const alteredValue = this.boundActions?.trigger(AccessChangingAction, this, newValue, oldValue);
      // as with visibility: a handler that aborted the run cancels the write
      if (alteredValue instanceof AbortEventHandlingException) return;
      const written = alteredValue ?? newValue;
      if (!isAccess(written)) throw new Error(`${describe(written)} is not an access: ${listOf(accessValues)}`);
      // a handler that returned the current access cancels the write
      if (written === oldValue) return;
      const wasEnabled = this.enabled;
      const willBeEnabled = written === 'editable';
      if (willBeEnabled !== wasEnabled) {
        // enabled is read from access, so a handler that returns the current enabled cancels the write of an access
        // that would change it
        const enabledAnswer = this.boundActions?.trigger(EnabledChangingAction, this, willBeEnabled, wasEnabled);
        if (enabledAnswer instanceof AbortEventHandlingException) return;
        if (enabledAnswer != null && typeof enabledAnswer !== 'boolean') {
          throw new Error(`${describe(enabledAnswer)} is not what an EnabledChangingAction answers with: a boolean`);
        }
        if (enabledAnswer === wasEnabled) return;
      }
      tx.touch(this);
      const oldContribution = this.contribution;
      const counted = this.countsInContainer;
      const below = this.effectiveAccessBelow();
      this.#state.access = written;
      this.revalidateWhereChanged(below);
      // a leaf's validators run here, over what it now sends; a container's run at the commit, where what it sends
      // is composed
      if (!this.composesValue) this.boundActions?.triggerEager(this, this.contribution, oldContribution);
      // what the element sends changed, so the commit compares its contribution and that of every container above
      // it again; what any of them holds did not change
      this.contributionChanged(tx, counted);
      if (this.#raw.announcedAccess === undefined) this.#raw.announcedAccess = oldValue;
      tx.markFlagsDirty(this);
    });
  }

  /**
   * The access of this element after the containers above it are applied. A container that sends nothing or `null`
   * sends none of its members, so below a `'disabled'` or `'disabled-null'` container every element is
   * `'disabled'`; below a `'readonly'` one an `'editable'` element is `'readonly'`. Otherwise it is the element's
   * own access.
   *
   * It determines whether the element's validators run: an element whose effective access is `'disabled'` is not
   * sent, so its validators produce no result and it has none of their errors. Otherwise they run over what the
   * element sends: its value, or `null`.
   */
  get effectiveAccess(): Access {
    const own = this.access;
    const above = this.parent?.effectiveAccess;
    if (above === 'disabled' || above === 'disabled-null') return 'disabled';
    if (above === 'readonly' && own === 'editable') return 'readonly';
    return own;
  }

  /**
   * Whether `effectiveAccess` is `'disabled'`, read from the untracked state. A validator reads it on every run,
   * where nothing renders from the result and a tracked walk up the containers would add a tracked read per level
   * to every write.
   */
  [SentNowhere](): boolean {
    if (this.#raw.access === 'disabled') return true;
    for (let above = this.#raw.parent; above; above = above.#raw.parent) {
      if (above.#raw.access === 'disabled' || above.#raw.access === 'disabled-null') return true;
    }
    return false;
  }

  /**
   * True if `access` is `'editable'`: the element accepts input. It reads only `access` and concerns input, not
   * data: a `'readonly'` element is not enabled and still sends its value. What an element sends is read from
   * `access`.
   */
  get enabled(): boolean {
    return this.access === 'editable';
  }

  /**
   * True if `effectiveAccess` is `'editable'`: this element and every container above it accept input. A rendering
   * layer reads this instead of walking the parent chain; the inputs of members inside a container that is not
   * editable read false here.
   */
  get effectiveEnabled(): boolean {
    return this.effectiveAccess === 'editable';
  }

  /** The effective access of this element and of every element below it, read before a change that may move it. */
  private effectiveAccessFromHere(): Map<FieldBase, Access> {
    const seen = this.effectiveAccessBelow();
    seen.set(this, this.effectiveAccess);
    return seen;
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
   * Runs the validators again on every element whose effective access changed since `before` was read: an element
   * that is no longer sent loses their errors, and one that is now sent is validated over what it sends.
   */
  private revalidateWhereChanged(before: Map<FieldBase, Access>): void {
    before.forEach((access, element) => {
      if (element.effectiveAccess !== access) element.rerunEagerActions();
    });
  }

  /**
   * What this element sends to its container's `value` or `fullValue`: its own value, `null`, or nothing. Every
   * container composes its values through this method.
   *
   * `fullValue` contains everything the form holds, so every element sends its value there. `value` contains what
   * the form sends, determined by `access`: `'disabled'` omits the element and `'disabled-null'` sends `null`,
   * whatever a container holds below it.
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

  /** What `child` sends to this container; a protected-access bridge like `childComposesValue`. */
  protected childSerializesAs(child: FieldBase, purpose: 'value' | 'fullValue'): 'value' | 'null' | 'omit' {
    return child.serializesAs(purpose);
  }

  /**
   * What this element sends to its container's `value`: its value where its access sends it, `null` for
   * `'disabled-null'`, and `undefined` for `'disabled'`, whose key or row is omitted. The element's validators run
   * over it, and `ContributionChangedAction` reports it.
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
   * The value `ValueChangedAction` reports for this element: its value. A container holds every member's value
   * whatever the member sends, so on a container it is its `fullValue`.
   */
  protected get holding(): any {
    return this.value;
  }

  /**
   * Whether the container holding this element counts its validity: true for every element that sends something,
   * `null` included. A `'disabled'` element sends nothing, so it is not counted, neither for an error written by
   * hand nor for one from a validator (validators do not run on it).
   */
  private get countsInContainer(): boolean {
    return this.serializesAs('value') !== 'omit';
  }

  /**
   * Processes a change of what this element sends: the element is enrolled so the commit compares its contribution
   * and recomputes its validity, the container's value is rebuilt, and an invalid element is added to or removed
   * from the container's invalid count as it starts or stops being counted.
   */
  private contributionChanged(tx: Transaction, wasCounted: boolean): void {
    tx.markValueChanged(this, false);
    tx.markValidityDirty(this);
    this.bumpValueVersion();
    const holder = this.container;
    if (!holder) return;
    const counted = this.countsInContainer;
    if (counted !== wasCounted && !this.#raw.valid) {
      tx.touch(holder);
      // for the invalid count, an invalid element that stops being counted is one that became valid, and vice versa
      holder.childValidityChanged(!counted);
      tx.markValidityDirty(holder);
    }
    this.parent!.notifyValueChanged();
  }

  /**
   * True for an element whose value is composed of its members' values. The commit builds such a value only if
   * something receives it, compares it by content (not identity), and runs the element's own validators with the
   * announcement: a container's validators read the composed value, which exists only after the members have been
   * written. A leaf's validators run at the write, so its announcement runs no eager pass.
   */
  protected get composesValue(): boolean {
    return false;
  }

  /**
   * Whether `child` composes its value from its own members. A container uses it to distinguish a nested container
   * from a leaf without knowing the child's class, as with `resetChild`.
   */
  protected childComposesValue(child: FieldBase): boolean {
    return child.composesValue;
  }

  /**
   * Announces what this element holds and what it sends at the end of the transaction. Each pair is (now, at the
   * last announcement), so a value that went A -> B -> A within the transaction is not announced. Events that
   * describe an operation (an item added, an item removed) are emitted first, in the order the operations happened.
   *
   * A container's validators read what it sends, which is composed here, so they run first, if it changed; a
   * leaf's ran at the write. `ValueChangedAction` reports what the element holds, and `ContributionChangedAction`
   * what it sends to its container.
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

    // what a container holds is composed only if something receives it; a leaf's is its value, with no composition.
    // The announced value is recorded before the event: a change a handler makes is a change of its own, compared
    // against this announcement
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
   * Records what this element holds and sends as last announced, so the following commit announces no change of
   * either. A construction calls it over its final state, as does `rebind()`.
   */
  protected recordAnnounced(): void {
    // a baseline is composed only if something receives the announcement it is compared for; a registration that
    // adds a listener later re-reads it (refreshPreviousValue), and a leaf's value needs no composition
    const actions = this.boundActions;
    if (!this.composesValue || actions?.willTrigger(ValueChangedActionClassIdentifier)) {
      this.#raw.announcedValue = this.holding;
    }
    if (actions?.willTrigger(ContributionChangedActionClassIdentifier))
      this.#raw.announcedContribution = this.contribution;
    if (this.composesValue && actions?.hasEager) this.#raw.validatedValue = this.contribution;
  }

  /**
   * Computes the validity this element ends the transaction with and announces a change of it. The container is
   * updated first, so a handler reads an invalid count that already includes this element, and the container is
   * enrolled in the same transaction: its validity depends on its members', so a member whose validity changes
   * without a value change (an asynchronous validator, an error written by hand) makes the container recompute its
   * own. The transaction settles the deepest element first, so a container is settled after its members.
   */
  /**
   * Announces the net change of access, enabled and visibility over the transaction: `AccessChangedAction` and
   * `EnabledChangedAction` where the access differs from the one before the transaction's first write of it, and
   * `VisibilityChangedAction` likewise. A value that went back to where it started announces nothing.
   */
  protected [TxAnnounceFlags](): void {
    const raw = this.#raw;
    const previousAccess = raw.announcedAccess;
    if (previousAccess !== undefined) {
      raw.announcedAccess = undefined;
      const access = raw.access;
      if (access !== previousAccess) {
        this.boundActions?.trigger(AccessChangedAction, this, access, previousAccess);
        const enabled = access === 'editable';
        const wasEnabled = previousAccess === 'editable';
        if (enabled !== wasEnabled) this.boundActions?.trigger(EnabledChangedAction, this, enabled, wasEnabled);
      }
    }
    const previousVisibility = raw.announcedVisibility;
    if (previousVisibility !== undefined) {
      raw.announcedVisibility = undefined;
      if (raw.visibility !== previousVisibility) {
        this.boundActions?.trigger(VisibilityChangedAction, this, raw.visibility, previousVisibility);
      }
    }
  }

  protected [TxSettleValidity](tx: Transaction): void {
    const oldValid = this.#raw.valid;
    const newValid = this.countedValid;
    if (newValid === oldValid) return;
    tx.touch(this);
    this.#raw.valid = newValid;
    // the validity goes to the container that holds this element; release clears the link, so a removed row does
    // not change any invalid count
    const holder = this.container;
    // an element that sends nothing is not in its container's invalid count, so its validity changes nothing above
    if (holder && this.countsInContainer) {
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
    // reads the slot directly: the errors getter adds the element to an open transaction, and reading validity
    // changes nothing a rollback has to restore
    return this.#state.errors.length === 0;
  }

  get fullValue(): T {
    return this.value;
  }

  get isChanged(): boolean {
    return !isEqual(this.value, this.originalValue);
  }

  /**
   * Sets up a new element as a binding of `source`: it records the declaration, copies the extended properties of
   * `source`, uses the actions `source` has, and runs the eager ones over the value it was built with. Extended
   * properties in `overrides` are written over the copied ones before the eager pass, so an action that reads one
   * sees the binding's final value. The actions are the same instances `source` holds, and each is bound to this
   * element (`boundToBinding`), so an action serving several bindings has a reference to each of them.
   */
  protected boundFrom(source: FieldBase<any, X>, newValue: any, oldValue: any, overrides?: object): void {
    if (overrides) refuseEnabled(overrides);
    this.#raw.declaration = source.declaration;
    noteInternal(this);
    const extended: Partial<X> = { ...source.extra, ...(overrides && this.extendedOf(overrides)) };
    if (!isEmpty(extended)) this.setExtendedValues(extended);
    const declaration = this.declaration;
    declaration.noteBinding(this);
    // the binding uses the declaration's map itself, not a copy, so a rule registered on the declaration after this
    // binding was made reaches it too. A declaration with nothing registered has no map; the map it creates later
    // is assigned to this element then
    const actions = declaration._actions;
    if (!actions) return;
    this._actions = actions;
    actions.bindTo(this);
    // the construction recorded no baseline for listeners, because the element had none at that point
    this.recordAnnounced();
    actions.triggerEager(this, newValue, oldValue);
  }

  /**
   * Registers the actions a constructor received in its parameters, without the eager trigger: a constructor ends
   * with a single this.actions.triggerEager(...) over the finished value. With the trigger, an eager action would
   * also run once per registration, over a partially built field.
   */
  protected registerInitialActions(actions: FieldActionBase[]): void {
    actions.forEach((action) => {
      this.actions.register(action);
      action.boundToBinding(this);
    });
  }

  registerAction(action: FieldActionBase): this {
    transactional((tx) => {
      // the baseline of a change the transaction has yet to announce is kept: the element is already enrolled to
      // announce that change, and moving the baseline to the current value would cancel the announcement
      if (!tx.willAnnounceValue(this)) this.refreshPreviousValue();
      this.actions.register(action);
      this.registered(tx, action);
    });
    return this;
  }

  /**
   * Registers `action` so that `before` wraps it: `before` calls it through the `supr` argument. This adds an
   * action to an existing chain inside a handler that is already registered, which registration order alone cannot
   * do. `before` must be registered on this element under the same identifier.
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
   * Unregisters `action` from this element and returns whether it was registered. The registration is shared with
   * the element's declaration and every binding made from it, so the action is removed from all of them; elements
   * of other declarations that the same instance is registered on keep it. A validator removes the errors it put on
   * the elements it is removed from, so their validity reflects only the remaining validators.
   */
  unregisterAction(action: FieldActionBase): boolean {
    let dropped = false;
    transactional((tx) => {
      const actions = this.boundActions;
      if (!actions) return;
      dropped = actions.unregister(action);
      if (!dropped) return;
      tx.touch(this);
      // a run still in flight may belong to the removed validator, and its result must not be applied
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
   * Binds a newly registered `action` to the existing bindings and registers an undo for a rollback. The
   * registration is not in the state slots the snapshot covers, so it registers its own undo.
   */
  private registered(tx: Transaction, action: FieldActionBase): void {
    // the action is registered on the declaration, so it applies to every binding made from it, existing and future.
    // An eager action runs over each existing binding's value immediately; its whole handler chain runs, because
    // actions registered before it may wrap it and its own `supr` calls them.
    const elements = this.boundElements;
    elements.forEach((element) => {
      action.boundToBinding(element);
      if (action.eager) {
        // records the value the action runs over as the one a container's validators last ran over
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
    // an element with no map has nothing registered, and ActionsMap.trigger returns null in that case
    const actions = this.boundActions;
    return actions ? actions.trigger(actionClass, this, ...params) : null;
  }

  /**
   * Generation counter of the validators attached to this field. A Validator reads it when a run starts and drops
   * a result whose epoch no longer matches, so a validation still in flight when clearValidators() is called
   * cannot push an error onto a field that no longer has the validator that produced it.
   */
  get [ValidationEpoch](): number {
    return this.#state.validationEpoch;
  }

  clearValidators(): void {
    transactional((tx) => {
      tx.touch(this);
      this.#state.validationEpoch++;
      const actions = this.boundActions;
      if (actions) {
        // each release names the element, because the same instance stays registered on elements of other
        // declarations
        const elements = this.boundElements;
        actions.validators.forEach((validator) => {
          actions.unregister(validator);
          tx.whenRolledBack(() => {
            actions.register(validator);
            elements.forEach((element) => validator.boundToBinding(element));
          });
          // each validator removes the errors it put on every element it validated
          elements.forEach((element) => validator.unregisterFrom(element));
        });
      }
      this.errors = [];
      // the errors are cleared before the recomputation, so the commit computes validity over the cleared state and
      // the change follows the usual path: ValidChangedAction fires and the parent recomputes its validity
      this.validate();
    });
  }
}
