import { ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IField } from './field.interface';

// eslint-disable-next-line import/prefer-default-export
export class Field extends FieldBase {
  private _value: any = undefined;

  constructor(params?: Partial<IField>) {
    super();
    if (params) {
      const { value: paramValue, ...otherParams } = params;
      Object.assign(this, otherParams);
      this._value = paramValue ?? this.originalValue;
      if (this.originalValue === undefined) this.originalValue = this._value;
    }
  }

  get value() { return this._value; }

  set value(newValue: any) {
    if (!this.enabled) return; // a disabled field does not allow changing value
    const oldValue = this._value;
    this._value = newValue;
    this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
    if (this.parent) this.parent.notifyValueChanged();
    this.validate();
  }

  clone(overrides?: Partial<IField>): Field {
    return new Field({
      value: overrides?.value ?? this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : { }),
      errors: [...(overrides?.errors ?? this.errors)],
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
  }
}

export type NullableField = Field | null;

export const EmptyField = new Field({ value: 'EmptyField' })
  .registerAction(new ValueChangedAction(
    async () => {
      console.warn('Working with EmptyField! This should not happen');
    },
  ));
