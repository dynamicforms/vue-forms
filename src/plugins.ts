import type { FieldBase } from './field-base';

/**
 * The method a `Field` implements for `PluginContext.changeInPlace`. It is keyed by a symbol the package does not
 * export, so it is not part of the documented API of `Field`.
 */
export const ChangeInPlace = Symbol('Field.changeInPlace');

/** What `installPlugin()` passes to a plugin's `setup()`. */
export interface PluginContext {
  /**
   * Makes a write into the value a field holds a change of the field. It opens a transaction, or joins the open one,
   * and in it:
   *
   * 1. where this is the first such write since the field's last announcement, records `copy()` as the old value;
   * 2. calls `write()`;
   * 3. registers `undo()` for a rollback;
   * 4. runs the field's validators and enrols the field, so the commit fires `ValueChangedAction` with the value
   *    the field holds and the recorded old value.
   *
   * `element` is a `Field`; any other element throws a `TypeError`.
   */
  changeInPlace(element: FieldBase, write: () => void, undo: () => void, copy: () => unknown): void;
}

/**
 * A plugin. Every hook is optional. The value hooks of the installed plugins run as a pipeline in the order of
 * installation: the first receives the value being written, each following one receives the previous one's result,
 * and the last result is stored.
 */
export interface Plugin {
  /** Called once by `installPlugin()`, with the context the plugin's other hooks use. */
  setup?(context: PluginContext): void;
  /**
   * Called on every write of the value a `Field` holds: construction, the `value` setter and `rebind()`. A rollback
   * restores the stored value without calling it. `ValueChangedAction` and `field.value` receive the stored value.
   */
  onSetValue?(value: unknown, element: FieldBase): unknown;
  /** Called on every write of `originalValue` of any element, a container's included. */
  onSetOriginalValue?(value: unknown, element: FieldBase): unknown;
}

const installed: Plugin[] = [];
let valueHooks: Plugin[] = [];
let originalValueHooks: Plugin[] = [];

const context: PluginContext = {
  changeInPlace(element, write, undo, copy) {
    const target = element as unknown as Partial<Record<typeof ChangeInPlace, (...args: unknown[]) => void>>;
    const change = target[ChangeInPlace];
    if (typeof change !== 'function') throw new TypeError('changeInPlace: the element is not a Field');
    change.call(element, write, undo, copy);
  },
};

function collect() {
  valueHooks = installed.filter((plugin) => plugin.onSetValue);
  originalValueHooks = installed.filter((plugin) => plugin.onSetOriginalValue);
}

/**
 * Installs `plugin` for every element, including the ones already built: a hook runs on the next write. A plugin
 * installed twice runs twice. Returns a function that uninstalls it; values stored while it was installed are kept
 * as they are.
 */
export function installPlugin(plugin: Plugin): () => void {
  installed.push(plugin);
  collect();
  plugin.setup?.(context);
  return () => {
    const index = installed.indexOf(plugin);
    if (index < 0) return;
    installed.splice(index, 1);
    collect();
  };
}

/** The value a `Field` stores for `value`: the result of the installed `onSetValue` pipeline. */
export function pipeValue<T>(element: FieldBase, value: T): T {
  let result: unknown = value;
  for (const plugin of valueHooks) result = plugin.onSetValue!(result, element);
  return result as T;
}

/** The value an element stores for `originalValue`: the result of the installed `onSetOriginalValue` pipeline. */
export function pipeOriginalValue<T>(element: FieldBase, value: T): T {
  let result: unknown = value;
  for (const plugin of originalValueHooks) result = plugin.onSetOriginalValue!(result, element);
  return result as T;
}
