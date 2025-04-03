import { isBoolean, isEqual } from 'lodash-es';
import { computed } from 'vue';

import ActionsMap from './actions/actions-map';
import { EnabledChangedAction, EnabledChangingAction } from './actions/enabled-actions';
import FieldActionBase from './actions/field-action-base';
import { ValidChangedAction } from './actions/valid-changed-action';
import { VisibilityChangedAction, VisibilityChangingAction } from './actions/visibility-actions';
import DisplayMode from './display-mode';
import { IField, IFieldAction } from './field.interface';
import { type Group } from './group';
import { ValidationError } from './validators';

// eslint-disable-next-line import/prefer-default-export
export abstract class FieldBase<T = any> implements IField<T> {
  abstract get value(): T;
  abstract set value(newValue: T);
  abstract setValue(newValue: T): Promise<void>;

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
    await this.actions.trigger(VisibilityChangedAction, this, this._visibility, oldValue);
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
    await this.actions.trigger(EnabledChangedAction, this, this._enabled, oldValue);
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
    const act = action as FieldActionBase;
    this.actions.register(act);
    act.boundToField(this);
    if (act.eager) {
      // When adding eager actions, execute them immediately
      this.actions.trigger(Object.getPrototypeOf(action).constructor, this, this.value, this.originalValue);
    }
    return this;
  }

  triggerAction<T2 extends IFieldAction<T>>(
    actionClass: new (...args: any[]) => T2,
    ...params: any[]
  ): any {
    return this.actions.trigger(actionClass as any, this, ...params);
  }
}
