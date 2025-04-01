import { reactive } from 'vue';

import { ExecuteAction, ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IField, IFieldConstructorParams } from './field.interface';

export interface ActionValue {
  label?: string;
  icon?: string;
}

function isValEmpty(val: ActionValue, defaultIfTrue: ActionValue): ActionValue {
  if (val?.label == null && val?.icon == null) return defaultIfTrue;
  return val;
}

export class Action extends FieldBase {
  private readonly _value: ActionValue;

  protected constructor(params?: Partial<IFieldConstructorParams<ActionValue>>) {
    super();
    if (params) {
      const { value: paramValue, originalValue, validators, actions, ...otherParams } = params;
      [...(validators || []), ...(actions || [])].forEach((a) => this.registerAction(a));
      Object.assign(this, otherParams);
      const val = { label: paramValue?.label, icon: paramValue?.icon } as ActionValue;
      const orgVal = Object.freeze({ label: originalValue?.label, icon: originalValue?.icon } as ActionValue);
      this._value = reactive(isValEmpty(val, orgVal));
      this.originalValue = isValEmpty(orgVal, val);
    } else {
      this._value = reactive({ label: undefined, icon: undefined });
    }
    this.runValidators(this.value, this.originalValue);
  }

  static create(params?: Partial<IField<ActionValue>>): Action {
    return reactive(new Action(params)) as Action;
  }

  get value(): ActionValue { return this._value; }

  set value(newValue: ActionValue) {
    if (!this.enabled) return; // a disabled field does not allow changing value
    const oldValue = this._value;
    this._value.icon = newValue?.icon;
    this._value.label = newValue?.label;
    this.runValidators(newValue, oldValue);
    this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
    if (this.parent) this.parent.notifyValueChanged();
    this.validate();
  }

  get icon(): string | undefined {
    return this.value.icon;
  }

  set icon(newValue: string | undefined) {
    this.value = { label: this.label, icon: newValue };
  }

  get label(): string | undefined {
    return this.value.label;
  }

  set label(newValue: string | undefined) {
    this.value = { label: newValue, icon: this.value.icon };
  }

  clone(overrides?: Partial<IField>): Action {
    return Action.create({
      value: overrides?.value ?? this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : { }),
      errors: [...(overrides?.errors ?? this.errors)],
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
  }

  execute(params: any) {
    this.actions.trigger(ExecuteAction, this, params);
  }
}

export type NullableAction = Action | null;
