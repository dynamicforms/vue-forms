import { reactive } from 'vue';

import { ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IField, IFieldConstructorParams } from './field.interface';

export class Field<T = any> extends FieldBase {
  private _value: T = undefined!;

  protected constructor(params?: Partial<IFieldConstructorParams<T>>) {
    super();
    if (params) {
      const { value: paramValue, validators, actions, ...otherParams } = params;
      [...(validators || []), ...(actions || [])].forEach((a) => this.registerAction(a));
      Object.assign(this, otherParams);
      this._value = paramValue ?? this.originalValue;
      if (this.originalValue === undefined) this.originalValue = this._value;
    }
    this.actions.triggerEager(this, this.value, this.originalValue);
  }

  /**
   * Creates a new reactive Field instance.
   * @param params Initial field parameters
   * @returns Reactive Field instance
   */
  static create<T = any>(params?: Partial<IFieldConstructorParams<T>>): Field<T> {
    return reactive(new Field(params)) as Field<T>;
  }

  get value() { return this._value; }

  set value(newValue: T) {
    if (!this.enabled) return; // a disabled field does not allow changing value
    const oldValue = this._value;
    this._value = newValue;
    this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
    if (this.parent) this.parent.notifyValueChanged();
    this.validate();
  }

  async setValue(newValue: T) {
    if (!this.enabled) return; // a disabled field does not allow changing value
    const oldValue = this._value;
    this._value = newValue;
    await this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
    if (this.parent) await this.parent.notifyValueChanged();
    this.validate();
  }

  clone(overrides?: Partial<IField<T>>): Field<T> {
    return Field.create<T>({
      value: overrides?.value ?? this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : { }),
      errors: [...(overrides?.errors ?? this.errors)],
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
  }
}

export type NullableField<T = any> = Field<T> | null;

export const EmptyField = Field.create({ value: 'EmptyField' })
  .registerAction(new ValueChangedAction(
    async () => {
      console.warn('Working with EmptyField! This should not happen');
    },
  ));
