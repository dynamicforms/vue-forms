import { isEmpty, isEqual } from 'lodash-es';

import { ValueChangedAction } from './actions';
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

    if (this.originalValue === undefined) this.originalValue = this.value;

    // the cache the ValueChangedAction reads as the old value starts at the constructed value, so the first change
    // of a member reports what the group held before it instead of null
    this._value = this.value;

    // if (Object.keys(this._fields).length) console.log('group created', this, Error().stack);
    this.actions.triggerEager(this, this.value, this.originalValue);
    this.validate();
  }

  private addField(fieldName: string, field: FieldBase) {
    // note: not sure if I should expose this (make it public).
    //  breaks types, neglects events (originalValue, valueChanged), etc.
    if (Object.hasOwn(this._fields, fieldName)) {
      throw new Error(`Field ${fieldName} is already in this form`);
    }
    // parent and fieldName must stay non-enumerable: Group.value iterates its fields, and lodash isEqual and
    // JSON.stringify walk own enumerable properties, so an enumerable back-reference makes all three recurse
    // into the parent. defineProperty has no trap on a reactive proxy, so it reaches the underlying object.
    Object.defineProperty(field, 'parent', { get: () => this, configurable: false, enumerable: false });
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
    return isEmpty(val) ? null : ({ ...val } as FieldsToValues<T>);
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
    const newValue = this.value;
    if (!isEqual(newValue, this._value)) {
      const oldValue = this._value;
      this._value = newValue;
      // the parent learns of the new value below and validates itself from there, over the whole value; a
      // validator running on this group must therefore not send it a verdict of its own in the meantime
      const outerClimb = this.suppressParentValidityClimb;
      this.suppressParentValidityClimb = true;
      try {
        this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
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
  }

  get valid() {
    return super.valid && Object.values(this._fields).every((field) => field.valid);
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
    res.actions = this.actions.clone();
    res.actions.triggerEager(res, res.value, res.originalValue);
    return res;
  }
}

export type NullableGroup = Group | null;
