import { ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IFieldConstructorParams } from './field.interface';

class Field<T = any> extends FieldBase<T> {
  protected _value: T = undefined!;

  protected _touched: boolean = false;

  constructor(params?: Partial<IFieldConstructorParams<T>>) {
    super();
    this.init(params);
  }

  /**
   * Applies the constructor parameters. It is a hook so that a subclass needing different parameter handling
   * overrides one method instead of redeclaring the constructor - Action does exactly that.
   *
   * It is called from this constructor, so it runs before a subclass's own class field initializers, which
   * only run once super() returns. An override must therefore work off its parameters alone: members the
   * subclass initializes read as undefined inside it, and anything it writes to such a member is overwritten
   * the moment the initializer runs.
   */
  protected init(params?: Partial<IFieldConstructorParams<T>>) {
    if (params) {
      const { value: paramValue, validators, actions, ...otherParams } = params;
      // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
      // guards them too
      this.registerInitialActions([...(validators || []), ...(actions || [])]);
      Object.assign(this, otherParams);
      // an absent value falls back to originalValue, an explicit null does not: null is a value a caller means
      this._value = paramValue !== undefined ? paramValue : this.originalValue;
      if (this.originalValue === undefined) this.originalValue = this._value;
    }
    this._actions?.triggerEager(this, this.value, this.originalValue);
    this.validate();
  }

  get value() {
    return this._value;
  }

  set value(newValue: T) {
    const oldValue = this._value;
    if (!this.enabled || oldValue === newValue) return; // a disabled field does not allow changing value
    this._value = newValue;
    this.bumpValueVersion();
    // the parent learns of the new value from notifyValueChanged() and validates itself from there, over the whole
    // value; a validator running on this field must therefore not send it a verdict of its own in the meantime
    const outerClimb = this.suppressParentValidityClimb;
    this.suppressParentValidityClimb = true;
    try {
      this._actions?.trigger(ValueChangedAction, this, this._value, oldValue);
      if (this.parent) this.parent.notifyValueChanged();
    } finally {
      this.suppressParentValidityClimb = outerClimb;
      this.validate();
      // a parent whose own value did not change by this assignment returns from notifyValueChanged() without
      // validating, so a validity change held back above still has to reach it. Both run even when a handler
      // threw, or the parent would keep a verdict the members no longer support.
      this.flushParentValidityClimb();
    }
  }

  get touched(): boolean {
    return this._touched;
  }

  set touched(touched: boolean) {
    this._touched = touched;
  }

  clone(overrides?: Partial<IFieldConstructorParams<T>>): this {
    // construction goes through this.constructor so that a subclass clones into its own type
    const Ctor = this.constructor as new (params?: Partial<IFieldConstructorParams<T>>) => this;
    const res = new Ctor({
      // an override value is one the caller supplied, and undefined is not one; an explicit null is, and clears
      value: overrides?.value !== undefined ? (overrides.value as T) : this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
    if (this._actions) {
      const actions = this._actions.clone();
      res._actions = actions;
      actions.triggerEager(res, res.value, res.originalValue);
    }
    return res;
  }
}

export { Field };

export type NullableField<T = any> = Field<T> | null;

export const EmptyField = new Field({ value: 'EmptyField' }).registerAction(
  new ValueChangedAction(() => {
    console.warn('Working with EmptyField! This should not happen');
  }),
);
