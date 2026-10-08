import { type FieldSlots, fieldSlots } from './element-state';
import { FieldBase } from './field-base';
import { type Extras, IBindParams, IFieldParams } from './field.interface';
import { transactional } from './transaction';

class Field<T = any, X extends object = Extras> extends FieldBase<T, X> {
  get [Symbol.toStringTag](): string {
    return 'Field';
  }

  protected get state(): FieldSlots<T> {
    return super.state as FieldSlots<T>;
  }

  protected get raw(): FieldSlots<T> {
    return super.raw as FieldSlots<T>;
  }

  /** the value slot itself, without the notifications the value setter sends on a write */
  protected get _value(): T {
    return this.state.value;
  }

  protected set _value(newValue: T) {
    this.state.value = newValue;
  }

  constructor(params?: IFieldParams<T, X>) {
    super(fieldSlots<T>());
    this.init(params);
  }

  /**
   * Applies the constructor parameters. A subclass that needs different parameter handling overrides this method
   * instead of redeclaring the constructor, as Action does.
   *
   * It is called from this constructor, so it runs before a subclass's class field initializers, which run after
   * super() returns. An override can therefore use only its parameters: members the subclass initializes are
   * undefined inside it, and a value it writes to such a member is overwritten when the initializer runs.
   */
  protected init(params?: IFieldParams<T, X>) {
    transactional(() => {
      if (params) {
        const { value: paramValue, validators, actions, ...otherParams } = params;
        // actions are registered before the remaining parameters are assigned, so a *Changing* action supplied here
        // also applies to those assignments
        this.registerInitialActions([...(validators || []), ...(actions || [])]);
        this.assignParams(otherParams);
        // a missing value defaults to originalValue; an explicit null is a value and is kept
        this._value = paramValue !== undefined ? paramValue : this.originalValue;
      }
      this.constructed(params);
      // without a supplied baseline, the baseline is the value the construction ends with, which is the value the
      // hook above leaves
      if (this.originalValue === undefined) this.originalValue = this._value;
      // the value a construction ends with is the field's initial state, not a change, so it is recorded as
      // announced and the following commit announces nothing for it
      this.recordAnnounced();
      this.boundActions?.triggerEager(this, this.contribution, this.originalValue);
      this.validate();
    });
  }

  get value() {
    return this._value;
  }

  set value(newValue: T) {
    const oldValue = this._value;
    // the write is applied whatever the access: access determines what the field sends and whether an input
    // accepts typing, and a record loaded into the form reaches every member
    if (oldValue === newValue) return;
    transactional((tx) => {
      tx.touch(this);
      this._value = newValue;
      this.bumpValueVersion();
      // the validators run here, not at the announcement, because the commit announces their result. They read
      // what the field sends, which a write changes only if the field sends its value: a field that sends nothing
      // or null sends the same after the write
      if (this.serializesAs('value') === 'value') this.boundActions?.triggerEager(this, newValue, oldValue);
      // the handlers receive the change when the transaction closes, with the field's final value
      this.propagateValueChanged();
    });
  }

  get touched(): boolean {
    return this.state.touched;
  }

  set touched(touched: boolean) {
    this.touchState();
    this.state.touched = touched;
  }

  bind(data?: T, overrides?: IBindParams<T, X>): this {
    // construction goes through this.constructor so that a subclass binds into its own type
    const Ctor = this.constructor as new (params?: IFieldParams<T, X>) => this;
    const res = new Ctor({
      // undefined data counts as not supplied; an explicit null is supplied and clears
      value: data !== undefined ? data : this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
      access: overrides?.access ?? this.access,
      visibility: overrides?.visibility ?? this.visibility,
    } as IFieldParams<T, X>);
    res.boundFrom(this, res.contribution, res.originalValue, overrides);
    return res;
  }
}

export { Field };

export type NullableField<T = any> = Field<T> | null;
