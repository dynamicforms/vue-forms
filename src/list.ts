import { isPlainObject } from 'lodash-es';

import { ListItemAddedAction, ListItemRemovedAction } from './actions';
import { Container } from './container';
import { type ListSlots, listSlots } from './element-state';
import { Field } from './field';
import { FieldBase } from './field-base';
import { type Extras, IBindParams, IFieldParams } from './field.interface';
import { Group } from './group';
import { transactional, TxCapture, type TxSnapshot } from './transaction';

/**
 * The value of a List of R: the value of each row it sends, `null` for a row whose access is `'disabled-null'`,
 * and `[]` if it sends no rows
 */
export type ListValue<R extends FieldBase = Group> = (R['value'] | null)[];
/** what List.value and the List constructor accept: an array of rows, or null, which empties the list */
export type ListValueInput<R extends FieldBase = Group> = ListValue<R> | null;
/** the value of List.fullValue: the full value of every row, whatever its access */
export type ListFullValue<R extends FieldBase = Group> = R['fullValue'][];

/** the value of a list without rows; it is frozen like every value a list builds */
const emptyListValue: readonly any[] = Object.freeze([]);

export class List<R extends FieldBase = Group, X extends object = Extras> extends Container<ListValue<R>, X> {
  get [Symbol.toStringTag](): string {
    return 'List';
  }

  protected get state(): ListSlots<R> {
    return super.state as ListSlots<R>;
  }

  protected get raw(): ListSlots<R> {
    return super.raw as ListSlots<R>;
  }

  private _itemTemplate?: R;

  constructor(itemTemplate?: undefined, params?: IFieldParams<ListValueInput<R>, X>);
  constructor(itemTemplate: R, params?: IFieldParams<ListValueInput<R>, X>);
  constructor(itemTemplate?: R, params?: IFieldParams<ListValueInput<R>, X>) {
    super(listSlots<R>());

    this._itemTemplate = itemTemplate;

    // construction is one transaction, so all rows are in place before anything is announced
    transactional(() => {
      if (params) {
        const { value: paramValue, validators, actions, ...otherParams } = params;
        // actions are registered before the remaining parameters are assigned, so a *Changing* action supplied here
        // also applies to those assignments
        this.registerInitialActions([...(validators || []), ...(actions || [])]);
        this.assignParams(otherParams);

        // the value is assigned only if supplied, and undefined counts as not supplied (spreading an optional
        // property yields undefined), so a list declared with only an originalValue takes its rows from it. An
        // explicit null is a supplied value and leaves the list empty, its initial state.
        if (paramValue !== undefined) this.setValueInternal(paramValue);
        else if (this.originalValue !== undefined) this.setValueInternal(this.originalValue);
      }

      this.constructed(params);

      if (this.originalValue === undefined) this.originalValue = List.baseline(this.value);
      // the rows a construction ends with are the list's initial state, not a change, so the commit that closes
      // the construction announces nothing for them
      this.recordAnnounced();
      this.boundActions?.triggerEager(this, this.contribution, this.originalValue);
      this.validate();
    });
  }

  /** The row array is copied as well, so a rollback restores the rows the list held before the transaction. */
  protected [TxCapture](): TxSnapshot {
    const captured = super[TxCapture]();
    captured.rows = this.raw.rows ? [...this.raw.rows] : this.raw.rows;
    return captured;
  }

  /**
   * A copy of a built value, used as a baseline. The value getter returns one array per version, and a baseline
   * holding that same array would make every value equal to its original.
   */
  private static baseline<V extends any[] | null>(value: V): V {
    return (value == null ? value : [...value]) as V;
  }

  private processSetValueItem(item: any): R {
    let res: R;
    // an item that is already an element is used as is, and data is bound to the item template
    if (item instanceof FieldBase) res = item as R;
    else if (this._itemTemplate) res = this._itemTemplate.bind(item) as R;
    else res = List.elementFor(item) as R;

    // an item that already belongs to a container throws here; one this list released earlier has no parent link
    // and is taken like any other
    this.takeChild(res);
    // the row is now connected to the form above this list, so a rule of the row that refers to an element there
    // (one no record below can resolve) runs over it here
    this.completeRecords(res);

    return res;
  }

  /**
   * The row a list without an item template builds from `item`: a `Group` of fields from a plain object, a `List`
   * from an array, and a `Field` holding anything else.
   */
  private static elementFor(item: unknown): FieldBase {
    if (isPlainObject(item)) return Group.createFromFormData(item as Record<string, any>);
    if (Array.isArray(item)) return new List(undefined, { value: item });
    return new Field({ value: item });
  }

  /**
   * Builds an item that fills a gap left by an insert beyond the end of the list: the item template bound to its
   * own values, or, if the list has no item template, an empty element of the kind `item` is built into.
   */
  private createPaddingItem(item: unknown): R {
    if (this._itemTemplate) return this.processSetValueItem(this._itemTemplate.bind());
    if (item instanceof Group || isPlainObject(item)) return this.processSetValueItem({});
    if (item instanceof List || Array.isArray(item)) return this.processSetValueItem([]);
    return this.processSetValueItem(undefined);
  }

  /** Records that the set of rows changed, so `items` rebuilds its frozen array at the next read. */
  private rowsChanged(): void {
    this.state.rowsVersion++;
  }

  /** True if `next` is a different set of rows than `previous`: a different count, or a different row at a position. */
  private static rowsDiffer(previous: FieldBase[] | null, next: FieldBase[] | null): boolean {
    const before = previous ?? [];
    const after = next ?? [];
    return before.length !== after.length || before.some((row, index) => row !== after[index]);
  }

  private setValueInternal(newValue: readonly unknown[] | null) {
    // only an array (or null) is a valid list value. The check runs before the transaction opens, so a rejected
    // value leaves the rows unchanged.
    if (newValue != null && !Array.isArray(newValue)) {
      throw new TypeError('Invalid value provided: a list takes an array of rows, or null to empty it');
    }
    transactional((tx) => {
      tx.touch(this);
      // the rows before the write, so `items` builds a new array only if the assignment changes the set of rows; an
      // assignment that keeps every row keeps the array a reader already has
      const held = this.raw.rows;
      // null clears the list, as Group.value = null writes null into every member; otherwise a list nested in a
      // group would keep its rows while every sibling field was cleared
      if (newValue == null) {
        this.releaseRows();
        this.state.rows = null;
      } else {
        const previous = this.state.rows ?? [];
        // the new rows are built in a separate array and installed together: writing a row runs its validators, and
        // a validator that reads this list during the loop must not see an unfilled position
        const rows: R[] = new Array(newValue.length);
        for (let index = 0; index < newValue.length; index++) {
          const item = newValue[index];
          const row = previous[index];
          // an existing row at this index takes the new item, so its identity is kept and a keyed v-for keeps the
          // component rendering it. This requires an item template: a list without one builds each row from its
          // own data, so two rows can have different members, and writing one row's data into another's members
          // would drop the members they do not share. The row is reset, not assigned, so it ends in the state of a
          // row built for this position.
          if (row && this._itemTemplate && !(item instanceof FieldBase)) {
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
      if (List.rowsDiffer(held, this.raw.rows)) this.rowsChanged();
      this.bumpValueVersion();
    });
  }

  get value(): ListValue<R> {
    // the version read is tracked and the cache read is not, so a reader served from the cache still depends on
    // every write below this list, without repeating the walk over its rows
    const version = this.valueVersion;
    if (this.raw.cachedValueVersion === version) return this.raw.cachedValue;

    const value: unknown[] = [];
    (this.state.rows ?? []).forEach((row) => {
      switch (this.childSerializesAs(row, 'value')) {
        case 'value':
          value.push(row.value);
          break;
        case 'null':
          value.push(null);
          break;
        case 'omit':
          break;
      }
    });
    // the array is shared with later readers, so it is frozen, as is every row object in it; a write into either
    // would change the list's value without any row holding that value. A list without rows returns [].
    const built = (value.length ? Object.freeze(value) : emptyListValue) as ListValue<R>;
    this.raw.cachedValue = built;
    this.raw.cachedValueVersion = version;
    return built;
  }

  set value(newValue: ListValueInput<R>) {
    transactional(() => {
      this.setValueInternal(newValue);
      // an assignment replaces the whole list and is always announced, without a comparison
      this.propagateValueChanged(true);
    });
  }

  /**
   * If no value is supplied, the rows are taken from `source`, so a list nested in a row reused by a whole-list
   * assignment ends up with the item template's rows, not its previous ones.
   */
  protected resetTo(source: FieldBase, value: any): void {
    transactional((tx) => {
      tx.touch(this);
      if (this.errors.length) this.errors = [];
      this.setValueInternal(value === undefined ? (source as List<R>).fullValue : value);
      // a reset list announces nothing itself: the container that reset it announces the change
      this.recordAnnounced();
      this.originalValue = List.baseline(this.value);
      super.validate(true);
    });
  }

  bind(data?: ListValueInput<R>, overrides?: IBindParams<ListValueInput<R>, X>): List<R, X> {
    const template = this._itemTemplate?.bind() as R | undefined;
    // construction goes through this.constructor so that a subclass binds into its own type
    const Ctor = this.constructor as new (itemTemplate?: R, params?: IFieldParams<ListValueInput<R>, X>) => List<R, X>;
    const res = new Ctor(template, {
      // undefined data counts as not supplied; an explicit null is supplied and clears. The copied value is what
      // the list holds (fullValue), not what it sends, so a row that sends nothing keeps its data
      value: [...((data !== undefined ? data : this.fullValue) ?? [])],
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
      access: overrides?.access ?? this.access,
      visibility: overrides?.visibility ?? this.visibility,
    } as IFieldParams<ListValueInput<R>, X>);
    // a subclass whose constructor does not take (itemTemplate, params) ignores both and would return a list built
    // from its own declaration instead of this record. The difference would not be visible, so it throws here.
    if (res._itemTemplate !== template) {
      throw new TypeError(
        `${this.constructor.name}.bind() built a list that did not take the item template it was given, so the ` +
          "binding would carry the declaration's rows. A subclass whose constructor does not take " +
          '(itemTemplate, params) has to override bind() and construct itself.',
      );
    }
    res.boundFrom(this, res.contribution, res.originalValue, overrides);
    return res;
  }

  protected get members(): FieldBase[] {
    return this.raw.rows ?? [];
  }

  protected get children(): readonly FieldBase[] {
    return this.state.rows ?? [];
  }

  /**
   * The full value of every row. `value` is what the list sends; `fullValue` is what the list holds: every row
   * whatever its access, and every field of a group row. A binding or a reset copies it.
   */
  get fullValue(): ListFullValue<R> {
    return (this.state.rows ?? []).map((row) => row.fullValue);
  }

  /**
   * The number of rows this list holds. The read is tracked, so a template that reads it re-renders when rows are
   * added or removed.
   */
  get length(): number {
    return this.state.rows?.length ?? 0;
  }

  /**
   * The rows this list holds, in position order. The array is a frozen copy of the rows at the time of the read and
   * cannot be written through (`push`, `insert`, `remove` and `clear` change the rows), so a caller may keep it. The
   * rows in it are the live elements, so a row read from it returns its current state.
   *
   * The copy is built once per change of the set of rows and returned to every reader until the next change: a
   * write inside a row changes what the list sends without changing which rows it holds, and the array stays the
   * same across such a write.
   */
  get items(): readonly R[] {
    // the version read is tracked and the cache read is not, so a reader served from the cache still re-runs when
    // the set of rows changes
    const version = this.state.rowsVersion;
    if (this.raw.cachedItemsVersion !== version) {
      this.raw.cachedItems = Object.freeze([...(this.raw.rows ?? [])]);
      this.raw.cachedItemsVersion = version;
    }
    return this.raw.cachedItems!;
  }

  get(index: number): R | undefined {
    return this.state.rows != null ? this.state.rows[index] : undefined;
  }

  push(item: any): number {
    return this.insert(item, this.state.rows?.length ?? 0) + 1;
  }

  pop(): R | undefined {
    return this.remove((this.state.rows?.length ?? 0) - 1);
  }

  remove(index: number): R | undefined {
    let removedItem: R | undefined;
    transactional((tx) => {
      if (this.state.rows == null || index < 0 || this.state.rows.length <= index) return;

      // the row array is recorded before the splice, so a rollback restores the rows
      tx.touch(this);
      const row = this.state.rows.splice(index, 1)?.[0];
      if (!row) return;

      // the removed row is returned as is: releaseChild clears its back-reference, so another container can take
      // it, and it keeps its values, its errors and the change history behind isChanged
      this.releaseChild(row);
      this.rowsChanged();
      this.bumpValueVersion();
      removedItem = row;

      // a removal is an operation with no net result over a transaction, so it is queued in order without a
      // comparison, and the commit emits it before the resulting value change
      tx.recordStructural(this, { actionClass: ListItemRemovedAction, item: removedItem, index });
      // one item fewer is a different set, so the value change is announced without a comparison
      this.propagateValueChanged(true);
    });

    return removedItem;
  }

  insert(item: any, index: number): number {
    let position = 0;
    transactional((tx) => {
      tx.touch(this);
      if (this.state.rows == null) this.state.rows = [];
      // a negative index counts back from the end and is clamped at the start, as in splice, so the announced and
      // returned position is the one the item occupies
      position = index < 0 ? Math.max(this.state.rows.length + index, 0) : index;
      while (this.state.rows.length < position) {
        // an index beyond the end is reached by adding padding items
        const itm = this.createPaddingItem(item);
        // push returns the new length, while the event carries the index of the item that was added
        const idx = this.state.rows.push(itm) - 1;
        this.bumpValueVersion();
        tx.recordStructural(this, { actionClass: ListItemAddedAction, item: itm, index: idx });
      }
      const itm = this.processSetValueItem(item);
      this.state.rows.splice(position, 0, itm);

      tx.recordStructural(this, { actionClass: ListItemAddedAction, item: itm, index: position });
      // one item more is a different set, so the value change is announced without a comparison
      this.rowsChanged();
      this.bumpValueVersion();
      this.propagateValueChanged(true);
    });

    return position;
  }

  /** Releases every row from this list, so a later validity change of a row does not affect its invalid count. */
  private releaseRows(): void {
    this.state.rows?.forEach((row) => this.releaseChild(row));
  }

  clear() {
    transactional((tx) => {
      const hadItems = (this.state.rows?.length ?? 0) > 0;
      tx.touch(this);
      this.releaseRows();
      this.state.rows = null;
      // clearing a list without rows does not change its rows, so the array `items` returns is kept
      if (hadItems) this.rowsChanged();
      this.bumpValueVersion();
      this.propagateValueChanged(hadItems);
    });
  }
}

export type NullableList = List | null;
