import { isEmpty, isEqual } from 'lodash-es';

import { ListItemAddedAction, ListItemRemovedAction, ValueChangedAction } from './actions';
import { FieldBase } from './field-base';
import { IFieldConstructorParams } from './field.interface';
import { GenericFieldsInterface, Group } from './group';

/** what List.value reads back: one plain object per item, or null when the list is empty */
export type ListValue = Record<string, any>[] | null;

export class List<T extends GenericFieldsInterface = GenericFieldsInterface> extends FieldBase<ListValue> {
  private _value: Group<T>[] | null = null;

  private _itemTemplate?: Group<T>;

  private _previousValue: ListValue;

  constructor(itemTemplate?: Group<T>, params?: Partial<IFieldConstructorParams<ListValue>>) {
    super();

    this._itemTemplate = itemTemplate;

    if (params) {
      const { value: paramValue, validators, actions, ...otherParams } = params;
      // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
      // guards them too
      this.registerInitialActions([...(validators || []), ...(actions || [])]);
      Object.assign(this, otherParams);

      // the items are installed directly, so nothing is announced over a list that is only partly built; a value
      // that is undefined or null leaves the list empty, which is the state it starts in
      if (paramValue != null) this.setValueInternal(paramValue);
    }

    if (this.originalValue === undefined) this.originalValue = this.value;
    this._previousValue = this.value;
    // if (Object.keys(this._fields).length) console.log('formGroup created', this, Error().stack);
    this.actions.triggerEager(this, this.value, this.originalValue);
    this.validate();
  }

  private processSetValueItem(item: any): Group<T> {
    let res: Group<T>;
    // If item is already a Group, use it
    if (item instanceof Group) res = item;
    // Otherwise create a Group from item
    else if (this._itemTemplate) res = this._itemTemplate.clone({ value: item });
    else res = Group.createFromFormData(item) as Group<T>;

    Object.defineProperty(res, 'parent', { get: () => this, configurable: false, enumerable: false });

    return res;
  }

  /**
   * Builds the item that fills a gap left by an insert beyond the end of the list: a copy of the item template with
   * the template's own values, or an empty group when the list has no template.
   */
  private createPaddingItem(): Group<T> {
    return this.processSetValueItem(this._itemTemplate ? this._itemTemplate.clone() : null);
  }

  private setValueInternal(newValue: any[]) {
    if (Array.isArray(newValue)) {
      this._value = newValue.map((item: any) => this.processSetValueItem(item));
    }
  }

  get value(): ListValue {
    const value = this._value?.map((item) => item.value);
    return isEmpty(value) ? null : <Record<string, any>[]>value;
  }

  set value(newValue: Record<string, any>[]) {
    const oldValue = this._previousValue;
    this.setValueInternal(newValue);
    const currentValue = this.value;
    // the cache is refreshed before the event, exactly as notifyValueChanged() does it: an item that reports a
    // change while the handlers run must compare against the value just assigned, not against the one replaced
    this._previousValue = currentValue;
    // the parent learns of the new value below and validates itself from there, over the whole value; a validator
    // running on this list must therefore not send it a verdict of its own in the meantime
    const outerClimb = this.suppressParentValidityClimb;
    this.suppressParentValidityClimb = true;
    try {
      this.actions.trigger(ValueChangedAction, this, currentValue, oldValue);
      if (this.parent) this.parent.notifyValueChanged();
    } finally {
      this.suppressParentValidityClimb = outerClimb;
    }
    this.validate();
    // a parent whose own value did not change by this one returns from notifyValueChanged() without validating, so
    // a validity change held back above still has to reach it
    this.flushParentValidityClimb();
  }

  get touched(): boolean {
    return this._value?.some((item) => item.touched) || false;
  }

  set touched(touched: boolean) {
    this._value?.forEach((item) => {
      item.touched = touched;
    });
  }

  clone(overrides?: Partial<IFieldConstructorParams<ListValue>>): List<T> {
    const res = new List(this._itemTemplate?.clone(), {
      // an override value is one the caller supplied, and undefined is not one; an explicit null is, and clears
      value: [...((overrides?.value !== undefined ? overrides.value : this.value) ?? [])],
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
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
      const outerClimb = this.suppressParentValidityClimb;
      this.suppressParentValidityClimb = true;
      try {
        this.actions.trigger(ValueChangedAction, this, newValue, oldValue);
        if (this.parent) this.parent.notifyValueChanged();
      } finally {
        this.suppressParentValidityClimb = outerClimb;
      }
      this.validate();
      this.flushParentValidityClimb();
    }
  }

  get valid() {
    return super.valid && (this._value?.every((item) => item.valid) ?? true);
  }

  validate(revalidate: boolean = false) {
    if (revalidate) {
      // the items are revalidated with the list held back, so an item that turns valid while a later one is still
      // to be checked cannot make the list announce a verdict over a half-revalidated set. The list forms its own
      // verdict below, once, over the finished set.
      const outerValidation = this.suppressValidation;
      this.suppressValidation = true;
      try {
        this._value?.forEach((item) => item.validate(true));
      } finally {
        this.suppressValidation = outerValidation;
      }
    }
    super.validate(revalidate);
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
    // a negative index counts back from the end and stops at the start, the way splice reads it, so the
    // position announced and returned is the one the item actually occupies
    const position = index < 0 ? Math.max(this._value.length + index, 0) : index;
    while (this._value.length < position) {
      // if the index is too large for current array size, we add as many as necessary
      const itm = this.createPaddingItem();
      // push returns the new length, while the event carries the index of the item that was added
      const idx = this._value.push(itm) - 1;
      this.actions.trigger(ListItemAddedAction, this, itm, idx);
    }
    const itm = this.processSetValueItem(item);
    this._value.splice(position, 0, itm);

    this.actions.trigger(ListItemAddedAction, this, itm, position);
    this.notifyValueChanged();

    return position;
  }

  clear() {
    this._value = null;
    this.notifyValueChanged();
  }
}

export type NullableList = List | null;
