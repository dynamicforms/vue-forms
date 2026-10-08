import { setupDevtoolsPlugin } from '@vue/devtools-api';
import { type App, toRaw } from 'vue';

import type { FieldBase } from '../field-base';

import { callerFile, componentPath, type Entry, entryById, entryOf, listed, onRegistryChanged } from './registry';

const INSPECTOR = 'dynamicforms-state';
/** the rows of a list the tree shows; the rest are summed up in one node */
const ROWS_SHOWN = 100;

type InspectorNode = {
  id: string;
  label: string;
  children?: InspectorNode[];
  tags?: { label: string; textColor: number; backgroundColor: number }[];
};

const apps = new WeakSet<object>();
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
  return {
    id,
    label,
    children: children.length ? children : undefined,
    tags: [{ label: kindOf(element), textColor: 0xffffff, backgroundColor: element.valid ? 0x42b883 : 0xd32f2f }],
  };
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

function stateOf(element: FieldBase) {
  const e = element as any;
  return {
    element: [
      { key: 'value', value: plain(e.value) },
      { key: 'originalValue', value: plain(e.originalValue) },
      { key: 'isChanged', value: e.isChanged },
      { key: 'access', value: e.access },
      { key: 'effectiveAccess', value: e.effectiveAccess },
      { key: 'visibility', value: e.visibility },
      { key: 'touched', value: e.touched },
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
    extra: Object.entries(e.extra ?? {}).map(([key, value]) => ({ key, value: plain(value) })),
  };
}

function setup(app: App): void {
  if (apps.has(app)) return;
  apps.add(app);
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
        const section = (id: string, label: string, groups: Map<string, InspectorNode[]>): InspectorNode => ({
          id,
          label,
          children: [...groups].map(([location, nodes]) => ({
            id: `${id}:${location}`,
            label: location,
            children: nodes,
          })),
        });
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
        payload.state = {
          ...stateOf(found.element),
          location: [
            { key: 'file', value: fileOf(found.entry) ?? 'unknown' },
            ...(instance ? [{ key: 'component', value: componentPath(instance) }] : []),
          ],
        };
      });

      api.on.inspectComponent((payload) => {
        listed().forEach(({ entry, element }) => {
          if (entry.instance?.deref() !== payload.componentInstance) return;
          payload.instanceData.state.push({
            type: 'vue-forms',
            key: nameOf(entry, element),
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
