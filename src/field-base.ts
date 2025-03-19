import { isBoolean, isEqual } from 'lodash-es';
import { computed } from 'vue';

import {
  ActionsMap,
  EnabledChangedAction,
  EnabledChangingAction,
  ValidChangedAction,
  VisibilityChangedAction,
  VisibilityChangingAction,
} from './actions';
import FieldActionBase from './actions/field-action-base';
import DisplayMode from './display-mode';
import { IField, IFieldAction } from './field.interface';
import { type Group } from './group';
import { ValidationError } from './validation-error';

// eslint-disable-next-line import/prefer-default-export
export abstract class FieldBase<T = any> implements IField<T> {
  abstract get value(): T;
  abstract set value(newValue: T);
  public readonly reactiveValue = computed(() => this.value);

  abstract clone(overrides?: Partial<IField<T>>): IField<T>;

  declare originalValue: T; // contains original field value as was provided at creation

  valid: boolean = true; // is current value valid as per FE and BE validators?

  errors: ValidationError[] = []; // list of errors

  declare parent?: Group; // when member of a Group, parent will specify that group

  declare fieldName?: string; // when member of a Group, fieldName specifies the name of this field

  protected actions: ActionsMap = new ActionsMap();

  // default property handlers
  private _visibility: DisplayMode = DisplayMode.FULL;

  get visibility(): DisplayMode { return this._visibility; }

  set visibility(newValue: DisplayMode) {
    const oldValue = this._visibility;
    if (!DisplayMode.isDefined(newValue)) throw new Error('visibility must be a DisplayMode constant');
    this._visibility = DisplayMode.fromAny(newValue);
    this.actions.trigger(VisibilityChangedAction, this, this._visibility, oldValue);
  }

  async setVisibility(newValue: DisplayMode) {
    const oldValue = this._visibility;
    const alteredValue = await this.actions.trigger(VisibilityChangingAction, this, newValue, oldValue);
    if (!DisplayMode.isDefined(alteredValue ?? newValue)) throw new Error('visibility must be a DisplayMode constant');
    this._visibility = DisplayMode.fromAny(alteredValue ?? newValue);
    this.actions.trigger(VisibilityChangedAction, this, this._visibility, oldValue);
  }

  private _enabled: boolean = true;

  get enabled(): boolean { return this._enabled; }

  set enabled(newValue: boolean) {
    const oldValue = this._enabled;
    if (!isBoolean(newValue)) throw new Error('Enabled value must be boolean');
    this._enabled = newValue;
    this.actions.trigger(EnabledChangedAction, this, this._enabled, oldValue);
  }

  async setEnabled(newValue: boolean) {
    const oldValue = this._enabled;
    const alteredValue = await this.actions.trigger(EnabledChangingAction, this, newValue, oldValue);
    if (!isBoolean(alteredValue ?? newValue)) throw new Error('Enabled value must be boolean');
    this._enabled = alteredValue ?? newValue;
    this.actions.trigger(EnabledChangedAction, this, this._enabled, oldValue);
  }

  validate() {
    const oldValid = this.valid;
    this.valid = this.errors.length === 0;
    if (this.valid !== oldValid) this.actions.trigger(ValidChangedAction, this, this.valid, oldValid);
  }

  get fullValue(): any {
    return this.value;
  }

  get isChanged() : boolean {
    return !isEqual(this.value, this.originalValue);
  }

  registerAction(action: IFieldAction<T>): this {
    this.actions.register(action as FieldActionBase);
    return this;
  }

  triggerAction<T2 extends IFieldAction<T>>(
    actionClass: new (...args: any[]) => T2,
    ...params: any[]
  ): any {
    return this.actions.trigger(actionClass as any, this, ...params);
  }
}
