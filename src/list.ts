import { isEmpty, isEqual } from 'lodash-es';

import { ListItemAddedAction, ListItemRemovedAction, ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IField, IFieldConstructorParams } from './field.interface';
import { GenericFieldsInterface, Group } from './group';

export class List<T extends GenericFieldsInterface = GenericFieldsInterface> extends FieldBase {
  private _value: Group<T>[] | null = null;

  private _itemTemplate?: Group<T>;

  private _previousValue: Record<string, any>[] | null;

  constructor(itemTemplate?: Group<T>, params?: Partial<IFieldConstructorParams>) {
    super();

    this._itemTemplate = itemTemplate;

    if (params) {
      const { value: paramValue, validators, actions, ...otherParams } = params;
      [...(validators || []), ...(actions || [])].forEach((a) => this.registerAction(a));
      Object.assign(this, otherParams);

      if (paramValue) this.setValueInternal(paramValue);
    }

    if (this.originalValue === undefined) this.originalValue = this.value;
    this._previousValue = this.value;
    // if (Object.keys(this._fields).length) console.log('formGroup created', this, Error().stack);
    this.actions.triggerEager(this, this.value, this.originalValue);
    this.validate();
  }

  private processSetValueItem(item: any) : Group<T> {
    let res: Group<T>;
    // If item is already a Group, use it
    if (item instanceof Group) res = item;
    // Otherwise create a Group from item
    // eslint-disable-next-line no-underscore-dangle
    else if (this._itemTemplate) res = this._itemTemplate.clone({ value: item });
    else res = Group.createFromFormData(item) as Group<T>;

    Object.defineProperty(res, 'parent', { get: () => this, configurable: false, enumerable: false });

    return res;
  }

  private setValueInternal(newValue: any[]) {
    if (Array.isArray(newValue)) {
      this._value = newValue.map((item: any) => this.processSetValueItem(item));
    }
  }

  get value(): Record<string, any>[] | null {
    const value = this._value?.map((item) => item.value);
    return isEmpty(value) ? null : <Record<string, any>[]> value;
  }

  set value(newValue: Record<string, any>[]) {
    const oldValue = this.value;
    this.setValueInternal(newValue);
    this.actions.trigger(ValueChangedAction, this, this.value, oldValue);
    if (this.parent) this.parent.notifyValueChanged();
    this.validate();
  }

  clone(overrides?: Partial<IField>): List<T> {
    const res = new List(this._itemTemplate?.clone(), {
      value: [...(overrides?.value ?? this.value)],
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : { }),
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });
    res.actions = this.actions.clone();
    res.actions.triggerEager(res, res.value, res.originalValue);
    return res;
  }

  notifyValueChanged() {
    const newValue = this.value;
    if (!isEqual(newValue, this._previousValue)) {
      const oldValue = this._previousValue;
      this._previousValue = newValue;
      this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
      if (this.parent) this.parent.notifyValueChanged();
      this.validate();
    }
  }

  get valid() {
    return super.valid && (this._value?.every((item) => item.valid) ?? true);
  }

  get(index: number): Group<T> | undefined {
    return this._value != null ? this._value[index] : undefined;
  }

  push(item: any): number {
    return this.insert(item, this._value?.length ?? 0) + 1;
  }

  pop(): Group<T> | undefined {
    return this.remove((this._value?.length ?? 0) - 1);
  }

  remove(index: number): Group<T> | undefined {
    if (this._value == null || index < 0 || this._value.length <= index) return undefined;

    let removedItem = this._value.splice(index, 1)?.[0];

    if (removedItem) {
      // Remove parent reference
      removedItem = removedItem.clone();

      // Trigger events
      this.actions.trigger(ListItemRemovedAction, this, removedItem, index);
      this.notifyValueChanged();
    }

    return removedItem;
  }

  insert(item: any, index: number): number {
    if (this._value == null) this._value = [];
    while (this._value.length < index) {
      // if the index is too large for current array size, we add as many as necessary
      const itm = this.processSetValueItem(null);
      const idx = this._value.push(itm);
      this.actions.trigger(ListItemAddedAction, this, itm, idx);
    }
    const itm = this.processSetValueItem(item);
    this._value.splice(index, 0, itm);

    this.actions.trigger(ListItemAddedAction, this, itm, index);
    this.notifyValueChanged();

    return index;
  }

  clear() {
    this._value = null;
    this.notifyValueChanged();
  }
}

export type NullableList = List | null;
