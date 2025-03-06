import { ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IField } from './field.interface';

// eslint-disable-next-line import/prefer-default-export
export class Field<T = any> extends FieldBase {
  private _value: T = undefined!;

  constructor(params?: Partial<IField<T>>) {
    super();
    if (params) {
      const { value: paramValue, ...otherParams } = params;
      Object.assign(this, otherParams);
      this._value = paramValue ?? this.originalValue;
      if (this.originalValue === undefined) this.originalValue = this._value;
    }
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

  clone(overrides?: Partial<IField<T>>): Field<T> {
    return new Field<T>({
      value: overrides?.value ?? this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : { }),
      errors: [...(overrides?.errors ?? this.errors)],
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
  }
}

export type NullableField<T = any> = Field<T> | null;

export const EmptyField = new Field({ value: 'EmptyField' })
  .registerAction(new ValueChangedAction(
    async () => {
      console.warn('Working with EmptyField! This should not happen');
    },
  ));
