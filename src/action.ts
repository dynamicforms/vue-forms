import { reactive } from 'vue';

import { ExecuteAction, ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IField, IFieldConstructorParams } from './field.interface';

export interface ActionValue {
  label?: string;
  icon?: string;
}

function isValEmpty(val: ActionValue | undefined, defaultIfTrue: ActionValue): ActionValue {
  if (val?.label == null && val?.icon == null) return defaultIfTrue;
  return val;
}

const actionConstructorGuard = Symbol('ActionConstructorGuard');

export class Action<T extends ActionValue = ActionValue> extends FieldBase<T> {
  private _value: T = { label: undefined, icon: undefined } as T;

  constructor(guard?: symbol) {
    super();
    if (guard !== actionConstructorGuard) {
      throw new TypeError('Don\'t use constructor to instantiate Action. Use Action.create<T>');
    }
  }

  protected init(params?: Partial<IFieldConstructorParams<T>>) {
    if (params) {
      const { value: paramValue, originalValue, validators, actions, ...otherParams } = params;
      [...(validators || []), ...(actions || [])].forEach((a) => this.registerAction(a));
      Object.assign(this, otherParams);
      const val = isValEmpty(paramValue, this._value);
      const orgVal = Object.freeze({ label: originalValue?.label, icon: originalValue?.icon } as ActionValue);
      this._value = isValEmpty(val, orgVal) as T;
      this.originalValue = isValEmpty(orgVal, val) as T;
    }
    this.actions.triggerEager(this, this.value, this.originalValue);
    this.validate();
  }

  static create<T extends ActionValue = ActionValue>(
    this: new(guard?: symbol) => Action<T>,
    params?: Partial<IFieldConstructorParams<T>>,
  ): InstanceType<typeof this> {
    const res = reactive(new this(actionConstructorGuard)) as any;
    res.init(params);
    return res;
  }

  get value(): T { return this._value; }

  set value(newValue: T) {
    if (!this.enabled) return; // a disabled field does not allow changing value
    const oldValue = this._value;
    this._value = newValue;
    this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
    if (this.parent) this.parent.notifyValueChanged();
    this.validate();
  }

  get icon(): string | undefined {
    return this.value.icon;
  }

  set icon(newValue: string | undefined) {
    this.value.icon = newValue;
  }

  get label(): string | undefined {
    return this.value.label;
  }

  set label(newValue: string | undefined) {
    this.value.label = newValue;
  }

  clone(overrides?: Partial<IField<T>>): Action<T> {
    const res = Action.create<T>({
      value: overrides?.value ?? this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : { }),
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
    res.actions = this.actions.clone();
    res.actions.triggerEager(res, res.value, res.originalValue);
    return res;
  }

  execute(params: any) {
    this.actions.trigger(ExecuteAction, this, params);
  }
}

export type NullableAction = Action | null;
