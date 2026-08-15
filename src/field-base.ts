import { isBoolean, isEqual } from 'lodash-es';
import { reactive } from 'vue';

import ActionsMap from './actions/actions-map';
import { EnabledChangedAction, EnabledChangingAction } from './actions/enabled-actions';
import FieldActionBase from './actions/field-action-base';
import { ValidChangedAction } from './actions/valid-changed-action';
import { VisibilityChangedAction, VisibilityChangingAction } from './actions/visibility-actions';
import DisplayMode from './display-mode';
import { IFieldConstructorParams } from './field.interface';
import { type Group } from './group';
import { ValidationError } from './validators/validation-error';

export abstract class FieldBase<T = any> {
  /**
   * A field is a Vue reactive proxy from construction onwards: the base constructor returns the proxy, and a
   * derived class's `this` is whatever super() returned, so every subclass constructor, field initializer and
   * method sees the proxy. Consequence: plain `field.property = value` is tracked, with no wrapper in between.
   */
  constructor() {
    return reactive(this) as this;
  }

  abstract get value(): T;
  abstract set value(newValue: T);

  abstract get touched(): boolean;
  abstract set touched(touched: boolean);

  abstract clone(overrides?: Partial<IFieldConstructorParams<T>>): FieldBase<T>;

  declare originalValue: T; // contains original field value as was provided at creation

  private validatingCount = 0;

  /** true while at least one asynchronous validator is still running for this field */
  get validating(): boolean {
    return this.validatingCount > 0;
  }

  /** announces the start of one asynchronous validation run; validators pair it with endValidating */
  beginValidating(): void {
    this.validatingCount++;
  }

  /** announces the end of one asynchronous validation run */
  endValidating(): void {
    this.validatingCount = Math.max(0, this.validatingCount - 1);
  }

  protected _valid: boolean = true; // is current value valid as per FE and BE validators?

  errors: ValidationError[] = []; // list of errors

  declare parent?: Group; // when member of a Group, parent will specify that group

  declare fieldName?: string; // when member of a Group, fieldName specifies the name of this field

  protected actions: ActionsMap = new ActionsMap();

  // default property handlers
  private _visibility: DisplayMode = DisplayMode.FULL;

  get visibility(): DisplayMode {
    return this._visibility;
  }

  set visibility(newValue: DisplayMode) {
    const oldValue = this._visibility;
    const alteredValue = this.actions.trigger(VisibilityChangingAction, this, newValue, oldValue);
    if (!DisplayMode.isDefined(alteredValue ?? newValue)) throw new Error('visibility must be a DisplayMode constant');
    this._visibility = DisplayMode.fromAny(alteredValue ?? newValue);
    this.actions.trigger(VisibilityChangedAction, this, this._visibility, oldValue);
  }

  private _enabled: boolean = true;

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(newValue: boolean) {
    const oldValue = this._enabled;
    const alteredValue = this.actions.trigger(EnabledChangingAction, this, newValue, oldValue);
    if (!isBoolean(alteredValue ?? newValue)) throw new Error('Enabled value must be boolean');
    this._enabled = alteredValue ?? newValue;
    this.actions.trigger(EnabledChangedAction, this, this._enabled, oldValue);
  }

  validate(revalidate: boolean = false) {
    if (revalidate) this.actions.triggerEager(this, this.value, this.value);
    const oldValid = this._valid;
    this._valid = this.valid;
    if (this._valid !== oldValid) this.actions.trigger(ValidChangedAction, this, this.valid, oldValid);
  }

  get valid() {
    return this.errors.length === 0;
  }

  get fullValue(): any {
    return this.value;
  }

  get isChanged(): boolean {
    return !isEqual(this.value, this.originalValue);
  }

  registerAction(action: FieldActionBase): this {
    this.actions.register(action);
    action.boundToField(this);
    if (action.eager) {
      // When adding eager actions, execute them immediately
      this.actions.trigger(Object.getPrototypeOf(action).constructor, this, this.value, this.originalValue);
    }
    return this;
  }

  triggerAction<T2 extends FieldActionBase>(
    actionClass: (abstract new (...args: any[]) => T2) & { classIdentifier: symbol },
    ...params: any[]
  ): any {
    return this.actions.trigger(actionClass, this, ...params);
  }

  clearValidators(): void {
    this.actions = this.actions.cloneWithoutValidators();
    this.errors = [];
    this._valid = true;
  }
}
