import { reactive } from 'vue';

import { ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IField, IFieldConstructorParams } from './field.interface';

const fieldConstructorGuard = Symbol('FieldConstructorGuard');

class Field<T = any> extends FieldBase {
  protected _value: T = undefined!;

  constructor(guard?: symbol) {
    super();
    if (guard !== fieldConstructorGuard) {
      const cn = this.constructor.name;
      throw new TypeError(`Don't use constructor to instantiate ${cn}. Use ${cn}.create<T>`);
    }
  }

  protected init(params?: Partial<IFieldConstructorParams<T>>) {
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
  static create<T = any>(
    this: new(guard?: symbol) => Field<T>,
    params?: Partial<IFieldConstructorParams<T>>,
  ): InstanceType<typeof this> {
    const res = reactive(new this(fieldConstructorGuard)) as any;
    res.init(params);
    return res;
  }

  get value() { return this._value; }

  set value(newValue: T) {
    const oldValue = this._value;
    if (!this.enabled || oldValue === newValue) return; // a disabled field does not allow changing value
    this._value = newValue;
    this.actions.trigger(ValueChangedAction, this, this._value, oldValue);
    if (this.parent) this.parent.notifyValueChanged();
    this.validate();
  }

  clone(overrides?: Partial<IField<T>>): this {
    const res: this = (this.constructor as any).create({
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

export { Field };

export type NullableField<T = any> = Field<T> | null;

export const EmptyField = Field.create({ value: 'EmptyField' })
  .registerAction(new ValueChangedAction(
    () => {
      console.warn('Working with EmptyField! This should not happen');
    },
  ));
