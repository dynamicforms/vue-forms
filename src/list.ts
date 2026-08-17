import { isEmpty, isEqual } from 'lodash-es';

import { ListItemAddedAction, ListItemRemovedAction, ValueChangedAction } from './actions';
import { ValueChangedActionClassIdentifier } from './actions/value-changed-action';
import { type ListSlots, listSlots } from './element-state';
import { FieldBase } from './field-base';
import { IFieldConstructorParams } from './field.interface';
import { GenericFieldsInterface, Group } from './group';

/** what List.value reads back: one plain object per item, or null when the list is empty */
export type ListValue = Record<string, any>[] | null;

export class List<T extends GenericFieldsInterface = GenericFieldsInterface> extends FieldBase<ListValue> {
  protected get state(): ListSlots<T> {
    return super.state as ListSlots<T>;
  }

  protected get raw(): ListSlots<T> {
    return super.raw as ListSlots<T>;
  }

  private _itemTemplate?: Group<T>;

  constructor(itemTemplate?: Group<T>, params?: Partial<IFieldConstructorParams<ListValue>>) {
    super(listSlots<T>());

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

    if (this.originalValue === undefined) this.originalValue = List.baseline(this.value);
    this.raw.announcedValue = this.value;
    this._actions?.triggerEager(this, this.value, this.originalValue);
    this.validate();
  }

  /**
   * The copy of a built value that serves as a baseline. The value getter hands out one array per version, and a
   * baseline holding that same array would report every value as its own original.
   */
  private static baseline(value: ListValue): ListValue {
    return value == null ? value : [...value];
  }

  private processSetValueItem(item: any): Group<T> {
    let res: Group<T>;
    // If item is already a Group, use it
    if (item instanceof Group) res = item;
    // Otherwise create a Group from item
    else if (this._itemTemplate) res = this._itemTemplate.clone({ value: item });
    else res = Group.createFromFormData(item) as Group<T>;

    // an item that already belongs to a container is refused here; one this list released earlier carries no
    // link any more and is taken like any other
    this.takeChild(res);

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
    // null is the value that clears, the same one Group.value = null writes into every member; without this a
    // list nested in a group would keep its rows while every sibling field was emptied
    if (newValue == null) {
      this.releaseRows();
      this.state.rows = null;
    } else if (Array.isArray(newValue)) {
      // a row that takes the new item announces the change on its own and would carry it up here in the middle of
      // the walk; the list makes its own statement once, over the finished set, and the caller announces it
      const outerNotify = this.raw.suppressNotifyValueChanged;
      const outerValidation = this.suppressValidation;
      this.raw.suppressNotifyValueChanged = true;
      this.suppressValidation = true;
      try {
        const previous = this.state.rows ?? [];
        // the new set is built beside the one in place and installed whole: writing a row runs its validators, and
        // one reading this list in the middle of the walk must not be shown a position that has yet to be filled
        const rows: Group<T>[] = new Array(newValue.length);
        for (let index = 0; index < newValue.length; index++) {
          const item = newValue[index];
          const row = previous[index];
          // a row already standing at this index takes the new item, so its identity survives the assignment and
          // a keyed v-for keeps the component rendering it. It needs an item template: a list without one builds
          // every row from its own data, so two rows need not carry the same members and writing one row's data
          // into another's members would drop whatever they do not have in common. The row is reset rather than
          // assigned, so it ends up as the row built for this position would have been.
          if (row && this._itemTemplate && !(item instanceof Group)) {
            this.resetChild(row, this._itemTemplate, item);
            rows[index] = row;
          } else {
            if (row) this.releaseChild(row);
            rows[index] = this.processSetValueItem(item);
          }
        }
        for (let index = newValue.length; index < previous.length; index++) this.releaseChild(previous[index]);
        this.state.rows = rows;
      } finally {
        this.raw.suppressNotifyValueChanged = outerNotify;
        this.suppressValidation = outerValidation;
      }
    }
    this.bumpValueVersion();
  }

  get value(): ListValue {
    // the version is a tracked read and the cache is not, so a reader that is answered from the cache still
    // depends on every write below this list without the walk over its rows being repeated for it
    const version = this.valueVersion;
    if (this.raw.cachedValueVersion === version) return this.raw.cachedValue;

    const value = this.state.rows?.map((item) => item.value);
    // the array outlives the read that built it - the next reader is answered with the very same one - so it is
    // frozen, as is every row object in it; a caller writing into either would change what the list reports
    // without any row holding that value
    const built = isEmpty(value) ? null : (Object.freeze(value) as Record<string, any>[]);
    this.raw.cachedValue = built;
    this.raw.cachedValueVersion = version;
    return built;
  }

  set value(newValue: Record<string, any>[]) {
    this.setValueInternal(newValue);
    // an assignment is a statement about the whole list, and it is announced as one without being compared away
    this.announceValueChanged(true);
  }

  /**
   * Announces the value the list now holds, as the pair (value now, value at the previous announcement), and
   * carries the change up to the parent. `forced` states that the caller already knows the set changed, so the
   * comparison that would otherwise establish it is skipped.
   *
   * The pair is only built where something receives it: with no ValueChangedAction and no eager action riding
   * along, walking the rows would produce an array nobody reads. The notification of the parent and this list's
   * own recomputation still happen - the rows keep the tally the recomputation reads up to date themselves.
   */
  private announceValueChanged(forced: boolean) {
    const actions = this._actions?.willTrigger(ValueChangedActionClassIdentifier) ? this._actions : undefined;
    let newValue: ListValue = null;
    let oldValue: ListValue = null;
    if (actions) {
      newValue = this.value;
      if (!forced && isEqual(newValue, this.raw.announcedValue)) return;
      oldValue = this.raw.announcedValue;
      // the cache is refreshed before the event: an item that reports a change while the handlers run must
      // compare against the value just assigned, not against the one replaced
      this.raw.announcedValue = newValue;
    }
    // the parent learns of the new value below and validates itself from there, over the whole value; a validator
    // running on this list must therefore not send it a verdict of its own in the meantime
    const outerClimb = this.suppressParentValidityClimb;
    this.suppressParentValidityClimb = true;
    try {
      if (actions) actions.trigger(ValueChangedAction, this, newValue, oldValue);
      if (this.parent) this.parent.notifyValueChanged();
    } finally {
      this.suppressParentValidityClimb = outerClimb;
      this.validate();
      // a parent whose own value did not change by this one returns from notifyValueChanged() without validating,
      // so a validity change held back above still has to reach it. Both run even when a handler threw, or the
      // parent would keep a verdict the members no longer support.
      this.flushParentValidityClimb();
    }
  }

  /**
   * The rows are taken from `source` where the caller supplied no value of its own, so a list nested in a row that
   * a whole-list assignment reuses ends up holding what the template gives it rather than what it held before.
   */
  protected resetTo(source: FieldBase, value: any): void {
    if (this.errors.length) this.errors = [];
    this.setValueInternal(value === undefined ? (source as List<T>).value : value);
    const built = this.value;
    this.raw.announcedValue = built;
    this.originalValue = List.baseline(built);
    super.validate(true);
  }

  get touched(): boolean {
    return this.state.rows?.some((item) => item.touched) || false;
  }

  set touched(touched: boolean) {
    this.state.rows?.forEach((item) => {
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
    if (this._actions) {
      const actions = this._actions.clone();
      res._actions = actions;
      actions.triggerEager(res, res.value, res.originalValue);
    }
    return res;
  }

  notifyValueChanged() {
    if (this.raw.suppressNotifyValueChanged) return;
    this.announceValueChanged(false);
  }

  protected refreshPreviousValue(): void {
    this.raw.announcedValue = this.value;
  }

  get valid() {
    return this.validRead;
  }

  protected composeValid(): boolean {
    return this.errors.length === 0 && (this.state.rows?.every((item) => item.valid) ?? true);
  }

  validate(revalidate: boolean = false) {
    if (revalidate) {
      // the items are revalidated with the list held back, so an item that turns valid while a later one is still
      // to be checked cannot make the list announce a verdict over a half-revalidated set. The list forms its own
      // verdict below, once, over the finished set.
      const outerValidation = this.suppressValidation;
      this.suppressValidation = true;
      try {
        this.state.rows?.forEach((item) => item.validate(true));
      } finally {
        this.suppressValidation = outerValidation;
      }
    }
    super.validate(revalidate);
  }

  get(index: number): Group<T> | undefined {
    return this.state.rows != null ? this.state.rows[index] : undefined;
  }

  push(item: any): number {
    return this.insert(item, this.state.rows?.length ?? 0) + 1;
  }

  pop(): Group<T> | undefined {
    return this.remove((this.state.rows?.length ?? 0) - 1);
  }

  remove(index: number): Group<T> | undefined {
    if (this.state.rows == null || index < 0 || this.state.rows.length <= index) return undefined;

    let removedItem = this.state.rows.splice(index, 1)?.[0];

    if (removedItem) {
      this.releaseChild(removedItem);
      this.bumpValueVersion();
      // Remove parent reference
      removedItem = removedItem.clone();

      // Trigger events
      this._actions?.trigger(ListItemRemovedAction, this, removedItem, index);
      // one item fewer is a different set, so no comparison is needed to establish that the value changed
      this.announceValueChanged(true);
    }

    return removedItem;
  }

  insert(item: any, index: number): number {
    if (this.state.rows == null) this.state.rows = [];
    // a negative index counts back from the end and stops at the start, the way splice reads it, so the
    // position announced and returned is the one the item actually occupies
    const position = index < 0 ? Math.max(this.state.rows.length + index, 0) : index;
    while (this.state.rows.length < position) {
      // if the index is too large for current array size, we add as many as necessary
      const itm = this.createPaddingItem();
      // push returns the new length, while the event carries the index of the item that was added
      const idx = this.state.rows.push(itm) - 1;
      this.bumpValueVersion();
      this._actions?.trigger(ListItemAddedAction, this, itm, idx);
    }
    const itm = this.processSetValueItem(item);
    this.state.rows.splice(position, 0, itm);
    this.bumpValueVersion();

    this._actions?.trigger(ListItemAddedAction, this, itm, position);
    // one item more is a different set, so no comparison is needed to establish that the value changed
    this.announceValueChanged(true);

    return position;
  }

  /** Drops every row this list holds out of its tally, so a row that changes its verdict later is not counted. */
  private releaseRows(): void {
    this.state.rows?.forEach((row) => this.releaseChild(row));
  }

  clear() {
    const hadItems = (this.state.rows?.length ?? 0) > 0;
    this.releaseRows();
    this.state.rows = null;
    this.bumpValueVersion();
    this.announceValueChanged(hadItems);
  }
}

export type NullableList = List | null;
