import { type FieldSlots, fieldSlots } from './element-state';
import { FieldBase } from './field-base';
import { IBindParams, IFieldParams } from './field.interface';
import { transactional } from './transaction';

class Field<T = any, X extends object = {}> extends FieldBase<T, X> {
  protected get state(): FieldSlots<T> {
    return super.state as FieldSlots<T>;
  }

  protected get raw(): FieldSlots<T> {
    return super.raw as FieldSlots<T>;
  }

  /** the value slot itself, without the notifications the value setter carries around a write */
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
   * Applies the constructor parameters. It is a hook so that a subclass needing different parameter handling
   * overrides one method instead of redeclaring the constructor - Action does exactly that.
   *
   * It is called from this constructor, so it runs before a subclass's own class field initializers, which
   * only run once super() returns. An override must therefore work off its parameters alone: members the
   * subclass initializes read as undefined inside it, and anything it writes to such a member is overwritten
   * the moment the initializer runs.
   */
  protected init(params?: IFieldParams<T, X>) {
    transactional(() => {
      if (params) {
        const { value: paramValue, validators, actions, ...otherParams } = params;
        // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
        // guards them too
        this.registerInitialActions([...(validators || []), ...(actions || [])]);
        this.assignParams(otherParams);
        // an absent value falls back to originalValue, an explicit null does not: null is a value a caller means
        this._value = paramValue !== undefined ? paramValue : this.originalValue;
        if (this.originalValue === undefined) this.originalValue = this._value;
      }
      // the value a construction ends on is the field's first statement about itself rather than a change of one,
      // so it is recorded as announced and the commit that follows says nothing about it
      this.raw.announcedValue = this._value;
      this._actions?.triggerEager(this, this.value, this.originalValue);
      this.validate();
    });
  }

  get value() {
    return this._value;
  }

  set value(newValue: T) {
    const oldValue = this._value;
    if (!this.enabled || oldValue === newValue) return; // a disabled field does not allow changing value
    transactional((tx) => {
      tx.touch(this);
      this._value = newValue;
      this.bumpValueVersion();
      // the validators run here rather than at the announcement, because the verdict they reach is what the
      // commit announces, and because they read the value that is being written and the one it replaces
      this._actions?.triggerEager(this, newValue, oldValue);
      // the handlers hear about the change once the transaction closes, over the value the field ends up holding
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
      // data is what the caller supplied, and undefined is not supplied; an explicit null is, and clears
      value: data !== undefined ? data : this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    } as IFieldParams<T, X>);
    res.boundFrom(this, res.value, res.originalValue, overrides);
    return res;
  }
}

export { Field };

export type NullableField<T = any> = Field<T> | null;
