import { mount } from '@vue/test-utils';
import { vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { Field } from '../field';
import { Group } from '../group';
import { List } from '../list';

import { callerFile, entryOf, listed } from './registry';

import { describeState, hideState, setDevtoolsRegistration } from './index';

const handlers: Record<string, (payload: any) => void> = {};
vi.mock('@vue/devtools-api', () => ({
  setupDevtoolsPlugin: (_descriptor: unknown, setup: (api: unknown) => void) =>
    setup({
      addInspector: () => undefined,
      sendInspectorTree: () => undefined,
      sendInspectorState: () => undefined,
      on: new Proxy(
        {},
        { get: (_target, name: string) => (handler: (payload: any) => void) => (handlers[name] = handler) },
      ),
    }),
}));

const isListed = (element: object) => listed().some((item) => item.element === element);

describe('the devtools registry', () => {
  afterEach(() => setDevtoolsRegistration('opt-out'));

  it('lists a root element and not the members a container holds', () => {
    const name = new Field({ value: 'a' });
    const form = new Group({ name });

    expect(isListed(form)).toBe(true);
    expect(isListed(name)).toBe(false);
  });

  it('lists an element a container releases', () => {
    const name = new Field({ value: 'a' });
    const form = new Group({ name });

    form.removeField('name');

    expect(isListed(name)).toBe(true);
  });

  it('does not list a list item template or the rows bound from it', () => {
    const template = new Group({ a: new Field({ value: 0 }) });
    const list = new List(template, { value: [{ a: 1 }] });
    const row = list.get(0)!;
    list.remove(0);

    expect(isListed(template)).toBe(false);
    expect(isListed(row)).toBe(false);
    expect(isListed(list)).toBe(true);
  });

  it('leaves out a hidden element, and lists only described elements in opt-in mode', () => {
    const hidden = new Group({ a: new Field() });
    const plain = new Group({ a: new Field() });
    const named = new Group({ a: new Field() });
    hideState(hidden);
    describeState(named, { name: 'Cart', file: 'src/stores/cart.ts' });

    expect(isListed(hidden)).toBe(false);
    expect(entryOf(named)!.description).toEqual({ name: 'Cart', file: 'src/stores/cart.ts' });

    setDevtoolsRegistration('opt-in');
    expect(isListed(plain)).toBe(false);
    expect(isListed(named)).toBe(true);
  });
});

describe('callerFile', () => {
  const library = '/src/';

  it('returns the first frame outside the library and node_modules, from a Chrome and a Firefox stack', () => {
    const chrome = [
      'Error',
      '    at new FieldBase (http://localhost:5173/src/field-base.ts?t=1:10:5)',
      '    at new Group (http://localhost:5173/node_modules/.vite/deps/x.js:1:1)',
      '    at createCart (http://localhost:5173/stores/cart.ts?t=2:4:10)',
    ].join('\n');
    const firefox = [
      'FieldBase@http://localhost:5173/src/field-base.ts:10:5',
      'setup@http://localhost:5173/components/Cart.vue:3:7',
    ].join('\n');

    expect(callerFile(chrome, library)).toBe('stores/cart.ts');
    expect(callerFile(firefox, library)).toBe('components/Cart.vue');
    expect(callerFile(undefined, library)).toBeUndefined();
  });
});

describe('the devtools plugin', () => {
  it('lists global and component state, shows an element, and adds component state', async () => {
    const app = { config: {} };
    const hook = {
      emit: () => undefined,
      on: () => undefined,
      once: () => undefined,
      off: () => undefined,
      apps: [app],
    };
    (globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__ = hook;
    const global = new Group({ name: new Field({ value: 'Ada' }) });
    describeState(global, { name: 'Profile', file: 'src/stores/profile.ts' });
    let inComponent: Group | undefined;
    const Owner = defineComponent({
      name: 'Owner',
      setup() {
        inComponent = new Group({ count: new Field({ value: 1 }) });
        return () => h('div');
      },
    });
    const wrapper = mount(Owner);
    await vi.waitFor(() => expect(handlers.getInspectorTree).toBeDefined());

    const tree = { inspectorId: 'dynamicforms-state', filter: 'profile', rootNodes: [] as any[] };
    handlers.getInspectorTree(tree);
    const globalSection = tree.rootNodes[0];
    expect(globalSection.children).toEqual([
      expect.objectContaining({
        label: 'src/stores/profile.ts',
        children: [expect.objectContaining({ label: 'Profile' })],
      }),
    ]);

    const node = globalSection.children[0].children[0];
    expect(node.children.map((child: any) => child.label)).toEqual(['name']);
    const state = { inspectorId: 'dynamicforms-state', nodeId: `${node.id}/name`, state: {} as any };
    handlers.getInspectorState(state);
    expect(state.state.element[0]).toEqual({ key: 'value', value: 'Ada' });

    const instanceData = { state: [] as any[] };
    handlers.inspectComponent({ componentInstance: (wrapper.vm as any).$, instanceData });
    expect(instanceData.state).toEqual([
      expect.objectContaining({ type: 'vue-forms', key: `Group #${entryOf(inComponent!)!.id}`, value: { count: 1 } }),
    ]);
    delete (globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__;
  });
});
