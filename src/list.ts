import { isEmpty } from 'lodash-es';

import { ListItemAddedAction, ListItemRemovedAction } from './actions';
import { type ListSlots, listSlots } from './element-state';
import { FieldBase } from './field-base';
import { IFieldConstructorParams } from './field.interface';
import { GenericFieldsInterface, Group } from './group';
import { transactional, TxCapture, type TxSnapshot } from './transaction';

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

    // construction is one transaction, so the rows are all in place before anything is announced
    transactional(() => {
      if (params) {
        const { value: paramValue, validators, actions, ...otherParams } = params;
        // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
        // guards them too
        this.registerInitialActions([...(validators || []), ...(actions || [])]);
        Object.assign(this, otherParams);

        // a value that is undefined or null leaves the list empty, which is the state it starts in
        if (paramValue != null) this.setValueInternal(paramValue);
      }

      if (this.originalValue === undefined) this.originalValue = List.baseline(this.value);
      // the set a construction ends on is the list's first statement about itself rather than a change of one, so
      // the commit that closes the construction says nothing about it
      this.raw.announcedValue = this.value;
      this._actions?.triggerEager(this, this.value, this.originalValue);
      this.validate();
    });
  }

  /** The row array is copied as well: a rollback puts back the set the list held, not the array it went on to hold. */
  protected [TxCapture](): TxSnapshot {
    const captured = super[TxCapture]();
    captured.rows = this.raw.rows ? [...this.raw.rows] : this.raw.rows;
    return captured;
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
    // the row now reaches the form this list stands in, so a rule of its own that names a field up there - one no
    // record below could answer - is run over it here
    this.completeRecords(res);

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
    transactional((tx) => {
      tx.touch(this);
      // null is the value that clears, the same one Group.value = null writes into every member; without this a
      // list nested in a group would keep its rows while every sibling field was emptied
      if (newValue == null) {
        this.releaseRows();
        this.state.rows = null;
      } else if (Array.isArray(newValue)) {
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
      }
      this.bumpValueVersion();
    });
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
    transactional(() => {
      this.setValueInternal(newValue);
      // an assignment is a statement about the whole list, and it is announced as one without being compared away
      this.propagateValueChanged(true);
    });
  }

  /**
   * The rows are taken from `source` where the caller supplied no value of its own, so a list nested in a row that
   * a whole-list assignment reuses ends up holding what the template gives it rather than what it held before.
   */
  protected resetTo(source: FieldBase, value: any): void {
    transactional((tx) => {
      tx.touch(this);
      if (this.errors.length) this.errors = [];
      this.setValueInternal(value === undefined ? (source as List<T>).value : value);
      const built = this.value;
      // a list brought to the state a fresh one would be in makes no statement of its own: the container that
      // reset it announces the whole of it
      this.raw.announcedValue = built;
      this.originalValue = List.baseline(built);
      super.validate(true);
    });
  }

  get touched(): boolean {
    return this.state.rows?.some((item) => item.touched) || false;
  }

  set touched(touched: boolean) {
    transactional(() => {
      this.state.rows?.forEach((item) => {
        item.touched = touched;
      });
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
    res.clonedFrom(this, res.value, res.originalValue);
    return res;
  }

  /**
   * Records that a row changed its value, so that the transaction in progress works out at commit what this
   * list's own value became and announces it once. The mutation methods call it themselves; you rarely need to.
   */
  notifyValueChanged() {
    this.propagateValueChanged();
  }

  protected get composesValue(): boolean {
    return true;
  }

  /**
   * A list with nothing listening for its value does not compose one at all, so the copy it holds is from before
   * the changes nobody received. A registration that adds a listener brings it up to date here, and what the
   * listener is then told about is the change that follows it.
   */
  protected refreshPreviousValue(): void {
    this.raw.announcedValue = this.value;
  }

  get valid() {
    return this.validRead;
  }

  protected composeValid(): boolean {
    return this.state.errors.length === 0 && (this.state.rows?.every((item) => item.valid) ?? true);
  }

  validate(revalidate: boolean = false) {
    transactional(() => {
      // the items are revalidated first and the list forms its own verdict afterwards, over the finished set: an
      // item that turns valid while a later one is still to be checked announces nothing until the transaction
      // closes, so the list never reports a verdict over a half-revalidated set
      if (revalidate) this.state.rows?.forEach((item) => item.validate(true));
      super.validate(revalidate);
    });
  }

  protected get members(): FieldBase[] {
    return this.raw.rows ?? [];
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
    let removedItem: Group<T> | undefined;
    transactional((tx) => {
      if (this.state.rows == null || index < 0 || this.state.rows.length <= index) return;

      // the row array is recorded before the splice, so a rollback puts back the set the list held
      tx.touch(this);
      const row = this.state.rows.splice(index, 1)?.[0];
      if (!row) return;

      this.releaseChild(row);
      this.bumpValueVersion();
      // Remove parent reference
      removedItem = row.clone();

      // an item removed is a fact about an operation and has no net over a transaction, so it is queued in order
      // rather than compared away, and the commit emits it before the value the removal left behind
      tx.recordStructural(this, { actionClass: ListItemRemovedAction, item: removedItem, index });
      // one item fewer is a different set, so no comparison is needed to establish that the value changed
      this.propagateValueChanged(true);
    });

    return removedItem;
  }

  insert(item: any, index: number): number {
    let position = 0;
    transactional((tx) => {
      tx.touch(this);
      if (this.state.rows == null) this.state.rows = [];
      // a negative index counts back from the end and stops at the start, the way splice reads it, so the
      // position announced and returned is the one the item actually occupies
      position = index < 0 ? Math.max(this.state.rows.length + index, 0) : index;
      while (this.state.rows.length < position) {
        // if the index is too large for current array size, we add as many as necessary
        const itm = this.createPaddingItem();
        // push returns the new length, while the event carries the index of the item that was added
        const idx = this.state.rows.push(itm) - 1;
        this.bumpValueVersion();
        tx.recordStructural(this, { actionClass: ListItemAddedAction, item: itm, index: idx });
      }
      const itm = this.processSetValueItem(item);
      this.state.rows.splice(position, 0, itm);

      tx.recordStructural(this, { actionClass: ListItemAddedAction, item: itm, index: position });
      // one item more is a different set, so no comparison is needed to establish that the value changed
      this.bumpValueVersion();
      this.propagateValueChanged(true);
    });

    return position;
  }

  /** Drops every row this list holds out of its tally, so a row that changes its verdict later is not counted. */
  private releaseRows(): void {
    this.state.rows?.forEach((row) => this.releaseChild(row));
  }

  clear() {
    transactional((tx) => {
      const hadItems = (this.state.rows?.length ?? 0) > 0;
      tx.touch(this);
      this.releaseRows();
      this.state.rows = null;
      this.bumpValueVersion();
      this.propagateValueChanged(hadItems);
    });
  }
}

export type NullableList = List | null;
