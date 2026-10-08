import { isEmpty } from 'lodash-es';

import type { Action } from './action';
import { Container } from './container';
import { type GroupSlots, groupSlots } from './element-state';
import { Field } from './field';
import { FieldBase } from './field-base';
import { type Extras, IBindParams, IFieldParams } from './field.interface';
import { transactional, TxCapture, type TxSnapshot } from './transaction';

export type GenericFieldsInterface = Record<string, FieldBase>;

/** The keys of the members that send something: every member except an `Action`. */
type DataKeys<T extends GenericFieldsInterface> = {
  [K in keyof T]: T[K] extends Action<any, any> ? never : K;
}[keyof T];

/**
 * Converts a field structure into the matching value structure. The indexed access reads each element's value
 * getter, so a nested Group sends its own value structure and a List sends its row array; inferring from
 * FieldBase<infer U> would use the value setter, which on Group accepts a wider type than the getter returns.
 * Every member may be `null`, because a member whose access is `'disabled-null'` sends `null` in place of its
 * value. An `Action` member sends nothing and has no key.
 */
export type FieldsToValues<T extends GenericFieldsInterface> = {
  [K in DataKeys<T>]: T[K]['value'] | null;
};

/**
 * The type of Group.fullValue. The indexed access reads each element's fullValue getter, so a nested group has its
 * full structure, not the partial one its `value` builds. Every member is present whatever its access, except an
 * `Action`, which holds no data.
 */
export type FieldsToFullValues<T extends GenericFieldsInterface> = {
  [K in DataKeys<T>]: T[K]['fullValue'];
};

/**
 * The type of Group.value: the values of the members that send something, and `{}` if none does. Every key is
 * optional, because a member whose access is `'disabled'` is omitted from the object the group builds.
 */
export type GroupValue<T extends GenericFieldsInterface> = Partial<FieldsToValues<T>>;
/** what Group.value and the Group constructor accept: missing keys are not assigned, and null clears */
export type GroupValueInput<T extends GenericFieldsInterface> = Partial<FieldsToValues<T>> | null;

/**
 * The groups whose constructor is still adding and writing their members. A member's record is completed after the
 * constructor has written the given data, so a rule that reads a sibling runs over that data, not over the values
 * the members were bound with.
 */
const assembling = new WeakSet<object>();

/** the value of a group in which no member sends anything; it is frozen like every value a group builds */
const emptyGroupValue = Object.freeze({});

/**
 * The read-only view of a group's member map, held outside the group. It is a proxy over the map the group writes
 * into, so as a property of the group it would be walked twice by JSON.stringify and by lodash isEqual, which both
 * walk own keys.
 */
const fieldsViews = new WeakMap<object, GenericFieldsInterface>();

/**
 * The handler of that view. Every read calls `track` first, which reads the group's name array (the part of the
 * state that lists the members), so a reader inside an effect re-runs when addField() or removeField() changes the
 * set of members; the map itself is outside the reactive state, and a write to it alone triggers no effect.
 *
 * Every write throws a TypeError: an element assigned into the map or deleted from it would not get its parent,
 * fieldName or change notifications updated, and the group would keep counting the validity of a member it no
 * longer holds. Use addField() and removeField() to change the set of members.
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
> extends Container<GroupValue<T>, X> {
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
    // the backing map has no prototype: a field may be named after an Object.prototype member, and on a regular
    // object a `__proto__` key would call the inherited setter instead of becoming a field
    this._fields = Object.create(null) as T;

    // construction is one transaction: the members are added and written before anything is announced, and a
    // member that cannot be added (another container already holds it) leaves no partially built group
    transactional(() => {
      assembling.add(this);
      try {
        Object.entries(fields).forEach(([name, field]) => this.addField(name, field));

        if (params) {
          const { value: paramValue, validators, actions, ...otherParams } = params;
          // actions are registered before the remaining parameters are assigned, so a *Changing* action supplied
          // here also applies to those assignments
          this.registerInitialActions([...(validators || []), ...(actions || [])]);
          this.assignParams(otherParams);
          // the value is assigned only if supplied, and undefined counts as not supplied (spreading an optional
          // property yields undefined): assigning it would write null into every member and record that cleared
          // state as the original, so the group would report itself unchanged over values its members never held.
          // An explicit null is a supplied value and clears the members.
          if (paramValue !== undefined) this.assignMembers(paramValue as GroupValueInput<T>);
          else if (this.originalValue !== undefined) this.assignMembers(this.originalValue);
        }
      } finally {
        assembling.delete(this);
      }

      // the members are in place and hold their values, so their record is complete: a member whose eager pass ran
      // before the group existed (every member of a bound group) runs it again here
      this.completeRecords();

      this.constructed(params);

      // reading value walks every member and builds an object, so it is read once here and reused below
      const constructedValue = this.value;
      if (this.originalValue === undefined) this.originalValue = Group.baseline(constructedValue);

      // the state a construction ends with is the group's initial state, not a change: recording it as announced
      // keeps the commit from announcing the members' assignment as a change of the group, and the first later
      // change of a member is compared against it
      this.recordAnnounced();

      this.boundActions?.triggerEager(this, this.contribution, this.originalValue);
      this.validate();
    });
  }

  /**
   * The name array is copied as well, so a rollback restores the set of members the group held before the
   * transaction.
   */
  protected [TxCapture](): TxSnapshot {
    const captured = super[TxCapture]();
    captured.fieldNames = [...this.raw.fieldNames];
    return captured;
  }

  /**
   * A copy of a built value, used as a baseline. The value getter returns one object per version, and a baseline
   * holding that same object would make every value equal to its original.
   */
  private static baseline<V extends GenericFieldsInterface>(value: GroupValue<V>): GroupValue<V> {
    return value == null ? value : { ...value };
  }

  /**
   * Adds `field` to this group under `fieldName`, in the same state as an element passed to the constructor: the
   * element has the back-reference and the name, its validity counts towards the group's, and a rule of the element
   * that refers to another element of the form is resolved here.
   *
   * The change is announced through the regular path: the group announces its new value when the transaction
   * closes, and its validity is recomputed over its current members. The baseline behind `isChanged` is not
   * rewritten: a group that gains an element holds a value its original value does not contain, and reports itself
   * changed until `originalValue` is written.
   *
   * @throws Error if this group already holds an element under `fieldName`.
   * @throws TypeError if `field` already belongs to a container; pass a `bind()` of it instead.
   */
  addField(fieldName: string, field: FieldBase): this {
    transactional((tx) => {
      if (Object.hasOwn(this._fields, fieldName)) {
        throw new Error(`Field ${fieldName} is already in this form`);
      }
      // takeChild throws for an element another group or list already holds, and sets the back-reference and the
      // name together
      this.takeChild(field, fieldName);
      tx.touch(this);
      Group.setEntry(this._fields, fieldName, field);
      // the map is not in the state a snapshot covers, so the removal is registered as a separate undo; the name
      // array is in the state and a rollback restores it with the rest
      tx.whenRolledBack(() => Group.dropEntry(this._fields, fieldName));
      this.state.fieldNames.push(fieldName);
      // the element is now connected to the form above this group, so a rule of the element that refers to an
      // element there (one no record below can resolve) runs over it here. A group still being constructed
      // completes its members after it has written the given data.
      if (!assembling.has(this)) this.completeRecords(field);
      this.bumpValueVersion();
      this.notifyValueChanged();
    });
    return this;
  }

  /**
   * Removes the element held under `fieldName` from this group and returns it, or returns undefined if the group
   * holds no element of that name. The back-reference and the name are cleared, its validity and its runs in
   * flight no longer count towards the group's, and another container can take it. It keeps its value, its errors
   * and the change history behind `isChanged`.
   *
   * The change is announced through the regular path, so the group's value and validity are recomputed over the
   * remaining members. The baseline behind `isChanged` is not rewritten, as with `addField`.
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
   * Writes one entry of the member map. The map is typed by the fields interface, which lists only the members of
   * that group type, so here and in dropEntry it is cast to a plain record.
   */
  private static setEntry(fields: GenericFieldsInterface, fieldName: string, field: FieldBase): void {
    (fields as Record<string, FieldBase>)[fieldName] = field;
  }

  /** Removes one entry from the member map. */
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
   * The typed map of this group's members. It is a view over the map the group holds: a read returns the members
   * themselves, and every write throws a TypeError (use addField() and removeField()). The view is created on the
   * first read.
   *
   * A read through it is a tracked read of the set of members, so a template that reads `group.fields` re-renders
   * when an element is added or removed; each member tracks its own state.
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

  protected get children(): readonly FieldBase[] {
    // the names are read through the tracked view, so adding or removing a member recomputes what is composed
    // over them; the members are read from the map, which is outside the reactive state
    return this.state.fieldNames.map((name) => this._fields[name]);
  }

  get value(): GroupValue<T> {
    // the version read is tracked and the cache read is not, so a reader served from the cache still depends on
    // every write below this group, without repeating the walk
    const version = this.valueVersion;
    if (this.raw.cachedValueVersion === version) return this.raw.cachedValue;

    // accumulate without a prototype so a field named `__proto__` is stored instead of reassigning the
    // accumulator's prototype; the spread on return produces a regular object
    const val = Object.create(null) as Record<string, any>;
    Object.entries(this._fields).forEach(([name, field]) => {
      switch (this.childSerializesAs(field, 'value')) {
        case 'value':
          val[name] = field.value;
          break;
        case 'null':
          val[name] = null;
          break;
        case 'omit':
          break;
      }
    });
    // the object is shared with later readers, so it is frozen: a write into it would change the group's value
    // without any member holding that value. A group that sends a value sends an object, so a group in which no
    // member sends anything returns {}.
    const built = (isEmpty(val) ? emptyGroupValue : Object.freeze({ ...val })) as GroupValue<T>;
    this.raw.cachedValue = built;
    this.raw.cachedValueVersion = version;
    return built;
  }

  /**
   * Writes the members whose keys the given value contains. The members are written one by one and the group
   * announces nothing in between: the transaction compares the group's value and validity once, after all members
   * are written, and announces each at most once.
   */
  private assignMembers(newValue: GroupValueInput<T>) {
    transactional(() => {
      Object.entries(this._fields).forEach(([name, field]) => {
        // an action holds no data, so a value assigned to the group does not reach it, null included
        if (this.childSerializesAs(field, 'fullValue') === 'omit') return;
        if (newValue == null || Object.hasOwn(newValue, name)) {
          field.value = newValue == null ? null : (newValue as Record<string, any>)[name];
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
   * Members are reset one by one, not assigned as a whole value: the value setter writes only the keys the value
   * contains, while a member missing from the value must take its value from `source`. `source` supplies it per
   * member, so a group reset from the declaration it was bound from matches a new binding of it.
   */
  protected resetTo(source: FieldBase, value: any): void {
    const template = source as Group<T>;
    transactional((tx) => {
      tx.touch(this);
      if (this.errors.length) this.errors = [];
      Object.entries(this._fields).forEach(([name, field]) => {
        // a member whose key is missing from the value takes its value from the template; a null value clears
        // every member, as assigning null does
        // an action holds no data and takes its value from the template, whatever the value contains
        let memberValue: any;
        if (this.childSerializesAs(field, 'fullValue') === 'omit') memberValue = undefined;
        else if (value === null) memberValue = null;
        else if (value !== undefined && Object.hasOwn(value, name)) memberValue = value[name];
        this.resetChild(field, template.field(name) ?? field, memberValue);
      });
      // a reset group announces nothing itself: the container that reset it announces the change
      this.recordAnnounced();
      this.originalValue = Group.baseline(this.value);
      super.validate(true);
    });
  }

  /**
   * Everything the group holds: every member's `fullValue`, whatever the member's access. `value` is what the group
   * sends; `fullValue` is what it holds, and a binding of the group copies it.
   */
  get fullValue(): FieldsToFullValues<T> {
    const value = Object.create(null) as Record<string, any>;
    Object.entries(this._fields).forEach(([name, field]) => {
      if (this.childSerializesAs(field, 'fullValue') !== 'omit') value[name] = field.fullValue;
    });
    return { ...value } as FieldsToFullValues<T>;
  }

  /**
   * Throws a TypeError if `res` was not built from the members passed to it. A subclass whose constructor does not
   * take `(fields, params)` (one that composes its own members and passes them to super) ignores them and would
   * return a binding with the declaration's data instead of the record's. The difference would not be visible, so
   * it throws here.
   */
  private static assertTookFields(res: Group<any, any>, fields: object, name: string): void {
    // the members are compared by identity, not by name: a subclass that composes its own members has the same
    // names, and the check requires the instances that hold the record's data
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
      // undefined data counts as not supplied; an explicit null is supplied and clears. The copied value is what
      // the group holds (fullValue), not what it sends, so a member that sends nothing keeps its data
      value: data !== undefined ? data : (this.fullValue as GroupValueInput<T>),
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
      access: overrides?.access ?? this.access,
      visibility: overrides?.visibility ?? this.visibility,
    } as IFieldParams<GroupValueInput<T>, X>);
    Group.assertTookFields(res, newFields, this.constructor.name);
    res.boundFrom(this, res.contribution, res.originalValue, overrides);
    return res;
  }

  /**
   * A record need not contain every member: a missing key is taken from the declaration, as a member without a
   * value in the constructor keeps the value it was declared with.
   */
  rebind(data: GroupValueInput<T>): this {
    return super.rebind(data as GroupValue<T>);
  }
}

export type NullableGroup = Group | null;
