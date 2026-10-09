import { reactive, toRaw } from 'vue';

import { type FieldBase, type PluginContext, transaction } from '@dynamicforms/vue-forms';

let context: PluginContext | undefined;

/** Records the context the plugin's setup received. */
export function useContext(installed: PluginContext): void {
  context = installed;
}

/** proxy over a plain object or an array -> the object it wraps */
const targets = new WeakMap<object, object>();
/** plain object or array -> its proxy */
const proxies = new WeakMap<object, object>();
/** tracked node (the object a proxy wraps, or a TrackedMap, TrackedSet or TrackedDate) -> the field holding it */
const owners = new WeakMap<object, FieldBase>();
/** values marked with untracked() */
const opaque = new WeakSet<object>();
/** class instances already warned about */
const warned = new WeakSet<object>();
let warnings = true;
/** greater than zero while an undo step writes, so the write is not recorded as a change */
let restoring = 0;

export function markUntracked(value: object): void {
  opaque.add(value);
}

export function enableWarnings(enabled: boolean): void {
  warnings = enabled;
}

type Kind = 'primitive' | 'opaque' | 'instance' | 'plain' | 'array' | 'map' | 'set' | 'date';

/** The object behind a Vue proxy and behind a tracking proxy. */
function unwrap(value: unknown): unknown {
  const raw = toRaw(value);
  return (raw !== null && typeof raw === 'object' && targets.get(raw)) || raw;
}

function kindOf(value: unknown): Kind {
  if (value === null || typeof value !== 'object') return 'primitive';
  // an element and a value marked with markRaw() carry __v_skip
  if (opaque.has(value) || (value as { __v_skip?: boolean }).__v_skip) return 'opaque';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Map) return 'map';
  if (value instanceof Set) return 'set';
  if (value instanceof Date) return 'date';
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? 'plain' : 'instance';
}

function warnUntracked(value: object): void {
  if (process.env.NODE_ENV !== 'production') {
    if (!warnings || warned.has(value)) return;
    warned.add(value);
    const name = (value as { constructor?: { name?: string } }).constructor?.name || 'class';
    console.warn(
      `[vue-forms tracking] a ${name} instance is held without tracking: a write into it is not a change of the ` +
        'field. Mark it with untracked() to hold it without this warning.',
    );
  }
}

/** The form a tracked node takes in the value: the proxy for a plain object or an array, the node itself otherwise. */
function trackedForm(node: object): object {
  return proxies.get(node) ?? node;
}

/** Runs an undo step: the write goes through Vue's proxy, so what read the value runs again, and is not recorded. */
function restore(step: () => void): void {
  restoring++;
  try {
    step();
  } finally {
    restoring--;
  }
}

function change(field: FieldBase, write: () => void, undo: () => void): void {
  context!.changeInPlace(
    field,
    write,
    () => restore(undo),
    () => plain(field.value),
  );
}

/**
 * `value` in the form `field` holds it: a plain object or an array becomes a proxy over a copy, a `Map`, a `Set` or
 * a `Date` a tracked subclass instance, all owned by `field`. A node `field` already owns is kept, so moving a row
 * within the value keeps the row. Anything else is kept as it is.
 */
export function adopt(value: unknown, field: FieldBase, seen = new Map<object, unknown>()): unknown {
  const source = unwrap(value);
  const kind = kindOf(source);
  if (kind === 'primitive' || kind === 'opaque') return source;
  const node = source as object;
  if (kind === 'instance') {
    warnUntracked(node);
    return node;
  }
  if (owners.get(node) === field) return trackedForm(node);
  if (seen.has(node)) return seen.get(node);

  switch (kind) {
    case 'date': {
      const copy = new TrackedDate((node as Date).getTime());
      owners.set(copy, field);
      seen.set(node, copy);
      return copy;
    }
    case 'map': {
      const copy = new TrackedMap();
      seen.set(node, copy);
      (node as Map<unknown, unknown>).forEach((item, key) => {
        Map.prototype.set.call(copy, key, adopt(item, field, seen));
      });
      owners.set(copy, field);
      return copy;
    }
    case 'set': {
      const copy = new TrackedSet();
      seen.set(node, copy);
      (node as Set<unknown>).forEach((item) => Set.prototype.add.call(copy, adopt(item, field, seen)));
      owners.set(copy, field);
      return copy;
    }
    default: {
      const target: Record<PropertyKey, unknown> =
        kind === 'array' ? [] : Object.create(Object.getPrototypeOf(node) as object | null);
      const proxy = new Proxy(target, handler);
      targets.set(proxy, target);
      proxies.set(target, proxy);
      seen.set(node, proxy);
      copyProperties(node, target, (item) => adopt(item, field, seen));
      owners.set(target, field);
      return proxy;
    }
  }
}

/** A deep copy of `value` with no tracking: plain objects, arrays, `Map`, `Set` and `Date`. */
export function plain(value: unknown, seen = new Map<object, unknown>()): unknown {
  const source = unwrap(value);
  const kind = kindOf(source);
  if (kind === 'primitive' || kind === 'opaque' || kind === 'instance') return source;
  const node = source as object;
  if (seen.has(node)) return seen.get(node);
  switch (kind) {
    case 'date': {
      const copy = new Date((node as Date).getTime());
      seen.set(node, copy);
      return copy;
    }
    case 'map': {
      const copy = new Map();
      seen.set(node, copy);
      Map.prototype.forEach.call(node, (item, key) => copy.set(key, plain(item, seen)));
      return copy;
    }
    case 'set': {
      const copy = new Set();
      seen.set(node, copy);
      Set.prototype.forEach.call(node, (item) => copy.add(plain(item, seen)));
      return copy;
    }
    default: {
      const copy: Record<PropertyKey, unknown> =
        kind === 'array' ? [] : Object.create(Object.getPrototypeOf(node) as object | null);
      seen.set(node, copy);
      copyProperties(node, copy, (item) => plain(item, seen));
      return copy;
    }
  }
}

/** Copies the own properties of `source` to `target`, data properties through `map`, accessors as they are. */
function copyProperties(source: object, target: Record<PropertyKey, unknown>, map: (item: unknown) => unknown): void {
  if (Array.isArray(source)) (target as unknown as unknown[]).length = source.length;
  for (const key of Reflect.ownKeys(source)) {
    if (Array.isArray(source) && key === 'length') continue;
    const { value, get, set, enumerable } = Reflect.getOwnPropertyDescriptor(source, key)!;
    // a copy is writable whatever the source was, so a frozen source gives a value the field can change
    if (get || set) Reflect.defineProperty(target, key, { get, set, enumerable, configurable: true });
    else Reflect.defineProperty(target, key, { value: map(value), writable: true, enumerable, configurable: true });
  }
}

/** The same object for the same unwrapped value, so `a.b = a.b` is not a change. */
function same(a: unknown, b: unknown): boolean {
  return Object.is(unwrap(a), unwrap(b));
}

const arrayMutators = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
const batched = new Map<string, (...args: unknown[]) => unknown>();

/** An array method that runs in one transaction, so its writes are one change of the field. */
function batchedMethod(name: string): (...args: unknown[]) => unknown {
  let method = batched.get(name);
  if (!method) {
    const original = (Array.prototype as unknown as Record<string, (...args: unknown[]) => unknown>)[name];
    method = function batchedArrayMethod(this: unknown, ...args: unknown[]) {
      return transaction(() => original.apply(this, args));
    };
    batched.set(name, method);
  }
  return method;
}

const handler: ProxyHandler<Record<PropertyKey, unknown>> = {
  get(target, key, receiver) {
    if (Array.isArray(target) && typeof key === 'string' && arrayMutators.has(key)) return batchedMethod(key);
    return Reflect.get(target, key, receiver);
  },

  set(target, key, value) {
    if (restoring) return Reflect.set(target, key, value);
    const field = owners.get(target)!;
    const had = Object.hasOwn(target, key);
    const previous = target[key as keyof typeof target];
    if (had && same(previous, value)) return true;
    const next = adopt(value, field);
    const proxy = proxies.get(target)!;
    // a shorter length removes the items above it, which the undo step puts back
    const isArray = Array.isArray(target);
    const removed = isArray && key === 'length' ? target.slice(next as number) : [];
    // a write past the end extends the array, which the undo step shortens again
    const length = isArray ? target.length : 0;
    change(
      field,
      () => Reflect.set(target, key, next),
      () => {
        const live = reactive(proxy) as Record<PropertyKey, unknown>;
        if (had) live[key] = previous;
        else delete live[key];
        removed.forEach((item, index) => (live[(next as number) + index] = item));
        if (isArray && live.length !== length) live.length = length;
      },
    );
    return true;
  },

  deleteProperty(target, key) {
    if (restoring || !Object.hasOwn(target, key)) return Reflect.deleteProperty(target, key);
    const field = owners.get(target)!;
    const previous = target[key as keyof typeof target];
    const proxy = proxies.get(target)!;
    change(
      field,
      () => Reflect.deleteProperty(target, key),
      () => ((reactive(proxy) as Record<PropertyKey, unknown>)[key] = previous),
    );
    return true;
  },
};

/** A `Map` a field holds: `set`, `delete` and `clear` are changes of the field. */
export class TrackedMap<K = unknown, V = unknown> extends Map<K, V> {
  set(key: K, value: V): this {
    const field = owners.get(this);
    if (restoring || !field) return super.set(key, value);
    const had = super.has(key);
    const previous = super.get(key);
    if (had && same(previous, value)) return this;
    const next = adopt(value, field) as V;
    change(
      field,
      () => super.set(key, next),
      () => {
        const live = reactive(this) as Map<K, V>;
        if (had) live.set(key, previous as V);
        else live.delete(key);
      },
    );
    return this;
  }

  delete(key: K): boolean {
    const field = owners.get(this);
    if (restoring || !field || !super.has(key)) return super.delete(key);
    const previous = super.get(key) as V;
    change(
      field,
      () => super.delete(key),
      () => (reactive(this) as Map<K, V>).set(key, previous),
    );
    return true;
  }

  clear(): void {
    const field = owners.get(this);
    if (restoring || !field || super.size === 0) return super.clear();
    const entries = [...super.entries()];
    change(
      field,
      () => super.clear(),
      () => entries.forEach(([key, item]) => (reactive(this) as Map<K, V>).set(key, item)),
    );
  }
}

/** A `Set` a field holds: `add`, `delete` and `clear` are changes of the field. */
export class TrackedSet<V = unknown> extends Set<V> {
  add(value: V): this {
    const field = owners.get(this);
    if (restoring || !field) return super.add(value);
    if (super.has(toRaw(value))) return this;
    const next = adopt(value, field) as V;
    change(
      field,
      () => super.add(next),
      () => (reactive(this) as Set<V>).delete(next),
    );
    return this;
  }

  delete(value: V): boolean {
    const field = owners.get(this);
    const item = toRaw(value);
    if (restoring || !field || !super.has(item)) return super.delete(item);
    change(
      field,
      () => super.delete(item),
      () => (reactive(this) as Set<V>).add(item),
    );
    return true;
  }

  clear(): void {
    const field = owners.get(this);
    if (restoring || !field || super.size === 0) return super.clear();
    const items = [...super.values()];
    change(
      field,
      () => super.clear(),
      () => items.forEach((item) => (reactive(this) as Set<V>).add(item)),
    );
  }
}

type DateSetter = (this: Date, ...args: number[]) => number;

/**
 * Applies a `Date` setter to a field's date: the setter runs on a copy first, and a different time is written as a
 * change of the field.
 */
function setDate(date: TrackedDate, setter: DateSetter, args: number[]): number {
  const field = owners.get(date);
  if (restoring || !field) return setter.apply(date, args);
  const before = date.getTime();
  const probe = new Date(before);
  const after = setter.apply(probe, args);
  if (Object.is(after, before)) return after;
  change(
    field,
    () => Date.prototype.setTime.call(date, after),
    () => Date.prototype.setTime.call(date, before),
  );
  return after;
}

/** A `Date` a field holds: every setter is a change of the field. */
export class TrackedDate extends Date {
  setTime(time: number): number {
    return setDate(this, Date.prototype.setTime, [time]);
  }
  setMilliseconds(...args: [number]): number {
    return setDate(this, Date.prototype.setMilliseconds, args);
  }
  setUTCMilliseconds(...args: [number]): number {
    return setDate(this, Date.prototype.setUTCMilliseconds, args);
  }
  setSeconds(...args: [number, number?]): number {
    return setDate(this, Date.prototype.setSeconds as DateSetter, args as number[]);
  }
  setUTCSeconds(...args: [number, number?]): number {
    return setDate(this, Date.prototype.setUTCSeconds as DateSetter, args as number[]);
  }
  setMinutes(...args: [number, number?, number?]): number {
    return setDate(this, Date.prototype.setMinutes as DateSetter, args as number[]);
  }
  setUTCMinutes(...args: [number, number?, number?]): number {
    return setDate(this, Date.prototype.setUTCMinutes as DateSetter, args as number[]);
  }
  setHours(...args: [number, number?, number?, number?]): number {
    return setDate(this, Date.prototype.setHours as DateSetter, args as number[]);
  }
  setUTCHours(...args: [number, number?, number?, number?]): number {
    return setDate(this, Date.prototype.setUTCHours as DateSetter, args as number[]);
  }
  setDate(...args: [number]): number {
    return setDate(this, Date.prototype.setDate, args);
  }
  setUTCDate(...args: [number]): number {
    return setDate(this, Date.prototype.setUTCDate, args);
  }
  setMonth(...args: [number, number?]): number {
    return setDate(this, Date.prototype.setMonth as DateSetter, args as number[]);
  }
  setUTCMonth(...args: [number, number?]): number {
    return setDate(this, Date.prototype.setUTCMonth as DateSetter, args as number[]);
  }
  setFullYear(...args: [number, number?, number?]): number {
    return setDate(this, Date.prototype.setFullYear as DateSetter, args as number[]);
  }
  setUTCFullYear(...args: [number, number?, number?]): number {
    return setDate(this, Date.prototype.setUTCFullYear as DateSetter, args as number[]);
  }
}
