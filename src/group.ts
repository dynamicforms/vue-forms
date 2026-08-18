import { isEmpty } from 'lodash-es';

import { type ContainerSlots, containerSlots } from './element-state';
import { Field } from './field';
import { FieldBase } from './field-base';
import { IBindParams, IFieldParams } from './field.interface';
import { transactional } from './transaction';

export type GenericFieldsInterface = Record<string, FieldBase>;
// Utility type converting a field structure into the matching value structure.
// The indexed access reads each field's value getter, so a nested Group contributes its own value structure and
// a List contributes its row array. Inferring from FieldBase<infer U> instead would pick up the value setter,
// which is deliberately wider than the getter on Group.
export type FieldsToValues<T extends GenericFieldsInterface> = {
  [K in keyof T]: T[K]['value'];
};

/** what Group.value reads back: the full field map, or null when no field serializes */
export type GroupValue<T extends GenericFieldsInterface> = FieldsToValues<T> | null;
/** what Group.value and the Group constructor accept: keys left out are simply not assigned */
export type GroupValueInput<T extends GenericFieldsInterface> = Partial<FieldsToValues<T>> | null;

export class Group<T extends GenericFieldsInterface = GenericFieldsInterface, X extends object = {}> extends FieldBase<
  GroupValue<T>,
  X
> {
  protected get state(): ContainerSlots<GroupValue<T>> {
    return super.state as ContainerSlots<GroupValue<T>>;
  }

  protected get raw(): ContainerSlots<GroupValue<T>> {
    return super.raw as ContainerSlots<GroupValue<T>>;
  }

  private readonly _fields: T;

  constructor(fields: T, params?: IFieldParams<GroupValueInput<T>, X>) {
    super(containerSlots<GroupValue<T>>());

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

      // reading value walks every member and builds an object, so it is read once here and the result serves
      // every reader below
      const constructedValue = this.value;
      if (this.originalValue === undefined) this.originalValue = Group.baseline(constructedValue);

      // the value a construction ends on is the group's first statement about itself rather than a change of one:
      // recording it as announced is what keeps the commit from reporting the members' assignment as a change of
      // the group, and it is what the first later change of a member is reported against
      this.raw.announcedValue = constructedValue;

      this._actions?.triggerEager(this, constructedValue, this.originalValue);
      this.validate();
    });
  }

  /**
   * The copy of a built value that serves as a baseline. The value getter hands out one object per version, and
   * a baseline holding that same object would report every value as its own original.
   */
  private static baseline<V extends GenericFieldsInterface>(value: GroupValue<V>): GroupValue<V> {
    return value == null ? value : ({ ...value } as FieldsToValues<V>);
  }

  private addField(fieldName: string, field: FieldBase) {
    // note: not sure if I should expose this (make it public).
    //  breaks types, neglects events (originalValue, valueChanged), etc.
    if (Object.hasOwn(this._fields, fieldName)) {
      throw new Error(`Field ${fieldName} is already in this form`);
    }
    // takeChild refuses a field that another group or list already holds, and installs the back-reference and the
    // name together. A group never releases a field, so the name stands for the lifetime of the field.
    this.takeChild(field, fieldName);
    // the entry is a non-configurable getter, so the map cannot be rewritten behind the group's back:
    // a field assigned straight into `fields` would never receive parent, fieldName or change notifications
    Object.defineProperty(this._fields, fieldName, { get: () => field, configurable: false, enumerable: true });
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

  get fields(): T {
    return this._fields;
  }

  protected get members(): FieldBase[] {
    return Object.values(this._fields);
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
      if (field.enabled) {
        // readOnly fields do not serialize
        val[name] = fieldValue;
      } else if (field instanceof Group && !isEmpty(fieldValue)) {
        // readOnly group only serializes if it is non-empty (some of its fields are not readOnly)
        val[name] = fieldValue;
      }
    });
    // the object outlives the read that built it - the next reader is answered with the very same one - so it is
    // frozen: a caller writing into it would change what the group reports without any member holding that value
    const built = isEmpty(val) ? null : (Object.freeze({ ...val }) as FieldsToValues<T>);
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

  get fullValue(): Record<string, any> {
    const value = Object.create(null) as Record<string, any>;
    Object.entries(this._fields).forEach(([name, field]) => {
      value[name] = field.fullValue;
    });
    return { ...value };
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
    return this.state.errors.length === 0 && Object.values(this._fields).every((field) => field.valid);
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

  bind(data?: GroupValueInput<T>, overrides?: IBindParams<GroupValueInput<T>, X>): Group<T, X> {
    const newFields = Object.create(null) as T;
    Object.entries(this._fields).forEach(([name, field]) => {
      newFields[name as keyof T] = field.bind() as any;
    });
    const res = new Group<T, X>(newFields, {
      // data is what the caller supplied, and undefined is not supplied; an explicit null is, and clears
      value: data !== undefined ? data : this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    } as IFieldParams<GroupValueInput<T>, X>);
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
