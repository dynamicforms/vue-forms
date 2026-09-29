import { Container } from './container';
import { FieldBase } from './field-base';
import { type GenericFieldsInterface, Group, type GroupValueInput } from './group';
import { List, type ListValueInput } from './list';
import { transaction } from './transaction';

/**
 * What a member contributes to what its container holds, asked the way the containers ask it. The rule is the one
 * `fullValue` follows: a hidden member reads `null`, a suppressed one is left out, and `enabled` does not matter.
 */
type Contribution = 'value' | 'null' | 'omit';
const contributionOf = (element: FieldBase): Contribution =>
  (element as unknown as { serializesAs(purpose: 'fullValue'): Contribution }).serializesAs('fullValue');

/** a member of the form in the shape a view hands it out: the view of a container, the value of anything else */
type Slot<E> = E extends Container
  ? View<E> | null | undefined
  : E extends FieldBase
    ? E['value'] | null | undefined
    : never;

/** the data keys of a group's view */
type GroupData<F extends GenericFieldsInterface> = {
  // a container is replaced through `$value`, so its key is read-only; a field's key reads and writes its value
  readonly [K in keyof F as F[K] extends Container ? K : never]: Slot<F[K]>;
} & {
  -readonly [K in keyof F as F[K] extends Container ? never : K]: Slot<F[K]>;
};

/** what a list's view takes as a row: the data a row is built from, an element, or the view of one */
type RowInput<R extends FieldBase> = R['value'] | R | View<R>;

/** the array a list's view is: every read an array has, and the mutations taken as the list's own operations */
type ListData<R extends FieldBase> = Omit<Slot<R>[], 'push' | 'unshift' | 'splice' | 'fill' | 'copyWithin'> & {
  push(...items: RowInput<R>[]): number;
  unshift(...items: RowInput<R>[]): number;
  splice(start: number, deleteCount?: number, ...items: RowInput<R>[]): Slot<R>[];
};

/** the members of an element under a `$` prefix, and the element itself as `$element` */
type Members<E extends FieldBase> = {
  [K in keyof E as K extends string ? (K extends `__${string}` | 'value' ? never : `$${K}`) : never]: E[K];
} & {
  readonly $element: E;
};

/** `$value` reads what the element reads and takes what its setter takes, which on a container is wider */
type ValueMember<E extends FieldBase> = {
  get $value(): E['value'];
  set $value(
    value: E extends Group<infer F, any>
      ? GroupValueInput<F>
      : E extends List<infer R, any>
        ? ListValueInput<R>
        : E['value'],
  );
};

/**
 * An element seen as its data: the members of a group, or the rows of a list, as plain properties, and everything
 * the element itself answers to under a `$` prefix. See `view()`.
 */
export type View<E extends FieldBase> = (E extends Group<infer F, any>
  ? GroupData<F>
  : E extends List<infer R, any>
    ? ListData<R>
    : unknown) &
  Members<E> &
  ValueMember<E>;

/** the views made so far, one per element, and the element behind each */
const views = new WeakMap<FieldBase, object>();
const elements = new WeakMap<object, FieldBase>();

/** the array methods that move rows: a view carries them out as the list's own operations, rows included */
const listMutations = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);

function isIndex(key: string | symbol): key is string {
  return typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key);
}

/** the element a view stands for, or the argument itself where it is not a view */
function unwrap<T>(item: T): T | FieldBase {
  return (typeof item === 'object' && item !== null && elements.get(item as object)) || item;
}

/** a member read through a view: a container as its view, anything else as its value */
function slotOf(element: FieldBase): unknown {
  switch (contributionOf(element)) {
    case 'omit':
      return undefined;
    case 'null':
      return null;
    default:
      return element instanceof Container ? view(element) : element.value;
  }
}

/** writes a member through a view: its value, whatever it is */
function writeSlot(element: FieldBase, value: unknown): void {
  element.value = unwrap(value) instanceof FieldBase ? (unwrap(value) as FieldBase).value : value;
}

/** a `$`-prefixed key, answered by the element: members read, accessors written, methods bound to the element */
function member(element: FieldBase, key: string): unknown {
  if (key === '$element') return element;
  const value = (element as any)[key.slice(1)];
  return typeof value === 'function' ? value.bind(element) : value;
}

/** the keys a view answers to on behalf of Vue and the language rather than as data */
function special(key: string | symbol): { answered: boolean; value?: unknown } {
  // reactive() leaves the view as it is, and a template reads through it: every read already reaches the tracked
  // state of the element behind it
  if (key === '__v_skip') return { answered: true, value: true };
  if (typeof key === 'string' && key.startsWith('__v_')) return { answered: true, value: undefined };
  // a view is never a thenable: `await` hands it back as it is
  if (key === 'then') return { answered: true, value: undefined };
  return { answered: false };
}

function groupHandler(group: Group<any, any>): ProxyHandler<object> {
  const memberOf = (key: string | symbol) =>
    typeof key === 'string' && !key.startsWith('$') ? (group.field(key) ?? undefined) : undefined;
  const dataKeys = () => Object.keys(group.fields).filter((key) => contributionOf(group.fields[key]) !== 'omit');
  return {
    get(target, key) {
      const answered = special(key);
      if (answered.answered) return answered.value;
      if (typeof key === 'string' && key.startsWith('$')) return member(group, key);
      if (key === Symbol.toStringTag) return 'View';
      const element = memberOf(key);
      return element ? slotOf(element) : undefined;
    },
    set(target, key, value) {
      if (typeof key === 'string' && key.startsWith('$')) {
        (group as any)[key.slice(1)] = value;
        return true;
      }
      const element = memberOf(key);
      if (!element) throw new TypeError(`${String(key)} is not a member of this group - use $addField() to add one`);
      writeSlot(element, value);
      return true;
    },
    has(target, key) {
      if (typeof key === 'string' && key.startsWith('$')) return key === '$element' || key.slice(1) in group;
      return typeof key === 'string' && dataKeys().includes(key);
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
  // the rows a view shows, in order: a suppressed row is not part of what the list holds, so it has no index
  const shown = (): FieldBase[] => list.items.filter((row) => contributionOf(row) !== 'omit');
  // the position in the list a view's index stands for; an index past the last shown row appends
  const positionOf = (index: number): number => {
    const rows = shown();
    return index < rows.length ? list.items.indexOf(rows[index]) : list.length;
  };
  const clamp = (index: number, length: number) => (index < 0 ? Math.max(length + index, 0) : Math.min(index, length));

  /** puts `rows` in place of the shown rows, keeping every row element and its state */
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
      if (typeof key === 'string' && key.startsWith('$')) return member(list, key);
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
      if (typeof key === 'string' && key.startsWith('$')) {
        (list as any)[key.slice(1)] = value;
        return true;
      }
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
      if (typeof key === 'string' && key.startsWith('$')) return key === '$element' || key.slice(1) in list;
      if (key === 'length') return true;
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
      if (typeof key === 'string' && key.startsWith('$')) return member(field, key);
      return undefined;
    },
    set(target, key, value) {
      if (typeof key === 'string' && key.startsWith('$')) {
        (field as any)[key.slice(1)] = value;
        return true;
      }
      throw new TypeError(`${String(key)} cannot be set on the view of a field - its value is $value`);
    },
    has(target, key) {
      return typeof key === 'string' && key.startsWith('$') && (key === '$element' || key.slice(1) in field);
    },
    ownKeys() {
      return [];
    },
  };
}

/** a group member whose name a view cannot hand out as a data key */
function refuseReservedNames(group: Group<any, any>): void {
  Object.keys(group.fields).forEach((name) => {
    if (name.startsWith('$') || name === 'then' || name.startsWith('__v_')) {
      throw new TypeError(
        `A view cannot hold a member named ${name}: a name starting with $ is an element member, and then and ` +
          '__v_* are read by the language and by Vue',
      );
    }
  });
}

/**
 * The element seen as its data. A group's members and a list's rows are plain properties of the view - a field as
 * its value, a container as its own view - and everything the element answers to is there under a `$` prefix:
 * `view.$valid`, `view.$errors`, `view.$registerAction(...)`. `$element` is the element itself.
 *
 * A member reads what the element holds by the rule `fullValue` follows: a hidden member is `null`, a suppressed one
 * is not there, and `enabled` does not matter, so a disabled field reads and writes like any other. Every read goes
 * through the element's tracked state, so an effect reading `view.address.city` re-runs when that field changes and
 * not when another one does.
 *
 * A list's view is an array: it reads like one, and `push`, `pop`, `shift`, `unshift`, `splice`, `sort` and
 * `reverse` are carried out as the list's own operations, so every row keeps its element and its state.
 *
 * One element has one view: `view(element) === view(element)`, and `view()` of a view hands it back.
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
