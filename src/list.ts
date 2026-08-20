import { isEmpty } from 'lodash-es';

import { ListItemAddedAction, ListItemRemovedAction } from './actions';
import { type ListSlots, listSlots } from './element-state';
import { FieldBase } from './field-base';
import { type Extras, IBindParams, IFieldParams } from './field.interface';
import { FieldsToFullValues, GenericFieldsInterface, Group } from './group';
import { transactional, TxCapture, type TxSnapshot } from './transaction';

/** what List.value reads back: one plain object per item, or null when the list is empty */
export type ListValue = Record<string, any>[] | null;

export class List<
  T extends GenericFieldsInterface = GenericFieldsInterface,
  X extends object = Extras,
> extends FieldBase<ListValue, X> {
  get [Symbol.toStringTag](): string {
    return 'List';
  }

  protected get state(): ListSlots<T> {
    return super.state as ListSlots<T>;
  }

  protected get raw(): ListSlots<T> {
    return super.raw as ListSlots<T>;
  }

  private _itemTemplate?: Group<T>;

  constructor(itemTemplate?: Group<T>, params?: IFieldParams<ListValue, X>) {
    super(listSlots<T>());

    this._itemTemplate = itemTemplate;

    // construction is one transaction, so the rows are all in place before anything is announced
    transactional(() => {
      if (params) {
        const { value: paramValue, validators, actions, ...otherParams } = params;
        // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
        // guards them too
        this.registerInitialActions([...(validators || []), ...(actions || [])]);
        this.assignParams(otherParams);

        // an assignment is made only for a value the caller actually supplied, and undefined is not one: spreading
        // an optional property yields an undefined value, so a list declared with an originalValue alone takes
        // its rows from that. An explicit null is a supplied value and leaves the list empty, which is the state
        // it starts in.
        if (paramValue !== undefined) this.setValueInternal(paramValue);
        else if (this.originalValue !== undefined) this.setValueInternal(this.originalValue);
      }

      this.constructed(params);

      if (this.originalValue === undefined) this.originalValue = List.baseline(this.value);
      // the set a construction ends on is the list's first statement about itself rather than a change of one, so
      // the commit that closes the construction says nothing about it
      this.raw.announcedValue = this.value;
      this.boundActions?.triggerEager(this, this.value, this.originalValue);
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
    else if (this._itemTemplate) res = this._itemTemplate.bind(item);
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
   * Builds the item that fills a gap left by an insert beyond the end of the list: the item template bound to its
   * own values, or an empty group when the list has no template.
   */
  private createPaddingItem(): Group<T> {
    return this.processSetValueItem(this._itemTemplate ? this._itemTemplate.bind() : null);
  }

  /** Records that the set of rows changed, so `items` rebuilds the frozen array it hands out at the next read. */
  private rowsChanged(): void {
    this.state.rowsVersion++;
  }

  /** True where `next` is a different set of rows than `previous`: another count, or another row at a position. */
  private static rowsDiffer(previous: Group<any>[] | null, next: Group<any>[] | null): boolean {
    const before = previous ?? [];
    const after = next ?? [];
    return before.length !== after.length || before.some((row, index) => row !== after[index]);
  }

  private setValueInternal(newValue: ListValue) {
    // a list holds rows, and nothing but an array states a set of them. The check stands before the transaction
    // opens, so a refused value leaves the rows the list holds exactly as they were.
    if (newValue != null && !Array.isArray(newValue)) {
      throw new TypeError('Invalid value provided: a list takes an array of rows, or null to empty it');
    }
    transactional((tx) => {
      tx.touch(this);
      // the set standing before the write, so that only an assignment that actually changes it makes `items` build
      // a new array: an assignment every row survives leaves the array a reader took as it is
      const held = this.raw.rows;
      // null is the value that clears, the same one Group.value = null writes into every member; without this a
      // list nested in a group would keep its rows while every sibling field was emptied
      if (newValue == null) {
        this.releaseRows();
        this.state.rows = null;
      } else {
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
      if (List.rowsDiffer(held, this.raw.rows)) this.rowsChanged();
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

  set value(newValue: ListValue) {
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

  bind(data?: ListValue, overrides?: IBindParams<ListValue, X>): List<T, X> {
    const template = this._itemTemplate?.bind();
    // construction goes through this.constructor so that a subclass binds into its own type
    const Ctor = this.constructor as new (itemTemplate?: Group<T>, params?: IFieldParams<ListValue, X>) => List<T, X>;
    const res = new Ctor(template, {
      // data is what the caller supplied, and undefined is not supplied; an explicit null is, and clears
      value: [...((data !== undefined ? data : this.value) ?? [])],
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : {}),
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    } as IFieldParams<ListValue, X>);
    // a subclass whose constructor does not take (itemTemplate, params) never sees either, so it would answer
    // with a list built from its own declaration rather than from this record. That is a difference no reader
    // would find, so it is refused here rather than returned.
    if (res._itemTemplate !== template) {
      throw new TypeError(
        `${this.constructor.name}.bind() built a list that did not take the item template it was given, so the ` +
          "binding would carry the declaration's rows. A subclass whose constructor does not take " +
          '(itemTemplate, params) has to override bind() and construct itself.',
      );
    }
    res.boundFrom(this, res.value, res.originalValue, overrides);
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

  get busy() {
    return this.busyRead;
  }

  protected composeBusy(): boolean {
    return this.state.rows?.some((item) => item.busy) ?? false;
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

  /**
   * How many rows this list holds. The read is tracked, so a template rendering off it re-renders as rows come and
   * go.
   */
  /**
   * Every row of this list, each one built from all of its fields. Where `value` states what the list serializes -
   * rows composed of the fields that are enabled, and null where the list is empty - this states what the list
   * holds: the disabled fields are in it too, and an empty list reads back as an empty array rather than as null.
   */
  get fullValue(): FieldsToFullValues<T>[] {
    return (this.state.rows ?? []).map((row) => row.fullValue);
  }

  get length(): number {
    return this.state.rows?.length ?? 0;
  }

  /**
   * The rows this list holds, oldest position first. The array is a frozen copy: it states what the list held at
   * the read and nothing writes back through it - `push`, `insert`, `remove` and `clear` are what change the set -
   * so a caller may hold on to it. The rows in it are the live elements, so reading one reports what it holds now.
   *
   * The copy is built once per change of the set and handed to every reader until the next one: a write inside a
   * row changes what the list serializes without changing which rows it holds, and the array a reader took stays
   * the same one across such a write.
   */
  get items(): readonly Group<T>[] {
    // the version is a tracked read and the cache is not, so a reader answered from the cache still re-runs when
    // the set of rows changes
    const version = this.state.rowsVersion;
    if (this.raw.cachedItemsVersion !== version) {
      this.raw.cachedItems = Object.freeze([...(this.raw.rows ?? [])]);
      this.raw.cachedItemsVersion = version;
    }
    return this.raw.cachedItems!;
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

      // the row itself is what leaves the list: releaseChild has taken the back-reference away, so it carries
      // nothing of the list it stood in and is free to be taken by another container, and what it holds - the
      // values it ended up with, its errors, the change history behind isChanged - is the row's to report
      this.releaseChild(row);
      this.rowsChanged();
      this.bumpValueVersion();
      removedItem = row;

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
      this.rowsChanged();
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
      // a list that held nothing holds the same nothing afterwards, so the array `items` hands out stands
      if (hadItems) this.rowsChanged();
      this.bumpValueVersion();
      this.propagateValueChanged(hadItems);
    });
  }
}

export type NullableList = List | null;
