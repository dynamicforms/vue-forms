import { type ComponentInternalInstance, getCurrentInstance, getCurrentScope, onScopeDispose } from 'vue';

import type { FieldBase } from '../field-base';
import type { PluginContext } from '../plugins';

/** Which elements the devtools list: every root element except the hidden ones, or only the described ones. */
export type DevtoolsRegistration = 'opt-out' | 'opt-in';

/** What an application states about an element for the devtools. */
export interface StateDescription {
  /** The name the devtools show; defaults to the element's class and a number. */
  name?: string;
  /** The file the element is defined in; defaults to the file of the code that constructed it. */
  file?: string;
}

/** What the registry knows about one element. */
export interface Entry {
  id: string;
  element: WeakRef<FieldBase>;
  /** the stack at construction; its text is built on the first read, when the devtools show the entry */
  created?: Error;
  /** the component whose setup constructed the element */
  instance?: WeakRef<ComponentInternalInstance>;
  description: StateDescription;
  hidden: boolean;
  described: boolean;
}

const entries = new Map<string, Entry>();
const byElement = new WeakMap<FieldBase, Entry>();
let nextId = 1;
let registration: DevtoolsRegistration = 'opt-out';
let enabled = true;
let changed: (() => void) | undefined;
let context: PluginContext | undefined;

/** Records the context the devtools plugin received; it tells a binding or an item template from a root. */
export function useContext(installed: PluginContext): void {
  context = installed;
}

/** Called by the devtools plugin; runs after a change the devtools show. */
export function onRegistryChanged(listener: () => void): void {
  changed = listener;
}

/**
 * Records an element at construction: the component that constructs it and, where `location` is true, the stack
 * that leads to it.
 */
export function noteElement(element: FieldBase, location: boolean): void {
  let created: Error | undefined;
  if (location) {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 20;
    created = new Error();
    Error.stackTraceLimit = limit;
  }
  const instance = getCurrentInstance();
  const entry: Entry = {
    id: String(nextId++),
    element: new WeakRef(element),
    created,
    instance: instance ? new WeakRef(instance) : undefined,
    description: {},
    hidden: false,
    described: false,
  };
  entries.set(entry.id, entry);
  byElement.set(element, entry);
  // state a component constructs is listed while the component is mounted: an element is collected only when the
  // garbage collector runs, which can be long after the component was unmounted
  if (instance && getCurrentScope()) {
    onScopeDispose(() => {
      entries.delete(entry.id);
      changed?.();
    });
  }
}

export function describe(element: FieldBase, description: StateDescription): void {
  const entry = byElement.get(element);
  if (!entry) return;
  entry.description = { ...entry.description, ...description };
  entry.described = true;
  entry.hidden = false;
  // an element its component handed on before unmounting is listed again, as global state
  if (!entries.has(entry.id)) {
    entry.instance = undefined;
    entries.set(entry.id, entry);
  }
  changed?.();
}

export function setHidden(element: FieldBase, hidden: boolean): void {
  const entry = byElement.get(element);
  if (!entry) return;
  entry.hidden = hidden;
  changed?.();
}

export function setRegistration(mode: DevtoolsRegistration): void {
  registration = mode;
  changed?.();
}

/** Lists nothing while `on` is false. */
export function setEnabled(on: boolean): void {
  enabled = on;
  changed?.();
}

/** Reports a committed change. */
export function noteChange(): void {
  changed?.();
}

/** The entry of an element, where it has one. */
export function entryOf(element: FieldBase): Entry | undefined {
  return byElement.get(element);
}

export function entryById(id: string): Entry | undefined {
  return entries.get(id);
}

/**
 * The listed elements: alive, not held by a container, not a binding or an item template, not hidden, and in
 * opt-in mode described. Entries whose element was collected are dropped here. Nothing is listed while the devtools
 * are turned off.
 */
export function listed(): { entry: Entry; element: FieldBase }[] {
  const out: { entry: Entry; element: FieldBase }[] = [];
  if (!enabled) return out;
  entries.forEach((entry, id) => {
    const element = entry.element.deref();
    if (!element) {
      entries.delete(id);
      return;
    }
    if (entry.hidden || element.parent || context?.isInternal(element)) return;
    if (registration === 'opt-in' && !entry.described) return;
    out.push({ entry, element });
  });
  return out;
}

/**
 * The path prefix of the library's own files: `…/src/` where the source is served, or the bundle file. Frames from
 * it are skipped when the caller's file is looked up.
 */
function libraryPrefix(): string {
  // the first frame of a stack taken here is this module, served from the library's source or its bundle
  const own = /(?:https?:\/\/[^/\s]+|file:\/\/)?(\/[^\s?):]+\.[cm]?[jt]s)/.exec(new Error().stack ?? '')?.[1] ?? '';
  return own.includes('/src/devtools/') ? own.slice(0, own.indexOf('/src/') + 5) : own;
}

/**
 * The file of the first frame of `stack` outside the library, as a path relative to the served root: Vite serves
 * a project file at `/src/…`. Undefined where no frame outside the library carries a URL.
 */
export function callerFile(stack: string | undefined, library = libraryPrefix()): string | undefined {
  if (!stack) return undefined;
  for (const match of stack.matchAll(/(?:https?:\/\/[^/\s]+)?(\/[^\s?):]+\.[cm]?[jt]sx?|\/[^\s?):]+\.vue)/g)) {
    const path = match[1];
    if (path.startsWith(library) || path.includes('/node_modules/')) continue;
    return path.replace(/^\//, '');
  }
  return undefined;
}

/** The names of the components from the root of the app to `instance`, joined by ` > `. */
export function componentPath(instance: ComponentInternalInstance): string {
  const names: string[] = [];
  for (let at: ComponentInternalInstance | null = instance; at; at = at.parent) {
    const type = at.type as { name?: string; __name?: string; __file?: string };
    names.unshift(type.name ?? type.__name ?? type.__file?.split('/').pop() ?? 'Anonymous');
  }
  return names.join(' > ');
}
