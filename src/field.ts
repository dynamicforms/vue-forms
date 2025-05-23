import { reactive, unref } from 'vue';

import { ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IField, IFieldConstructorParams } from './field.interface';

export class Field<T = any> extends FieldBase {
  private _value: T = undefined!;

  protected constructor() {
    super();
  }

  private init(params?: Partial<IFieldConstructorParams<T>>) {
    if (params) {
      const { value: paramValue, validators, actions, ...otherParams } = params;
      [...(validators || []), ...(actions || [])].forEach((a) => this.registerAction(a));
      Object.assign(this, otherParams);
      this._value = paramValue ?? this.originalValue;
      if (this.originalValue === undefined) this.originalValue = this._value;
    }
    this.actions.triggerEager(this, this.value, this.originalValue);
    this.validate();
  }

  /**
   * Creates a new reactive Field instance.
   * @param params Initial field parameters
   * @returns Reactive Field instance
   */
  static create<T = any>(params?: Partial<IFieldConstructorParams<T>>): Field<T> {
    const res = reactive(new Field()) as Field<T>;
    res.init(params);
    return res;
  }

  get value() { return unref(this._value); }

  set value(newValue: T) {
    const oldValue = this._value;
    if (!this.enabled || oldValue === newValue) return; // a disabled field does not allow changing value
    this._value = newValue;
    this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
    if (this.parent) this.parent.notifyValueChanged();
    this.validate();
  }

  clone(overrides?: Partial<IField<T>>): Field<T> {
    const res = Field.create<T>({
      value: overrides?.value ?? this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : { }),
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
    res.actions = this.actions.clone();
    res.actions.triggerEager(res, res.value, res.originalValue);
    return res;
  }
}

export type NullableField<T = any> = Field<T> | null;

export const EmptyField = Field.create({ value: 'EmptyField' })
  .registerAction(new ValueChangedAction(
    () => {
      console.warn('Working with EmptyField! This should not happen');
    },
  ));
