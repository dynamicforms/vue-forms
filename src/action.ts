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

export class Action<T extends ActionValue = ActionValue> extends Field<T> {
  protected init(params?: Partial<IFieldConstructorParams<T>>) {
    // an Action's value is always a shaped object, so the empty value is the pair of undefined members and not
    // undefined itself - both this hook and isValEmpty below rely on that
    this._value = { label: undefined, icon: undefined } as T;
    if (params) {
      const { value: paramValue, originalValue, validators, actions, ...otherParams } = params;
      // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
      // guards them too
      this.registerInitialActions([...(validators || []), ...(actions || [])]);
      Object.assign(this, otherParams);
      const val = isValEmpty(paramValue, this._value);
      const orgVal = Object.freeze({ label: originalValue?.label, icon: originalValue?.icon } as ActionValue);
      // the fallback is a copy of the baseline, never the frozen baseline itself: label and icon stay
      // assignable on an action constructed without a value. A value that was given is kept by identity,
      // so a reactive object passed in stays linked to the action.
      this._value = isValEmpty(val, { ...orgVal }) as T;
      this.originalValue = isValEmpty(orgVal, val) as T;
    }
    this.actions.triggerEager(this, this.value, this.originalValue);
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

  execute(params: any) {
    this.actions.trigger(ExecuteAction, this, params);
  }
}

export type NullableAction = Action | null;
