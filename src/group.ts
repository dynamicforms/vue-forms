import { isEmpty } from 'lodash-es';

import { type GroupSlots, groupSlots } from './element-state';
import { Field } from './field';
import { FieldBase } from './field-base';
import { type Extras, IBindParams, IFieldParams } from './field.interface';
import { transactional, TxCapture, type TxSnapshot } from './transaction';

export type GenericFieldsInterface = Record<string, FieldBase>;
// Utility type converting a field structure into the matching value structure.
// The indexed access reads each field's value getter, so a nested Group contributes its own value structure and
// a List contributes its row array. Inferring from FieldBase<infer U> instead would pick up the value setter,
// which is deliberately wider than the getter on Group.
export type FieldsToValues<T extends GenericFieldsInterface> = {
  [K in keyof T]: T[K]['value'];
};

/**
 * What Group.fullValue reads back. The indexed access reads each field's fullValue getter, so a nested group
 * contributes its own full structure rather than the partial one its `value` builds, and the recursion carries
 * the guarantee all the way down: every key is present and none of them is null.
 */
export type FieldsToFullValues<T extends GenericFieldsInterface> = {
  [K in keyof T]: T[K]['fullValue'];
};

/**
 * What Group.value reads back: the values of the fields that serialize, or null when none does. Every key is
 * optional, because a field that is disabled is left out of the object the group builds.
 */
export type GroupValue<T extends GenericFieldsInterface> = Partial<FieldsToValues<T>> | null;
/** what Group.value and the Group constructor accept: keys left out are simply not assigned */
export type GroupValueInput<T extends GenericFieldsInterface> = Partial<FieldsToValues<T>> | null;

/**
 * The guarded view of a group's member map, held outside the group it belongs to. It is a proxy over the very map
 * the group writes into, so an element carrying it as a property would be walked twice by JSON.stringify and by
 * lodash isEqual, both of which go down a structure over own keys.
 */
const fieldsViews = new WeakMap<object, GenericFieldsInterface>();

/**
 * The handler behind that view. Every read goes through `track` first, which reads the group's name array - the
 * part of the state that says which members the group holds - so a reader inside an effect re-runs when
 * addField() or removeField() changes the set; the map itself is beside the state, and a write to it would
 * otherwise reach nobody.
 *
 * Every write is refused: a field assigned into the map, or one deleted out of it, would never receive parent,
 * fieldName or change notifications, and the group would go on counting the verdict of a member it no longer
 * holds. addField() and removeField() are the way the set of members changes.
 */
const fieldsAreReadOnly = (track: () => number): ProxyHandler<GenericFieldsInterface> => ({
  get(target, key, receiver) {
    track();
    return Reflect.get(target, key, receiver);
  },
  has(target, key) {
    track();
    return Reflect.has(target, key);
  },
  ownKeys(target) {
    track();
    return Reflect.ownKeys(target);
  },
  getOwnPropertyDescriptor(target, key) {
    track();
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
  set(_target, key) {
    throw new TypeError(`fields.${String(key)} cannot be assigned: use addField() to give the group a member`);
  },
  defineProperty(_target, key) {
    throw new TypeError(`fields.${String(key)} cannot be redefined: use addField() to give the group a member`);
  },
  deleteProperty(_target, key) {
    throw new TypeError(`fields.${String(key)} cannot be deleted: use removeField() to take a member out`);
  },
});

export class Group<
  T extends GenericFieldsInterface = GenericFieldsInterface,
  X extends object = Extras,
> extends FieldBase<GroupValue<T>, X> {
  get [Symbol.toStringTag](): string {
    return 'Group';
  }

  protected get state(): GroupSlots<GroupValue<T>> {
    return super.state as GroupSlots<GroupValue<T>>;
  }

  protected get raw(): GroupSlots<GroupValue<T>> {
    return super.raw as GroupSlots<GroupValue<T>>;
  }

  private readonly _fields: T;

  constructor(fields: T, params?: IFieldParams<GroupValueInput<T>, X>) {
    super(groupSlots<GroupValue<T>>());

    if (!Group.isValidFields(fields)) throw new Error('Invalid fields object provided');
    // the backing map has no prototype: a field may be named after an Object.prototype member, and on an
    // ordinary object a `__proto__` key would go to the inherited setter instead of becoming a field
    this._fields = Object.create(null) as T;

    // construction is one transaction: the members are taken and written before anything is announced, and a
    // member that refuses to be taken - one another container already holds - leaves behind no half-built group
    transactional(() => {
      Object.entries(fields).forEach(([name, field]) => this.addField(name, field));

      if (params) {
        const { value: paramValue, validators, actions, ...otherParams } = params;
        // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
        // guards them too
        this.registerInitialActions([...(validators || []), ...(actions || [])]);
        this.assignParams(otherParams);
        // an assignment is made only for a value the caller actually supplied, and undefined is not one: spreading
        // an optional property yields an undefined value, and assigning it would push null into every member and
        // then baseline that emptied state as the original, so the group would report itself unchanged over values
        // its members never held. An explicit null is a supplied value and does clear the members.
        if (paramValue !== undefined) this.assignMembers(paramValue as GroupValueInput<T>);
        else if (this.originalValue !== undefined) this.assignMembers(this.originalValue);
      }

      // the members are in place and hold their values, so this is the record they were promised: a member whose
      // eager pass ran before the group existed - every member of a bound group - gets it here
      this.completeRecords();

      this.constructed(params);

      // reading value walks every member and builds an object, so it is read once here and the result serves
      // every reader below
      const constructedValue = this.value;
      if (this.originalValue === undefined) this.originalValue = Group.baseline(constructedValue);

      // the value a construction ends on is the group's first statement about itself rather than a change of one:
      // recording it as announced is what keeps the commit from reporting the members' assignment as a change of
      // the group, and it is what the first later change of a member is reported against
      this.raw.announcedValue = constructedValue;

      this.boundActions?.triggerEager(this, constructedValue, this.originalValue);
      this.validate();
    });
  }

  /**
   * The name array is copied as well: a rollback puts back the set of members the group held, not the array it
   * went on to hold.
   */
  protected [TxCapture](): TxSnapshot {
    const captured = super[TxCapture]();
    captured.fieldNames = [...this.raw.fieldNames];
    return captured;
  }

  /**
   * The copy of a built value that serves as a baseline. The value getter hands out one object per version, and
   * a baseline holding that same object would report every value as its own original.
   */
  private static baseline<V extends GenericFieldsInterface>(value: GroupValue<V>): GroupValue<V> {
    return value == null ? value : { ...value };
  }

  /**
   * Takes `field` into this group under `fieldName`. The group ends up holding it exactly as it holds a field the
   * constructor was given: the field carries the back-reference and the name, its verdict counts towards the
   * group's, and a rule of the field's that names another member of the form reaches it here.
   *
   * The change is announced through the ordinary path, so a group whose value the new field adds to says so once
   * the transaction closes, and its verdict is re-formed over the members it now holds. The baseline behind
   * `isChanged` is not rewritten: a group that gains a field holds something its original value does not carry,
   * and reports itself changed until `originalValue` is written.
   *
   * @throws Error where this group already holds a field under `fieldName`.
   * @throws TypeError where `field` already belongs to a container - pass a `bind()` of it instead.
   */
  addField(fieldName: string, field: FieldBase): this {
    transactional((tx) => {
      if (Object.hasOwn(this._fields, fieldName)) {
        throw new Error(`Field ${fieldName} is already in this form`);
      }
      // takeChild refuses a field that another group or list already holds, and installs the back-reference and
      // the name together
      this.takeChild(field, fieldName);
      tx.touch(this);
      Group.setEntry(this._fields, fieldName, field);
      // the map is not part of the state a snapshot covers, so the removal is handed to the transaction as its own
      // undo; the name array is in the state and a rollback puts it back with everything else
      tx.whenRolledBack(() => Group.dropEntry(this._fields, fieldName));
      this.state.fieldNames.push(fieldName);
      // the field now reaches the form this group stands in, so a rule of its own that names a field up there -
      // one no record below could answer - is run over it here
      this.completeRecords(field);
      this.bumpValueVersion();
      this.notifyValueChanged();
    });
    return this;
  }

  /**
   * Takes the field held under `fieldName` out of this group and hands it back, answering undefined where the
   * group holds no field of that name. The field is released whole: the back-reference and the name are gone, its
   * verdict and its runs in flight no longer count towards the group's, and it is free to be taken by another
   * container. What it holds - its value, its errors, the change history behind `isChanged` - is its own to report.
   *
   * The change is announced through the ordinary path, so the group's value and verdict settle over the members it
   * has left. The baseline behind `isChanged` is not rewritten, the same way it is not on `addField`.
   */
  removeField(fieldName: string): FieldBase | undefined {
    let removed: FieldBase | undefined;
    transactional((tx) => {
      if (!Object.hasOwn(this._fields, fieldName)) return;
      const field: FieldBase = this._fields[fieldName];
      tx.touch(this);
      this.releaseChild(field);
      Group.dropEntry(this._fields, fieldName);
      tx.whenRolledBack(() => Group.setEntry(this._fields, fieldName, field));
      this.state.fieldNames.splice(this.state.fieldNames.indexOf(fieldName), 1);
      this.bumpValueVersion();
      this.notifyValueChanged();
      removed = field;
    });
    return removed;
  }

  /**
   * Writes one entry of the member map. The map is typed by the fields interface, which names the members a group
   * of that type holds and no others, so both here and in dropEntry it is reached as the plain record it is.
   */
  private static setEntry(fields: GenericFieldsInterface, fieldName: string, field: FieldBase): void {
    (fields as Record<string, FieldBase>)[fieldName] = field;
  }

  /** Drops one entry out of the member map. */
  private static dropEntry(fields: GenericFieldsInterface, fieldName: string): void {
    delete (fields as Record<string, FieldBase | undefined>)[fieldName];
  }

  private static isValidFields(flds: unknown): flds is Record<string, FieldBase> {
    function isFieldAll(field: unknown): field is FieldBase {
      return field instanceof FieldBase;
    }

    return typeof flds === 'object' && flds !== null && Object.entries(flds).every(([, field]) => isFieldAll(field));
  }

  static createFromFormData(data: Record<string, any> | null): Group {
    if (data instanceof FieldBase) {
      throw new Error('data is already a Form structure, should be a simple object');
    }
    return new Group(
      data == null ? {} : Object.fromEntries(Object.entries(data).map(([key, value]) => [key, new Field({ value })])),
    );
  }

  field<K extends keyof T>(fieldName: K): T[K] | null {
    return this._fields[fieldName] ?? null;
  }

  /**
   * The typed map of this group's members. What it hands out is a view over the map the group holds: reading it
   * reaches the members themselves, and every write to it is refused - addField() and removeField() are what
   * change the set. The view is built the first time something asks for it.
   *
   * Reading through it is a tracked read of the set of members, so a template rendering off `group.fields`
   * re-renders when a field is added or removed; what a member itself holds is tracked by that member.
   */
  get fields(): T {
    let view = fieldsViews.get(this);
    if (!view) {
      view = new Proxy(
        this._fields,
        fieldsAreReadOnly(() => this.state.fieldNames.length),
      );
      fieldsViews.set(this, view);
    }
    return view as T;
  }

  protected get members(): FieldBase[] {
    return this.raw.fieldNames.map((name) => this._fields[name]);
  }

  get value(): GroupValue<T> {
    // the version is a tracked read and the cache is not, so a reader that is answered from the cache still
    // depends on every write below this group without the walk being repeated for it
    const version = this.valueVersion;
    if (this.raw.cachedValueVersion === version) return this.raw.cachedValue;

    // accumulate without a prototype so a field named `__proto__` is stored instead of reassigning the
    // accumulator's prototype; the spread on return hands back an ordinary object
    const val = Object.create(null) as Record<string, any>;
    Object.entries(this._fields).forEach(([name, field]) => {
      const fieldValue = field.value;
      // a disabled field does not serialize, and a disabled container is the one exception: a Group or a List
      // that is disabled is kept while what its own members compose is non-empty, because a member of it that is
      // enabled holds a value the form still has to carry. Empty, it is left out like any other disabled field.
      if (field.enabled || (this.childComposesValue(field) && !isEmpty(fieldValue))) val[name] = fieldValue;
    });
    // the object outlives the read that built it - the next reader is answered with the very same one - so it is
    // frozen: a caller writing into it would change what the group reports without any member holding that value
    const built = isEmpty(val) ? null : (Object.freeze({ ...val }) as Partial<FieldsToValues<T>>);
    this.raw.cachedValue = built;
    this.raw.cachedValueVersion = version;
    return built;
  }

  /**
   * Writes the members that the given value carries. The members are written one by one and the group says
   * nothing in between: the transaction the assignment runs in measures the group's own value and its own verdict
   * once, over the finished set, and announces each at most once.
   */
  private assignMembers(newValue: GroupValueInput<T>) {
    transactional(() => {
      Object.entries(this._fields).forEach(([name, field]) => {
        if (newValue == null || Object.hasOwn(newValue, name)) {
          field.value = newValue == null ? null : newValue[name];
        }
      });
    });
  }

  set value(newValue: GroupValueInput<T>) {
    transactional((tx) => {
      this.assignMembers(newValue);
      tx.markValidityDirty(this);
    });
  }

  /**
   * Members are reset one by one rather than assigned as a whole value: the value setter writes only the keys the
   * value carries, while a member the value leaves out has to end up holding what the template gives it. `source`
   * supplies that per member, so a group reset from the template it was bound from matches a fresh binding of it.
   */
  protected resetTo(source: FieldBase, value: any): void {
    const template = source as Group<T>;
    transactional((tx) => {
      tx.touch(this);
      if (this.errors.length) this.errors = [];
      Object.entries(this._fields).forEach(([name, field]) => {
        // a key the value does not carry leaves the member to the template; a null value clears every member,
        // the same way assigning null does
        let memberValue: any;
        if (value === null) memberValue = null;
        else if (value !== undefined && Object.hasOwn(value, name)) memberValue = value[name];
        this.resetChild(field, template.field(name) ?? field, memberValue);
      });
      const built = this.value;
      // a group brought to the state a fresh one would be in makes no statement of its own about the change: the
      // container that reset it announces the whole of it
      this.raw.announcedValue = built;
      this.originalValue = Group.baseline(built);
      super.validate(true);
    });
  }

  get touched(): boolean {
    return Object.values(this._fields).some((field) => field.touched);
  }

  set touched(touched: boolean) {
    transactional(() => {
      Object.values(this._fields).forEach((field) => {
        field.touched = touched;
      });
    });
  }

  get fullValue(): FieldsToFullValues<T> {
    const value = Object.create(null) as Record<string, any>;
    Object.entries(this._fields).forEach(([name, field]) => {
      value[name] = field.fullValue;
    });
    return { ...value } as FieldsToFullValues<T>;
  }

  /**
   * Records that a member changed its value, so that the transaction in progress works out at commit what this
   * group's own value became and announces it once. A mutation method calls it itself; you rarely need to.
   */
  notifyValueChanged() {
    this.propagateValueChanged();
  }

  protected get composesValue(): boolean {
    return true;
  }

  /**
   * A group with nothing listening for its value does not compose one at all, so the copy it holds is from before
   * the changes nobody received. A registration that adds a listener brings it up to date here, and what the
   * listener is then told about is the change that follows it.
   */
  protected refreshPreviousValue(): void {
    this.raw.announcedValue = this.value;
  }

  get valid() {
    return this.validRead;
  }

  protected composeValid(): boolean {
    // the names are read through the tracked view, so a member added or removed re-forms the verdict; the members
    // themselves are reached through the map, which is beside the state
    return this.state.errors.length === 0 && this.state.fieldNames.every((name) => this._fields[name].valid);
  }

  get busy() {
    return this.busyRead;
  }

  protected composeBusy(): boolean {
    return this.state.fieldNames.some((name) => this._fields[name].busy);
  }

  validate(revalidate: boolean = false) {
    transactional(() => {
      // the members are revalidated first and the group forms its own verdict afterwards, over the finished set:
      // a member that turns valid while a later one is still to be checked announces nothing until the
      // transaction closes, so the group never reports a verdict over a half-revalidated set
      if (revalidate) Object.values(this._fields).forEach((field) => field.validate(true));
      super.validate(revalidate);
    });
  }

  /**
   * States that `res` was built from the members handed to it. A subclass whose constructor takes something other
   * than `(fields, params)` - one that composes its own members and passes them to super - never sees them, and
   * would answer with a binding carrying the declaration's data instead of the record's. That is a difference no
   * reader would find, so it is refused here rather than returned.
   */
  private static assertTookFields(res: Group<any, any>, fields: object, name: string): void {
    // the members are compared by identity rather than by name: a subclass that composes its own set arrives at
    // the same names, and it is the instances carrying the record's data that have to be the ones it took on
    const asked = Object.entries(fields) as [string, FieldBase][];
    const got = res.raw.fieldNames;
    if (asked.length === got.length && asked.every(([key, field]) => res._fields[key] === field)) return;
    throw new TypeError(
      `${name}.bind() built an element that did not take the members it was given, so the binding would carry ` +
        `the declaration's data. A subclass whose constructor does not take (fields, params) has to override ` +
        'bind() and construct itself.',
    );
  }

  bind(data?: GroupValueInput<T>, overrides?: IBindParams<GroupValueInput<T>, X>): Group<T, X> {
    const newFields = Object.create(null) as T;
    Object.entries(this._fields).forEach(([name, field]) => {
      newFields[name as keyof T] = field.bind() as any;
    });
    // construction goes through this.constructor so that a subclass binds into its own type
    const Ctor = this.constructor as new (fields: T, params?: IFieldParams<GroupValueInput<T>, X>) => Group<T, X>;
    const res = new Ctor(newFields, {
      // data is what the caller supplied, and undefined is not supplied; an explicit null is, and clears
      value: data !== undefined ? data : this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    } as IFieldParams<GroupValueInput<T>, X>);
    Group.assertTookFields(res, newFields, this.constructor.name);
    // the constructor primed announcedValue with the value the members ended up holding, and nothing has run since
    res.boundFrom(this, res.raw.announcedValue, res.originalValue, overrides);
    return res;
  }

  /**
   * A record need not name every member: a key it leaves out is taken from the declaration, the same way a member
   * the constructor is given no value for takes the one it was declared with.
   */
  rebind(data: GroupValueInput<T>): this {
    return super.rebind(data as GroupValue<T>);
  }
}

export type NullableGroup = Group | null;
