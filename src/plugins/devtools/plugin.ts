import { type App, toRaw } from 'vue';

import type { FieldBase } from '../../field-base';

import {
  callerFile,
  callerFrames,
  componentPath,
  type Entry,
  entryById,
  entryOf,
  listed,
  onRegistryChanged,
} from './registry';

const INSPECTOR = 'dynamicforms-state';

/** The part of the devtools plugin API the inspector uses. */
interface DevtoolsApi {
  addInspector(options: Record<string, unknown>): void;
  sendInspectorTree(inspectorId: string): void;
  sendInspectorState(inspectorId: string): void;
  on: {
    getInspectorTree(handler: (payload: any) => void): void;
    getInspectorState(handler: (payload: any) => void): void;
    inspectComponent(handler: (payload: any) => void): void;
    editInspectorState(handler: (payload: any) => void): void;
  };
}

/** The letter that stands for each access and each visibility when it is typed in the inspector. */
const accessShortcuts: Record<string, string> = { e: 'editable', r: 'readonly', d: 'disabled', n: 'disabled-null' };
const visibilityShortcuts: Record<string, string> = { f: 'full', i: 'invisible', h: 'hidden', s: 'suppress' };

/** The options with their letter in parentheses: `(e)ditable | … | disabled-(n)ull`. */
function hint(shortcuts: Record<string, string>): string {
  return Object.entries(shortcuts)
    .map(([letter, value]) => {
      const at = value.indexOf(letter);
      return `${value.slice(0, at)}(${letter})${value.slice(at + 1)}`;
    })
    .join(' | ');
}

/**
 * The value `input` names: the value itself or its letter, ignoring case. `input` itself where it names none, so
 * the setter refuses it.
 */
export function optionNamed(input: unknown, shortcuts: Record<string, string>): unknown {
  if (typeof input !== 'string') return input;
  const typed = input.trim().toLowerCase();
  if (Object.values(shortcuts).includes(typed)) return typed;
  return shortcuts[typed] ?? input;
}

/** A copy of `value` with the member at `path` replaced by `replacement`; the original is left as it is. */
function replaced(value: unknown, path: string[], replacement: unknown): unknown {
  if (path.length === 0) return replacement;
  const copy: any = Array.isArray(value) ? [...value] : { ...(value as object) };
  copy[path[0]] = replaced(copy[path[0]], path.slice(1), replacement);
  return copy;
}

/**
 * Writes an edit made in the inspector: the value of a leaf (a member of an object or array it holds is written as a
 * new copy), `access`, `visibility` and `touched` of any element, and an extended property. The write goes through
 * the element's setter, so it is a transaction like a write from the application. A value the setter refuses, such
 * as an access that is none of the four, is reported in the console and changes nothing.
 */
export function applyEdit(element: FieldBase, section: string, path: string[], value: unknown): void {
  const e = element as any;
  const [key, ...below] = path;
  try {
    if (section === 'extra') {
      element.setExtendedValues({ [key]: replaced(e.extra[key], below, value) } as any);
    } else if (key === 'value' && isLeaf(element)) {
      e.value = replaced(toRaw(e.value), below, value);
    } else if (key === 'access') {
      e.access = optionNamed(value, accessShortcuts);
    } else if (key === 'visibility') {
      e.visibility = optionNamed(value, visibilityShortcuts);
    } else if (key === 'touched') {
      e.touched = value;
    }
  } catch (error) {
    console.warn('[vue-forms devtools] the edit was refused:', error);
  }
}

/**
 * Registers a devtools plugin through the global devtools hook, the way every version of the devtools accepts one:
 * the devtools kit that initialised the devtools listens for `devtools-plugin:setup` on the hook. A copy of the kit
 * bundled with a library (`@vue/devtools-api` 7 and 8) registers only with itself, so a plugin set up through it is
 * not seen where another copy initialised the devtools.
 */
function setupDevtoolsPlugin(descriptor: Record<string, unknown>, setupFn: (api: DevtoolsApi) => void): void {
  (globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__?.emit?.('devtools-plugin:setup', descriptor, setupFn);
}
/** the rows of a list the tree shows; the rest are summed up in one node */
const ROWS_SHOWN = 100;

type InspectorNode = {
  id: string;
  label: string;
  children?: InspectorNode[];
  tags?: { label: string; textColor: number; backgroundColor: number }[];
};

/** set on an app once the plugin is set up on it; held on the app, so a reloaded module does not set it up twice */
const SetUp = Symbol.for('@dynamicforms/vue-forms.devtools');
const refreshers = new Set<() => void>();
let scheduled = false;

/** Sends the inspector tree and state again, at most once per 100 ms, after a change of the listed state. */
function refreshSoon(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    refreshers.forEach((refresh) => refresh());
  }, 100);
}

function kindOf(element: FieldBase): string {
  return (element as any)[Symbol.toStringTag] ?? 'Element';
}

function nameOf(entry: Entry, element: FieldBase): string {
  return entry.description.name ?? `${kindOf(element)} #${entry.id}`;
}

function fileOf(entry: Entry): string | undefined {
  return entry.description.file ?? callerFile(entry.created?.stack);
}

/** The members of a container, by name for a group and by position for a list. */
function childrenOf(element: FieldBase): [string, FieldBase][] {
  const fields = (element as any).fields;
  if (fields && kindOf(element) !== 'List') return Object.entries(fields as Record<string, FieldBase>);
  const items = (element as any).items as readonly FieldBase[] | undefined;
  return items ? items.map((row, index) => [String(index), row]) : [];
}

function treeOf(id: string, label: string, element: FieldBase): InspectorNode {
  const members = childrenOf(element);
  const shown = kindOf(element) === 'List' ? members.slice(0, ROWS_SHOWN) : members;
  const children = shown.map(([key, child]) => treeOf(`${id}/${key}`, key, child));
  if (shown.length < members.length) {
    children.push({ id: `${id}/…`, label: `… ${members.length - shown.length} more rows` });
  }
  const node: InspectorNode = {
    id,
    label,
    tags: [{ label: kindOf(element), textColor: 0xffffff, backgroundColor: element.valid ? 0x42b883 : 0xd32f2f }],
  };
  // the key is left out for a leaf: the devtools serialise an undefined value as a marker, and the client shows a
  // node with a `children` key as one that expands
  if (children.length) node.children = children;
  return node;
}

/** The element a node id names: a listed element, and the path of member keys below it. */
function resolve(nodeId: string): { entry: Entry; element: FieldBase } | undefined {
  const [rootId, ...path] = nodeId.split('/');
  const entry = entryById(rootId);
  let element = entry?.element.deref();
  for (const key of path) {
    if (!element) return undefined;
    element = childrenOf(element).find(([name]) => name === key)?.[1];
  }
  return entry && element ? { entry, element } : undefined;
}

/** A value the devtools can display: plain data, without Vue proxies or elements. */
function plain(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(toRaw(value) ?? null));
  } catch {
    return String(value);
  }
}

/** A `Field` or an `Action`: an element whose value is its own, not composed from members. */
function isLeaf(element: FieldBase): boolean {
  return kindOf(element) === 'Field' || kindOf(element) === 'Action';
}

function stateOf(element: FieldBase) {
  const e = element as any;
  return {
    element: [
      { key: 'value', value: plain(e.value), editable: isLeaf(element) },
      { key: 'originalValue', value: plain(e.originalValue) },
      { key: 'isChanged', value: e.isChanged },
      { key: 'access', value: e.access, editable: true },
      { key: 'access options', value: hint(accessShortcuts) },
      { key: 'effectiveAccess', value: e.effectiveAccess },
      { key: 'visibility', value: e.visibility, editable: true },
      { key: 'visibility options', value: hint(visibilityShortcuts) },
      { key: 'touched', value: e.touched, editable: true },
    ],
    validity: [
      { key: 'valid', value: e.valid },
      { key: 'validating', value: e.validating },
      { key: 'busy', value: e.busy },
      {
        key: 'errors',
        value: (e.errors as any[]).map((error) => ({
          code: error.code,
          detail: error.detail,
          origin: error.origin,
          params: plain(error.params),
        })),
      },
    ],
    extra: Object.entries(e.extra ?? {}).map(([key, value]) => ({ key, value: plain(value), editable: true })),
  };
}

function setup(app: App): void {
  if ((app as any)[SetUp]) return;
  (app as any)[SetUp] = true;
  setupDevtoolsPlugin(
    {
      id: 'dynamicforms-vue-forms',
      label: 'vue-forms',
      packageName: '@dynamicforms/vue-forms',
      homepage: 'https://docs.velis.si/dynamicforms/vue-forms',
      componentStateTypes: ['vue-forms'],
      app,
    },
    (api) => {
      api.addInspector({
        id: INSPECTOR,
        label: 'vue-forms',
        icon: 'dynamic_form',
        treeFilterPlaceholder: 'Search state',
      });

      api.on.getInspectorTree((payload) => {
        if (payload.inspectorId !== INSPECTOR) return;
        const filter = payload.filter.toLowerCase();
        const globals = new Map<string, InspectorNode[]>();
        const components = new Map<string, InspectorNode[]>();
        listed().forEach(({ entry, element }) => {
          const name = nameOf(entry, element);
          const instance = entry.instance?.deref();
          const location = instance ? componentPath(instance) : (fileOf(entry) ?? 'unknown file');
          if (filter && !`${name} ${location}`.toLowerCase().includes(filter)) return;
          const group = instance ? components : globals;
          if (!group.has(location)) group.set(location, []);
          group.get(location)!.push(treeOf(entry.id, name, element));
        });
        const section = (id: string, label: string, groups: Map<string, InspectorNode[]>): InspectorNode => {
          const node: InspectorNode = { id, label };
          // an empty section has no children key, so the client does not show it as one that expands
          if (groups.size) {
            node.children = [...groups].map(([location, nodes]) => ({
              id: `${id}:${location}`,
              label: location,
              children: nodes,
            }));
          }
          return node;
        };
        payload.rootNodes = [
          section('global', 'Global state', globals),
          section('components', 'Component state', components),
        ];
      });

      api.on.getInspectorState((payload) => {
        if (payload.inspectorId !== INSPECTOR) return;
        const found = resolve(payload.nodeId);
        if (!found) return;
        const instance = found.entry.instance?.deref();
        const frames = callerFrames(found.entry.created?.stack).map(
          ({ name, file, line, column }) => `${name ? `${name} ` : ''}${file}:${line}:${column}`,
        );
        payload.state = {
          ...stateOf(found.element),
          location: [
            { key: 'file', value: fileOf(found.entry) ?? 'unknown' },
            ...(instance ? [{ key: 'component', value: componentPath(instance) }] : []),
            ...(frames.length ? [{ key: 'stack', value: frames }] : []),
          ],
        };
      });

      api.on.editInspectorState((payload) => {
        if (payload.inspectorId !== INSPECTOR) return;
        const found = resolve(payload.nodeId);
        if (!found || payload.state?.remove) return;
        applyEdit(found.element, payload.type, payload.path, payload.state.value);
        api.sendInspectorState(INSPECTOR);
      });

      api.on.inspectComponent((payload) => {
        listed().forEach(({ entry, element }) => {
          if (entry.instance?.deref() !== payload.componentInstance) return;
          const key = nameOf(entry, element);
          if (payload.instanceData.state.some((item: any) => item.type === 'vue-forms' && item.key === key)) return;
          payload.instanceData.state.push({
            type: 'vue-forms',
            key,
            value: plain((element as any).value),
            editable: false,
          });
        });
      });

      refreshers.add(() => {
        api.sendInspectorTree(INSPECTOR);
        api.sendInspectorState(INSPECTOR);
      });
    },
  );
}

/**
 * Installs the inspector in every Vue app: the apps already known to the devtools hook, every app initialised
 * later, and the app of a component that constructs an element.
 */
export function install(): void {
  onRegistryChanged(refreshSoon);
  const hook = (globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook) return;
  hook.on?.('app:init', (app: App) => setup(app));
  const known = hook.apps ?? hook.appRecords ?? [];
  (Array.isArray(known) ? known : [...(known.values?.() ?? [])]).forEach((record: any) => {
    const app = record?.app ?? record;
    if (app?.config) setup(app);
  });
}

/** Installs the inspector in the app of the component that constructed `element`. */
export function installFor(element: FieldBase): void {
  const app = entryOf(element)?.instance?.deref()?.appContext.app;
  if (app) setup(app);
}
