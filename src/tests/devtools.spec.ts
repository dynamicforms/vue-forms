/* eslint-disable vue/one-component-per-file -- each test mounts a component of its own */
import { mount } from '@vue/test-utils';
import { vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { Field } from '../field';
import { Group } from '../group';
import { List } from '../list';
import { configureDevtools, describeState, hideState } from '../plugins/devtools/api';
import { callerFile, entryOf, listed } from '../plugins/devtools/registry';

const handlers: Record<string, (payload: any) => void> = {};
// the devtools API a plugin's setup function receives; the handlers it registers are kept for the tests
const api = {
  addInspector: () => undefined,
  sendInspectorTree: () => undefined,
  sendInspectorState: () => undefined,
  on: new Proxy(
    {},
    { get: (_target, name: string) => (handler: (payload: any) => void) => (handlers[name] = handler) },
  ),
};

const isListed = (element: object) => listed().some((item) => item.element === element);

describe('the devtools registry', () => {
  afterEach(() => configureDevtools({ registration: 'opt-out' }));

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

    configureDevtools({ registration: 'opt-in' });
    expect(isListed(plain)).toBe(false);
    expect(isListed(named)).toBe(true);
  });
});

describe('configureDevtools', () => {
  afterEach(() => configureDevtools({ enabled: true, location: true, registration: 'opt-out' }));

  it('records no binding: a list row has no entry', () => {
    const list = new List(new Group({ a: new Field({ value: 0 }) }), { value: [{ a: 1 }] });

    expect(entryOf(list)).toBeDefined();
    expect(entryOf(list.get(0)!)).toBeUndefined();
    expect(entryOf(list.get(0)!.fields.a)).toBeUndefined();
  });

  it('drops the stack of an element a container takes', () => {
    const member = new Field({ value: 0 });
    expect(entryOf(member)!.created).toBeInstanceOf(Error);

    const form = new Group({ member });

    expect(entryOf(member)!.created).toBeUndefined();
    expect(entryOf(form)!.created).toBeInstanceOf(Error);
  });

  it('captures no stack with location false', () => {
    configureDevtools({ location: false });
    const form = new Group({ a: new Field() });

    expect(entryOf(form)!.created).toBeUndefined();
    expect(isListed(form)).toBe(true);
  });

  it('records and lists nothing while turned off, and lists what was recorded when turned on again', () => {
    const before = new Group({ a: new Field() });
    configureDevtools({ enabled: false });
    const during = new Group({ a: new Field() });

    expect(isListed(before)).toBe(false);
    expect(entryOf(during)).toBeUndefined();

    configureDevtools({ enabled: true });
    const after = new Group({ a: new Field() });
    expect([isListed(before), isListed(during), isListed(after)]).toEqual([true, false, true]);
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
      emit: (event: string, _descriptor: unknown, setup: (devtools: unknown) => void) => {
        if (event === 'devtools-plugin:setup') setup(api);
      },
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
      name: 'StateOwner',
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
    expect(state.state.element[0]).toEqual({ key: 'value', value: 'Ada', editable: true });

    const instanceData = { state: [] as any[] };
    handlers.inspectComponent({ componentInstance: (wrapper.vm as any).$, instanceData });
    expect(instanceData.state).toEqual([
      expect.objectContaining({ type: 'vue-forms', key: `Group #${entryOf(inComponent!)!.id}`, value: { count: 1 } }),
    ]);
    delete (globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__;
  });
});

describe('state a component constructs', () => {
  it('is listed while the component is mounted', () => {
    let built: Group | undefined;
    const Holder = defineComponent({
      name: 'StateHolder',
      setup() {
        built = new Group({ a: new Field({ value: 1 }) });
        return () => h('div');
      },
    });
    const wrapper = mount(Holder);
    expect(isListed(built!)).toBe(true);

    wrapper.unmount();

    expect(isListed(built!)).toBe(false);
    describeState(built!, { name: 'Kept' });
    expect(isListed(built!)).toBe(true);
    expect(entryOf(built!)!.instance).toBeUndefined();
  });
});

describe('editing in the inspector', () => {
  it('writes the value of a leaf, a member of an object it holds, access, visibility, touched and extra', async () => {
    const { applyEdit } = await import('../plugins/devtools/plugin');
    const name = new Field({ value: 'Ada' });
    const address = new Field({ value: { city: 'Kranj', zip: '4000' } });
    const form = new Group({ name, address }, { hint: 'h' } as any);

    applyEdit(name, 'element', ['value'], 'Grace');
    applyEdit(address, 'element', ['value', 'city'], 'Bled');
    applyEdit(form, 'element', ['access'], 'readonly');
    applyEdit(form, 'element', ['visibility'], 'hidden');
    applyEdit(name, 'element', ['touched'], true);
    applyEdit(form, 'extra', ['hint'], 'new hint');

    expect(form.value).toEqual({ name: 'Grace', address: { city: 'Bled', zip: '4000' } });
    expect([form.access, form.visibility, name.touched]).toEqual(['readonly', 'hidden', true]);
    expect((form.extra as any).hint).toBe('new hint');
  });

  it('leaves a container value and a refused value as they are', async () => {
    const { applyEdit } = await import('../plugins/devtools/plugin');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const form = new Group({ name: new Field({ value: 'Ada' }) });

    applyEdit(form, 'element', ['value'], { name: 'x' });
    applyEdit(form, 'element', ['access'], 'nonsense');

    expect(form.value).toEqual({ name: 'Ada' });
    expect(form.access).toBe('editable');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('an access or a visibility typed in the inspector', () => {
  it('is matched as a value or by its letter, ignoring case', async () => {
    const { optionNamed } = await import('../plugins/devtools/plugin');
    const access = { e: 'editable', r: 'readonly', d: 'disabled', n: 'disabled-null' };

    expect(optionNamed('R', access)).toBe('readonly');
    expect(optionNamed('d', access)).toBe('disabled');
    expect(optionNamed('n', access)).toBe('disabled-null');
    expect(optionNamed('Disabled-Null', access)).toBe('disabled-null');
    expect(optionNamed('read', access)).toBe('read');

    const field = new Field({ value: 1 });
    const { applyEdit } = await import('../plugins/devtools/plugin');
    applyEdit(field, 'element', ['visibility'], 'H');
    expect(field.visibility).toBe('hidden');
  });
});
