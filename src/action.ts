import { ExecuteAction } from './actions';
import { Field } from './field';
import { IFieldConstructorParams } from './field.interface';

export interface ActionValue {
  label?: string;
  icon?: string;
}

function isValEmpty(val: ActionValue | undefined, defaultIfTrue: ActionValue): ActionValue {
  if (val?.label == null && val?.icon == null) return defaultIfTrue;
  return val;
}

// @ts-expect-error: prevent TS from complaining how create method is not ok because its declaration differs from Fld's
export class Action<T extends ActionValue = ActionValue> extends Field<T> {
  constructor(guard?: symbol) {
    super(guard);
    this._value = { label: undefined, icon: undefined } as T;
  }

  protected init(params?: Partial<IFieldConstructorParams<T>>) {
    // TODO: this init is most likely not needed any more. The only read diff from Field.init is the orgVal handling
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

  static create<T extends ActionValue = ActionValue>(params?: Partial<IFieldConstructorParams<T>>): Action<T> {
    return super.create<T>(params) as Action<T>;
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

  execute(params: any) {
    this.actions.trigger(ExecuteAction, this, params);
  }
}

export type NullableAction = Action | null;
