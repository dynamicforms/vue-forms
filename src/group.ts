import { isEmpty, isEqual } from 'lodash-es';
import { toRaw } from 'vue';

import { ValueChangedAction } from './actions';
import { ValueChangedActionClassIdentifier } from './actions/value-changed-action';
import { Field } from './field';
import { FieldBase } from './field-base';
import { IFieldConstructorParams } from './field.interface';

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

export class Group<T extends GenericFieldsInterface = GenericFieldsInterface> extends FieldBase<GroupValue<T>> {
  private readonly _fields: T;

  private _value: GroupValue<T> = null;

  /** the object the value getter last built, together with the version of the tree it was built from */
  private _cachedValue: GroupValue<T> = null;

  private _cachedValueVersion: number = -1;

  private suppressNotifyValueChanged: boolean = false;

  constructor(fields: T, params?: Partial<IFieldConstructorParams<GroupValueInput<T>>>) {
    super();

    if (!Group.isValidFields(fields)) throw new Error('Invalid fields object provided');
    // the backing map has no prototype: a field may be named after an Object.prototype member, and on an
    // ordinary object a `__proto__` key would go to the inherited setter instead of becoming a field
    this._fields = Object.create(null) as T;
    Object.entries(fields).forEach(([name, field]) => this.addField(name, field));

    if (params) {
      const { value: paramValue, validators, actions, ...otherParams } = params;
      // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
      // guards them too
      this.registerInitialActions([...(validators || []), ...(actions || [])]);
      Object.assign(this, otherParams);
      // an assignment is made only for a value the caller actually supplied, and undefined is not one: spreading
      // an optional property yields an undefined value, and assigning it would push null into every member and
      // then baseline that emptied state as the original, so the group would report itself unchanged over values
      // its members never held. An explicit null is a supplied value and does clear the members.
      if (paramValue !== undefined) this.assignMembers(paramValue as GroupValueInput<T>);
      else if (this.originalValue !== undefined) this.assignMembers(this.originalValue);
    }

    // reading value walks every member and builds an object, so it is read once here and the result serves
    // every reader below
    const constructedValue = this.value;
    if (this.originalValue === undefined) this.originalValue = Group.baseline(constructedValue);

    // the cache the ValueChangedAction reads as the old value starts at the constructed value, so the first change
    // of a member reports what the group held before it instead of null
    this._value = constructedValue;

    // if (Object.keys(this._fields).length) console.log('group created', this, Error().stack);
    this._actions?.triggerEager(this, constructedValue, this.originalValue);
    this.validate();
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
    // takeChild refuses a field that another group or list already holds, and installs the back-reference; the
    // name goes with it, and it is non-enumerable for the same reason the back-reference is - lodash isEqual and
    // JSON.stringify walk own enumerable properties. A group never releases a field, so the name is fixed for the
    // lifetime of the field. defineProperty has no trap on a reactive proxy, so it reaches the underlying object.
    this.takeChild(field);
    Object.defineProperty(field, 'fieldName', { get: () => fieldName, configurable: false, enumerable: false });
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

  get value(): GroupValue<T> {
    // the version is a tracked read and the cache is not, so a reader that is answered from the cache still
    // depends on every write below this group without the walk being repeated for it
    const version = this.valueVersion;
    const cache = toRaw(this);
    if (cache._cachedValueVersion === version) return cache._cachedValue;

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
    cache._cachedValue = built;
    cache._cachedValueVersion = version;
    return built;
  }

  /**
   * Writes the members that the given value carries, without letting any single member announce the state in
   * between: the group's own value notification and its own validation are both held back for the duration, so
   * neither a ValueChangedAction nor a ValidChangedAction reports a verdict over a half-applied value. The
   * caller decides what to announce once the whole value is in place. Both flags are restored to what they were,
   * so a caller that is itself holding the group back stays in charge.
   */
  private assignMembers(newValue: GroupValueInput<T>) {
    const outerNotify = this.suppressNotifyValueChanged;
    const outerValidation = this.suppressValidation;
    this.suppressNotifyValueChanged = true;
    this.suppressValidation = true;
    try {
      Object.entries(this._fields).forEach(([name, field]) => {
        if (newValue == null || Object.hasOwn(newValue, name)) {
          field.value = newValue == null ? null : newValue[name];
        }
      });
    } finally {
      this.suppressNotifyValueChanged = outerNotify;
      this.suppressValidation = outerValidation;
    }
  }

  set value(newValue: GroupValueInput<T>) {
    this.assignMembers(newValue);
    this.notifyValueChanged();
    this.validate();
  }

  /**
   * Members are reset one by one rather than assigned as a whole value: the value setter writes only the keys the
   * value carries, while a member the value leaves out has to end up holding what the template gives it. `source`
   * supplies that per member, so a group reset from the template it was cloned from matches a fresh clone of it.
   */
  protected resetTo(source: FieldBase, value: any): void {
    const template = source as Group<T>;
    const outerNotify = this.suppressNotifyValueChanged;
    const outerValidation = this.suppressValidation;
    this.suppressNotifyValueChanged = true;
    this.suppressValidation = true;
    try {
      if (this.errors.length) this.errors = [];
      Object.entries(this._fields).forEach(([name, field]) => {
        // a key the value does not carry leaves the member to the template; a null value clears every member,
        // the same way assigning null does
        let memberValue: any;
        if (value === null) memberValue = null;
        else if (value !== undefined && Object.hasOwn(value, name)) memberValue = value[name];
        this.resetChild(field, template.field(name) ?? field, memberValue);
      });
    } finally {
      this.suppressNotifyValueChanged = outerNotify;
      this.suppressValidation = outerValidation;
    }
    const built = this.value;
    this._value = built;
    this.originalValue = Group.baseline(built);
    super.validate(true);
  }

  get touched(): boolean {
    return Object.values(this._fields).some((field) => field.touched);
  }

  set touched(touched: boolean) {
    Object.values(this._fields).forEach((field) => {
      field.touched = touched;
    });
  }

  get fullValue(): Record<string, any> {
    const value = Object.create(null) as Record<string, any>;
    Object.entries(this._fields).forEach(([name, field]) => {
      value[name] = field.fullValue;
    });
    return { ...value };
  }

  notifyValueChanged() {
    if (this.suppressNotifyValueChanged) return;
    // the pair a ValueChangedAction carries is only built where something receives it: with no handler for it and
    // no eager action riding along, walking the members would produce an object nobody reads. What still has to
    // happen is the notification of the parent and this group's own recomputation - a member that changed its
    // verdict has already corrected the tally the recomputation reads.
    const actions = this._actions?.willTrigger(ValueChangedActionClassIdentifier) ? this._actions : undefined;
    let newValue: GroupValue<T> = null;
    let oldValue: GroupValue<T> = null;
    if (actions) {
      newValue = this.value;
      if (isEqual(newValue, this._value)) return;
      oldValue = this._value;
      this._value = newValue;
    }
    // the parent learns of the new value below and validates itself from there, over the whole value; a
    // validator running on this group must therefore not send it a verdict of its own in the meantime
    const outerClimb = this.suppressParentValidityClimb;
    this.suppressParentValidityClimb = true;
    try {
      if (actions) actions.trigger(ValueChangedAction, this, newValue, oldValue);
      if (this.parent) this.parent.notifyValueChanged();
    } finally {
      this.suppressParentValidityClimb = outerClimb;
      this.validate();
      // a parent whose own value did not change by this one returns from notifyValueChanged() without
      // validating, so a validity change held back above still has to reach it. Both run even when a handler
      // threw, or the parent would keep a verdict the members no longer support.
      this.flushParentValidityClimb();
    }
  }

  protected refreshPreviousValue(): void {
    this._value = this.value;
  }

  get valid() {
    return this.validRead;
  }

  protected composeValid(): boolean {
    return this.errors.length === 0 && Object.values(this._fields).every((field) => field.valid);
  }

  validate(revalidate: boolean = false) {
    if (revalidate) {
      // the members are revalidated with the group held back, so a member that turns valid while a later one is
      // still to be checked cannot make the group announce a verdict over a half-revalidated set. The group forms
      // its own verdict below, once, over the finished set.
      const outerValidation = this.suppressValidation;
      this.suppressValidation = true;
      try {
        Object.values(this._fields).forEach((field) => field.validate(true));
      } finally {
        this.suppressValidation = outerValidation;
      }
    }
    super.validate(revalidate);
  }

  clone(overrides?: Partial<IFieldConstructorParams<GroupValueInput<T>>>): Group<T> {
    const newFields = Object.create(null) as T;
    Object.entries(this._fields).forEach(([name, field]) => {
      newFields[name as keyof T] = field.clone() as any;
    });
    const res = new Group(newFields, {
      // an override value is one the caller supplied, and undefined is not one; an explicit null is, and clears
      value: overrides?.value !== undefined ? overrides.value : this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
    if (this._actions) {
      const actions = this._actions.clone();
      res._actions = actions;
      // the constructor primed _value with the value the members ended up holding, and nothing has run since
      actions.triggerEager(res, res._value, res.originalValue);
    }
    return res;
  }
}

export type NullableGroup = Group | null;
