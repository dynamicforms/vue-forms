import { isEmpty, isEqual } from 'lodash-es';
import { computed } from 'vue';

import { ValueChangedAction } from './actions';
import { Field } from './field';
import { FieldBase } from './field-base';
import { IField, IFieldConstructorParams } from './field.interface';

export type GenericFieldsInterface = Record<string, IField>;
// Utility tip za pretvorbo field strukture v value strukturo
type FieldsToValues<T extends GenericFieldsInterface> = {
  [K in keyof T]: T[K] extends IField<infer U> ? U : T[K] extends Group<infer G> ? FieldsToValues<G> : any;
};

export class Group<T extends GenericFieldsInterface = GenericFieldsInterface> extends FieldBase {
  private readonly _fields: T;

  private _value: FieldsToValues<T> | null = null;

  public override readonly reactiveValue = computed<FieldsToValues<T> | null>(() => this.value);

  private suppressNotifyValueChanged: boolean = false;

  constructor(fields: T, params?: Partial<IFieldConstructorParams>) {
    super();

    if (!Group.isValidFields(fields)) throw new Error('Invalid fields object provided');
    this._fields = {} as T;
    Object.entries(fields).forEach(([name, field]) => this.addField(name, field));

    if (params) {
      const { value: paramValue, validators, actions, ...otherParams } = params;
      [...(validators || []), ...(actions || [])].forEach((a) => this.registerAction(a));
      Object.assign(this, otherParams);
      this.value = paramValue ?? this.originalValue;
    }

    if (this.originalValue === undefined) this.originalValue = this.value;

    // if (Object.keys(this._fields).length) console.log('group created', this, Error().stack);
    this.actions.triggerEager(this, this.value, this.originalValue);
    this.validate();
  }

  private addField(fieldName: string, field: IField) {
    // note: not sure if I should expose this (make it public).
    //  breaks types, neglects events (originalValue, valueChanged), etc.
    if (this.fields[fieldName] !== undefined) {
      throw new Error(`Field ${fieldName} is already in this form`);
    }
    Object.defineProperty(field, 'parent', { get: () => this, configurable: false, enumerable: false });
    Object.defineProperty(field, 'fieldName', { get: () => fieldName, configurable: false, enumerable: false });
    Object.defineProperty(this._fields, fieldName, {
      get() {
        return field;
      },
      configurable: false,
      enumerable: true,
    });
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
      data == null
        ? {}
        : Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Field.create({ value })])),
    );
  }

  field<K extends keyof T>(fieldName: K): T[K] | null {
    return this._fields[fieldName] ?? null;
  }

  get fields(): T {
    return this._fields;
  }

  get value(): FieldsToValues<T> | null {
    const val = {} as Record<string, any>;
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
    return isEmpty(val) ? null : (val as FieldsToValues<T>);
  }

  set value(newValue: FieldsToValues<T> | null) {
    this.suppressNotifyValueChanged = true;
    try {
      Object.entries(this._fields).forEach(([name, field]) => {
        if (newValue == null || name in newValue) {
          field.value = newValue == null ? null : newValue[name];
        }
      });
    } finally {
      this.suppressNotifyValueChanged = false;
    }
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
    const value: Record<string, any> = {};
    Object.entries(this._fields).forEach(([name, field]) => {
      value[name] = field.fullValue;
    });
    return value;
  }

  notifyValueChanged() {
    if (this.suppressNotifyValueChanged) return;
    const newValue = this.value;
    if (!isEqual(newValue, this._value)) {
      const oldValue = this._value;
      this._value = newValue;
      this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
      if (this.parent) this.parent.notifyValueChanged();
      this.validate();
    }
  }

  get valid() {
    return super.valid && Object.values(this._fields).every((field) => field.valid);
  }

  validate(revalidate: boolean = false) {
    if (revalidate) Object.values(this._fields).forEach((field) => field.validate(true));
    super.validate(revalidate);
  }

  clone(overrides?: Partial<IField>): Group<T> {
    const newFields = {} as T;
    Object.entries(this._fields).forEach(([name, field]) => {
      newFields[name as keyof T] = field.clone() as any;
    });
    const res = new Group(newFields, {
      value: overrides?.value ?? this.value,
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
