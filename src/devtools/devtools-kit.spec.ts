/* eslint-disable vue/one-component-per-file -- a root component and the component it renders */
import { vi } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';

/**
 * The inspector against the devtools kit itself, initialised as the devtools initialise it in a page: the plugin
 * reaches the kit through the global hook, and the kit asks it for the inspector tree and for a component's state.
 */
describe('the devtools plugin in the devtools kit', () => {
  it('lists component state in the inspector and in the component inspector, once', async () => {
    const kit: any = await import('@vue/devtools-kit');
    kit.initDevTools();
    const { Field, Group } = await import('../index');
    const Demo = defineComponent({
      name: 'PersonDemo',
      setup() {
        new Group({ a: new Field({ value: 1 }) });
        return () => h('div');
      },
    });
    const Root = defineComponent({ name: 'RootApp', setup: () => () => h(Demo) });
    const app = createApp(Root);
    const vm: any = app.mount(document.createElement('div'));
    await nextTick();
    await vi.waitFor(() =>
      expect(kit.devtoolsPluginBuffer.some((plugin: any) => plugin[0].id === 'dynamicforms-vue-forms')).toBe(true),
    );

    const tree = await kit.devtools.api.getInspectorTree({ inspectorId: 'dynamicforms-state', filter: '' });
    const components = tree.find((node: any) => node.id === 'components');
    expect(components.children[0].label).toBe('RootApp > PersonDemo');
    expect(components.children[0].children[0].children.map((node: any) => node.label)).toEqual(['a']);

    await kit.devtools.api.getInspectorTree({ inspectorId: 'components', filter: '' });
    const demo = vm.$.subTree.component;
    const nodeId = [...kit.activeAppRecord.value.instanceMap.keys()].find((key: string) =>
      key.endsWith(`:${demo.uid}`),
    );
    const state = await kit.devtools.api.getInspectorState({ inspectorId: 'components', nodeId });
    expect(state.state.filter((item: any) => item.type === 'vue-forms')).toEqual([
      expect.objectContaining({ value: { a: 1 } }),
    ]);
  });
});
