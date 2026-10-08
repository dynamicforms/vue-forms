import { Container } from './container';
import { FieldBase } from './field-base';
import { type GenericFieldsInterface, Group } from './group';
import { List } from './list';
import { transaction } from './transaction';

/** the type a view returns for a member: the view of a container, the value of any other element */
type Slot<E> = E extends Container ? View<E> : E extends FieldBase ? E['value'] : never;

/** the data keys of a group's view */
type GroupData<F extends GenericFieldsInterface> = {
  // a container's value is assigned through `$.value`, so its key is read-only; a field's key reads and writes
  // its value
  readonly [K in keyof F as F[K] extends Container ? K : never]: Slot<F[K]>;
} & {
  -readonly [K in keyof F as F[K] extends Container ? never : K]: Slot<F[K]>;
};

/** what a list's view accepts as a row: the data a row is built from, an element, or the view of one */
type RowInput<R extends FieldBase> = R['value'] | R | View<R>;

/** the type of a list's view: every array read, and the mutations performed as the list's own operations */
type ListData<R extends FieldBase> = Omit<Slot<R>[], 'push' | 'unshift' | 'splice' | 'fill' | 'copyWithin'> & {
  push(...items: RowInput<R>[]): number;
  unshift(...items: RowInput<R>[]): number;
  splice(start: number, deleteCount?: number, ...items: RowInput<R>[]): Slot<R>[];
};

/**
 * An element presented as its data: the members of a group, or the rows of a list, as plain properties, and the
 * element itself as `$`. See `view()`.
 */
export type View<E extends FieldBase> = (E extends Group<infer F, any>
  ? GroupData<F>
  : E extends List<infer R, any>
    ? ListData<R>
    : unknown) & { readonly $: E };

/** the views created so far, one per element, and the element of each */
const views = new WeakMap<FieldBase, object>();
const elements = new WeakMap<object, FieldBase>();

/** the array methods that move rows: a view performs them as the list's own operations, keeping the row elements */
const listMutations = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);

function isIndex(key: string | symbol): key is string {
  return typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key);
}

/** the element of a view, or the argument itself if it is not a view */
function unwrap<T>(item: T): T | FieldBase {
  return (typeof item === 'object' && item !== null && elements.get(item as object)) || item;
}

/** a member read through a view: a container as its view, anything else as its value */
function slotOf(element: FieldBase): unknown {
  return element instanceof Container ? view(element) : element.value;
}

/** writes a member through a view: its value, whatever it is */
function writeSlot(element: FieldBase, value: unknown): void {
  element.value = unwrap(value) instanceof FieldBase ? (unwrap(value) as FieldBase).value : value;
}

/** the keys a view handles for Vue and the language, not as data */
function special(key: string | symbol): { answered: boolean; value?: unknown } {
  // reactive() returns the view unwrapped, and a template reads through it: every read already reaches the tracked
  // state of the view's element
  if (key === '__v_skip') return { answered: true, value: true };
  if (typeof key === 'string' && key.startsWith('__v_')) return { answered: true, value: undefined };
  // a view is not a thenable: `await` returns it unchanged
  if (key === 'then') return { answered: true, value: undefined };
  return { answered: false };
}

function groupHandler(group: Group<any, any>): ProxyHandler<object> {
  const memberOf = (key: string | symbol) =>
    typeof key === 'string' && key !== '$' ? (group.field(key) ?? undefined) : undefined;
  const dataKeys = () => Object.keys(group.fields);
  return {
    get(target, key) {
      const answered = special(key);
      if (answered.answered) return answered.value;
      if (key === '$') return group;
      if (key === Symbol.toStringTag) return 'View';
      const element = memberOf(key);
      return element ? slotOf(element) : undefined;
    },
    set(target, key, value) {
      if (key === '$') throw new TypeError('$ is the element a view stands for, and cannot be replaced');
      const element = memberOf(key);
      if (!element) throw new TypeError(`${String(key)} is not a member of this group - use $addField() to add one`);
      writeSlot(element, value);
      return true;
    },
    has(target, key) {
      return key === '$' || (typeof key === 'string' && dataKeys().includes(key));
    },
    ownKeys() {
      return dataKeys();
    },
    getOwnPropertyDescriptor(target, key) {
      if (typeof key !== 'string' || !dataKeys().includes(key)) return undefined;
      return { value: slotOf(group.fields[key]), writable: true, enumerable: true, configurable: true };
    },
    deleteProperty(target, key) {
      throw new TypeError(`${String(key)} cannot be deleted from a view - use $removeField() to take a member out`);
    },
    defineProperty(target, key) {
      throw new TypeError(`${String(key)} cannot be defined on a view`);
    },
  };
}

function listView(list: List<any, any>): unknown[] {
  // the rows a view shows, in order: every row the list holds, whatever it sends
  const shown = (): FieldBase[] => [...list.items];
  // the list position of a view index; an index past the last shown row appends
  const positionOf = (index: number): number => {
    const rows = shown();
    return index < rows.length ? list.items.indexOf(rows[index]) : list.length;
  };
  const clamp = (index: number, length: number) => (index < 0 ? Math.max(length + index, 0) : Math.min(index, length));

  /** replaces the shown rows with `rows`, keeping every row element and its state */
  const reorder = (rows: FieldBase[]) =>
    transaction(() => {
      const shownRows = shown();
      const order = list.items.map((row) => {
        const at = shownRows.indexOf(row);
        return at === -1 ? row : rows[at];
      });
      while (list.length) list.pop();
      order.forEach((row) => list.push(row));
    });

  const mutations: Record<string, (...args: any[]) => unknown> = {
    push: (...items: unknown[]) => {
      transaction(() => items.forEach((item) => list.push(unwrap(item))));
      return shown().length;
    },
    pop: () => {
      const rows = shown();
      if (!rows.length) return undefined;
      const slot = slotOf(rows[rows.length - 1]);
      list.remove(list.items.indexOf(rows[rows.length - 1]));
      return slot;
    },
    shift: () => {
      const rows = shown();
      if (!rows.length) return undefined;
      const slot = slotOf(rows[0]);
      list.remove(list.items.indexOf(rows[0]));
      return slot;
    },
    unshift: (...items: unknown[]) => {
      transaction(() => {
        const at = positionOf(0);
        items.forEach((item, offset) => list.insert(unwrap(item), at + offset));
      });
      return shown().length;
    },
    splice: (start: number, deleteCount?: number, ...items: unknown[]) => {
      const removed: unknown[] = [];
      transaction(() => {
        const rows = shown();
        const from = clamp(Math.trunc(start) || 0, rows.length);
        const count =
          deleteCount === undefined ? rows.length - from : Math.max(0, Math.min(deleteCount, rows.length - from));
        rows.slice(from, from + count).forEach((row) => {
          removed.push(slotOf(row));
          list.remove(list.items.indexOf(row));
        });
        const at = positionOf(from);
        items.forEach((item, offset) => list.insert(unwrap(item), at + offset));
      });
      return removed;
    },
    sort: (compare?: (a: unknown, b: unknown) => number) => {
      const rows = shown();
      const sorted = rows
        .map((row) => ({ row, slot: slotOf(row) }))
        .sort((a, b) => {
          if (compare) return compare(a.slot, b.slot);
          const x = String(a.slot);
          const y = String(b.slot);
          return x < y ? -1 : x > y ? 1 : 0;
        })
        .map(({ row }) => row);
      reorder(sorted);
      return proxy;
    },
    reverse: () => {
      reorder([...shown()].reverse());
      return proxy;
    },
    fill: () => {
      throw new TypeError('fill() is not available on a list view - assign $value instead');
    },
    copyWithin: () => {
      throw new TypeError('copyWithin() is not available on a list view - assign $value instead');
    },
  };

  let proxy: unknown[];
  const handler: ProxyHandler<unknown[]> = {
    get(target, key, receiver) {
      const answered = special(key);
      if (answered.answered) return answered.value;
      if (key === '$') return list;
      if (key === 'length') return shown().length;
      if (isIndex(key)) {
        const row = shown()[Number(key)];
        return row ? slotOf(row) : undefined;
      }
      if (typeof key === 'string' && listMutations.has(key)) return mutations[key];
      // every other array member reads the view through its length and its indices
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value) {
      if (key === '$') throw new TypeError('$ is the element a view stands for, and cannot be replaced');
      if (key === 'length') {
        const length = Number(value);
        const rows = shown();
        if (length > rows.length) throw new TypeError('a list view grows by push(), not by its length');
        transaction(() => rows.slice(length).forEach((row) => list.remove(list.items.indexOf(row))));
        return true;
      }
      if (isIndex(key)) {
        const index = Number(key);
        const rows = shown();
        if (index < rows.length) writeSlot(rows[index], value);
        else list.insert(unwrap(value), positionOf(rows.length) + (index - rows.length));
        return true;
      }
      throw new TypeError(`${String(key)} cannot be set on a list view`);
    },
    has(target, key) {
      if (key === '$' || key === 'length') return true;
      if (isIndex(key)) return Number(key) < shown().length;
      return Reflect.has(target, key);
    },
    ownKeys() {
      return [...shown().map((_, index) => String(index)), 'length'];
    },
    getOwnPropertyDescriptor(target, key) {
      if (key === 'length') return { value: shown().length, writable: true, enumerable: false, configurable: false };
      if (!isIndex(key) || Number(key) >= shown().length) return undefined;
      return { value: slotOf(shown()[Number(key)]), writable: true, enumerable: true, configurable: true };
    },
    deleteProperty() {
      throw new TypeError('rows cannot be deleted from a list view - use splice() or pop()');
    },
    defineProperty(target, key) {
      throw new TypeError(`${String(key)} cannot be defined on a list view`);
    },
  };
  proxy = new Proxy<unknown[]>([], handler);
  return proxy;
}

function fieldHandler(field: FieldBase): ProxyHandler<object> {
  return {
    get(target, key) {
      const answered = special(key);
      if (answered.answered) return answered.value;
      if (key === '$') return field;
      return undefined;
    },
    set(target, key) {
      throw new TypeError(`${String(key)} cannot be set on the view of a field - its value is $.value`);
    },
    has(target, key) {
      return key === '$';
    },
    ownKeys() {
      return [];
    },
  };
}

/** throws for a group member whose name a view cannot expose as a data key */
function refuseReservedNames(group: Group<any, any>): void {
  Object.keys(group.fields).forEach((name) => {
    if (name === '$' || name === 'then' || name.startsWith('__v_')) {
      throw new TypeError(
        `A view cannot hold a member named ${name}: $ is the element the view stands for, and then and __v_* ` +
          'are read by the language and by Vue',
      );
    }
  });
}

/**
 * Returns the element presented as its data. A group's members and a list's rows are plain properties of the view
 * (a field as its value, a container as its own view), and `$` is the element itself: `view.$.valid`,
 * `view.$.access = 'readonly'`, `view.$.registerAction(...)`.
 *
 * A member reads what the element holds, as in `fullValue`: every member is present whatever its access, so a
 * disabled field reads and writes like any other. Every read goes through the element's tracked state, so an
 * effect that reads `view.address.city` re-runs when that field changes and not when another one does.
 *
 * A list's view is an array: it reads like one, and `push`, `pop`, `shift`, `unshift`, `splice`, `sort` and
 * `reverse` are performed as the list's own operations, so every row keeps its element and its state.
 *
 * One element has one view: `view(element) === view(element)`, and `view()` of a view returns the same view.
 */
export function view<V extends View<any>>(of: V): V;
// eslint-disable-next-line no-redeclare
export function view<E extends FieldBase>(element: E): View<E>;
// eslint-disable-next-line no-redeclare
export function view<E extends FieldBase>(element: E): View<E> {
  if (elements.has(element)) return element as unknown as View<E>;
  const made = views.get(element);
  if (made) return made as View<E>;

  let proxy: object;
  if (element instanceof Group) {
    refuseReservedNames(element);
    proxy = new Proxy({}, groupHandler(element));
  } else if (element instanceof List) {
    proxy = listView(element);
  } else {
    proxy = new Proxy({}, fieldHandler(element));
  }
  views.set(element, proxy);
  elements.set(proxy, element);
  return proxy as View<E>;
}
