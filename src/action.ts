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

export class Action extends FieldBase {
  private _value: ActionValue = { label: undefined, icon: undefined };

  protected constructor() {
    super();
  }

  private init(params?: Partial<IFieldConstructorParams<ActionValue>>) {
    if (params) {
      const { value: paramValue, originalValue, validators, actions, ...otherParams } = params;
      [...(validators || []), ...(actions || [])].forEach((a) => this.registerAction(a));
      Object.assign(this, otherParams);
      const val = isValEmpty(paramValue, this._value);
      const orgVal = Object.freeze({ label: originalValue?.label, icon: originalValue?.icon } as ActionValue);
      this._value = isValEmpty(val, orgVal);
      this.originalValue = isValEmpty(orgVal, val);
    }
    this.actions.triggerEager(this, this.value, this.originalValue);
    this.validate();
  }

  static create(params?: Partial<IField<ActionValue>>): Action {
    const res = reactive(new Action()) as Action;
    res.init(params);
    return res;
  }

  get value(): ActionValue { return this._value; }

  set value(newValue: ActionValue) {
    if (!this.enabled) return; // a disabled field does not allow changing value
    const oldValue = this._value;
    this._value.icon = newValue?.icon;
    this._value.label = newValue?.label;
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

  clone(overrides?: Partial<IField>): Action {
    const res = Action.create({
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
