import { Field, Group, installPlugin, List, transaction, type FieldBase, type PluginContext } from './index';

describe('the onElementCreated hook', () => {
  it('reports every construction, with binding true for an element bind() builds and for list rows', () => {
    const created: [string, boolean][] = [];
    const uninstall = installPlugin({
      onElementCreated: (element, binding) => created.push([element.constructor.name, binding]),
    });
    const template = new Group({ a: new Field({ value: 0 }) });
    created.length = 0;

    new List(template, { value: [{ a: 1 }] });
    uninstall();

    expect(created).toEqual([
      ['List', false],
      ['Field', true],
      ['Group', true],
    ]);
  });
});

describe('the onCommit hook', () => {
  it('runs once per committed transaction and not after a rollback', () => {
    let commits = 0;
    const field = new Field({ value: 0 });
    const uninstall = installPlugin({ onCommit: () => commits++ });

    transaction(() => {
      field.value = 1;
      field.value = 2;
    });
    transaction((tx) => {
      field.value = 3;
      tx.rollback();
    });
    uninstall();

    expect(commits).toBe(1);
  });
});

describe('PluginContext.isInternal', () => {
  it('is true for a binding and an item template, false for a root and a member', () => {
    let context!: PluginContext;
    const uninstall = installPlugin({ setup: (installed) => (context = installed) });
    const member = new Field({ value: 0 });
    const template = new Group({ a: member });
    const list = new List(template, { value: [{ a: 1 }] });
    const internal = (element: FieldBase) => context.isInternal(element);
    uninstall();

    expect([internal(list), internal(member), internal(template), internal(list.get(0)!)]).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });
});

describe('PluginContext.changeInPlace', () => {
  it('throws for an element that is not a Field', () => {
    let context!: PluginContext;
    const uninstall = installPlugin({ setup: (installed) => (context = installed) });
    uninstall();

    expect(() =>
      context.changeInPlace(
        new Group({}),
        () => {},
        () => {},
        () => ({}),
      ),
    ).toThrow(TypeError);
  });
});
