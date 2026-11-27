import { computed, effectScope, EffectScope } from 'vue';

import { Action, Field, Group, List, ValueChangedAction } from '../index';

/** a computed over fullValue, compared by content: the object it returns may be the same instance after a change */
let scope: EffectScope;

beforeEach(() => {
  scope = effectScope();
});

afterEach(() => {
  scope.stop();
});

function follow(read: () => unknown) {
  return scope.run(() => computed(() => JSON.parse(JSON.stringify(read()))))!;
}

function rowsTemplate() {
  return new Group({ n: new Field({ value: 0 }), label: new Field({ value: '' }) });
}

function assignmentThrows(write: () => void) {
  expect(write).toThrow(TypeError);
}

describe('a computed over fullValue', () => {
  it('follows addField', () => {
    const group = new Group({ a: new Field({ value: 1 }) });
    const full = follow(() => group.fullValue);
    expect(full.value).toEqual({ a: 1 });

    group.addField('b', new Field({ value: 2 }));
    expect(full.value).toEqual({ a: 1, b: 2 });
  });

  it('follows removeField', () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const full = follow(() => group.fullValue);
    expect(full.value).toEqual({ a: 1, b: 2 });

    group.removeField('b');
    expect(full.value).toEqual({ a: 1 });
  });

  it('follows a write to a member field', () => {
    const group = new Group({ a: new Field({ value: 1 }) });
    const full = follow(() => group.fullValue);
    expect(full.value).toEqual({ a: 1 });

    group.fields.a.value = 5;
    expect(full.value).toEqual({ a: 5 });
  });

  it('follows a write to a field of a nested group', () => {
    const group = new Group({ inner: new Group({ x: new Field({ value: 'a' }) }) });
    const full = follow(() => group.fullValue);
    expect(full.value).toEqual({ inner: { x: 'a' } });

    group.fields.inner.fields.x.value = 'b';
    expect(full.value).toEqual({ inner: { x: 'b' } });
  });

  it('follows a write to a field in a list row', () => {
    const list = new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] });
    const group = new Group({ rows: list });
    const fullGroup = follow(() => group.fullValue);
    const fullList = follow(() => list.fullValue);
    expect(fullList.value).toEqual([{ n: 1, label: 'one' }]);

    list.get(0)!.fields.n.value = 7;
    expect(fullList.value).toEqual([{ n: 7, label: 'one' }]);
    expect(fullGroup.value).toEqual({ rows: [{ n: 7, label: 'one' }] });
  });

  it('follows list.push(), list.remove() and assigning list.value', () => {
    const list = new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] });
    const full = follow(() => list.fullValue);
    expect(full.value).toEqual([{ n: 1, label: 'one' }]);

    list.push({ n: 2, label: 'two' });
    expect(full.value).toEqual([
      { n: 1, label: 'one' },
      { n: 2, label: 'two' },
    ]);

    list.remove(0);
    expect(full.value).toEqual([{ n: 2, label: 'two' }]);

    list.value = [{ n: 3, label: 'three' }];
    expect(full.value).toEqual([{ n: 3, label: 'three' }]);
  });
});

describe('fullValue identity', () => {
  it('returns the same object from two reads without a change in between', () => {
    const group = new Group({
      a: new Field({ value: 1 }),
      inner: new Group({ x: new Field({ value: 'a' }) }),
      rows: new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] }),
    });
    expect(group.fullValue).toBe(group.fullValue);
    expect(group.fields.rows.fullValue).toBe(group.fields.rows.fullValue);
  });

  it('keeps the objects of unchanged rows after a write to one row, and builds a new one for that row', () => {
    const list = new List(rowsTemplate(), {
      value: [
        { n: 1, label: 'one' },
        { n: 2, label: 'two' },
        { n: 3, label: 'three' },
      ],
    });
    const before = list.fullValue;

    list.get(1)!.fields.n.value = 20;
    const after = list.fullValue;

    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1]).toEqual({ n: 20, label: 'two' });
  });
});

describe('fullValue is frozen', () => {
  it('freezes the fullValue of a group and its nested containers', () => {
    const group = new Group({
      a: new Field({ value: 1 }),
      inner: new Group({ x: new Field({ value: 'a' }) }),
      rows: new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] }),
    });
    const full = group.fullValue as any;

    expect(Object.isFrozen(full)).toBe(true);
    expect(Object.isFrozen(full.inner)).toBe(true);
    expect(Object.isFrozen(full.rows)).toBe(true);
    expect(Object.isFrozen(full.rows[0])).toBe(true);
  });

  it('freezes the fullValue of a list and its rows', () => {
    const list = new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] });
    const full = list.fullValue as any;

    expect(Object.isFrozen(full)).toBe(true);
    expect(Object.isFrozen(full[0])).toBe(true);
  });

  it('throws a TypeError on a write into fullValue', () => {
    const group = new Group({
      a: new Field({ value: 1 }),
      inner: new Group({ x: new Field({ value: 'a' }) }),
    });
    const list = new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] });
    const groupFull = group.fullValue as any;
    const listFull = list.fullValue as any;

    assignmentThrows(() => {
      groupFull.a = 2;
    });
    assignmentThrows(() => {
      groupFull.inner.x = 'b';
    });
    assignmentThrows(() => {
      listFull.push({ n: 2, label: 'two' });
    });
    assignmentThrows(() => {
      listFull[0].n = 5;
    });
    expect(group.fields.a.value).toBe(1);
    expect(list.get(0)!.fields.n.value).toBe(1);
  });

  it('does not freeze an array or object a field holds as its value', () => {
    const tags = ['a', 'b'];
    const meta = { k: 1 };
    const group = new Group({ tags: new Field({ value: tags }), meta: new Field({ value: meta }) });
    const list = new List(new Group({ tags: new Field<string[]>({ value: [] }) }), { value: [{ tags: ['x'] }] });

    const full = group.fullValue as any;
    expect(Object.isFrozen(full.tags)).toBe(false);
    expect(Object.isFrozen(full.meta)).toBe(false);
    expect(Object.isFrozen(group.fields.tags.value)).toBe(false);
    expect(Object.isFrozen((list.fullValue as any)[0].tags)).toBe(false);
  });
});

describe('fullValue contents', () => {
  it('includes disabled and disabled-null members with their values', () => {
    const group = new Group({
      a: new Field({ value: 1 }),
      off: new Field({ value: 'kept', access: 'disabled' }),
      nulled: new Field({ value: 'held', access: 'disabled-null' }),
    });
    expect(group.fullValue).toEqual({ a: 1, off: 'kept', nulled: 'held' });
    expect(group.value).toEqual({ a: 1, nulled: null });
  });

  it('has no key for an action member', () => {
    const group = new Group({ a: new Field({ value: 1 }), save: new Action({ value: { label: 'Save' } }) });
    expect(Object.keys(group.fullValue)).toEqual(['a']);
  });

  it('includes a disabled list row', () => {
    const list = new List(rowsTemplate(), {
      value: [
        { n: 1, label: 'one' },
        { n: 2, label: 'two' },
      ],
    });
    list.get(1)!.access = 'disabled';

    expect(list.fullValue).toEqual([
      { n: 1, label: 'one' },
      { n: 2, label: 'two' },
    ]);
    expect(list.value).toEqual([{ n: 1, label: 'one' }]);
  });
});

describe('ValueChangedAction on a container', () => {
  function record(element: Group<any> | List<any>) {
    const calls: [any, any][] = [];
    element.registerAction(
      new ValueChangedAction((el, supr, newValue, oldValue) => {
        if (el === element) calls.push([newValue, oldValue]);
        return supr(el, newValue, oldValue);
      }),
    );
    return calls;
  }

  it('fires once per change on a group with the new and previous fullValue', () => {
    const group = new Group({
      a: new Field({ value: 1 }),
      off: new Field({ value: 'x', access: 'disabled' }),
    });
    const calls = record(group);
    const previous = group.fullValue;

    group.fields.a.value = 2;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ a: 2, off: 'x' });
    expect(calls[0][0]).toEqual(group.fullValue);
    expect(calls[0][1]).toEqual(previous);
    expect(calls[0][1]).toEqual({ a: 1, off: 'x' });

    group.fields.off.value = 'y';
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual([
      { a: 2, off: 'y' },
      { a: 2, off: 'x' },
    ]);
  });

  it('fires once per change on a list with the new and previous fullValue', () => {
    const list = new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] });
    const calls = record(list);

    list.get(0)!.fields.n.value = 2;
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([[{ n: 2, label: 'one' }], [{ n: 1, label: 'one' }]]);

    list.push({ n: 3, label: 'three' });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual([
      [
        { n: 2, label: 'one' },
        { n: 3, label: 'three' },
      ],
      [{ n: 2, label: 'one' }],
    ]);
  });

  it('does not fire for a write that leaves the held value equal', () => {
    const group = new Group({ a: new Field({ value: 1 }) });
    const list = new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] });
    const groupCalls = record(group);
    const listCalls = record(list);

    group.fields.a.value = 1;
    list.get(0)!.fields.n.value = 1;

    expect(groupCalls).toHaveLength(0);
    expect(listCalls).toHaveLength(0);
  });

  it('leaves an oldValue it passed unchanged by later writes', () => {
    const group = new Group({
      a: new Field({ value: 1 }),
      rows: new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] }),
    });
    const calls = record(group);

    group.fields.a.value = 2;
    const oldValue = calls[0][1];
    const snapshot = JSON.parse(JSON.stringify(oldValue));

    group.fields.a.value = 3;
    group.fields.rows.get(0)!.fields.n.value = 9;
    group.fields.rows.push({ n: 4, label: 'four' });

    expect(oldValue).toEqual(snapshot);
    expect(oldValue).toEqual({ a: 1, rows: [{ n: 1, label: 'one' }] });
  });
});

describe('binding and resetting a container', () => {
  it('binds a group to an independent, writable copy of its data', () => {
    const group = new Group({
      a: new Field({ value: 1 }),
      inner: new Group({ x: new Field({ value: 'a' }) }),
      rows: new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] }),
    });
    const source = JSON.parse(JSON.stringify(group.fullValue));
    const copy = group.bind();

    expect(copy.fullValue).toEqual(source);

    copy.fields.a.value = 2;
    copy.fields.inner.fields.x.value = 'b';
    copy.fields.rows.get(0)!.fields.n.value = 5;
    copy.fields.rows.push({ n: 6, label: 'six' });

    expect(copy.fullValue).toEqual({
      a: 2,
      inner: { x: 'b' },
      rows: [
        { n: 5, label: 'one' },
        { n: 6, label: 'six' },
      ],
    });
    expect(group.fullValue).toEqual(source);
  });

  it('binds a list to an independent, writable copy of its data', () => {
    const list = new List(rowsTemplate(), {
      value: [
        { n: 1, label: 'one' },
        { n: 2, label: 'two' },
      ],
    });
    const source = JSON.parse(JSON.stringify(list.fullValue));
    const copy = list.bind();

    expect(copy.fullValue).toEqual(source);

    copy.get(0)!.fields.label.value = 'uno';
    copy.remove(1);
    copy.push({ n: 3, label: 'three' });

    expect(copy.fullValue).toEqual([
      { n: 1, label: 'uno' },
      { n: 3, label: 'three' },
    ]);
    expect(list.fullValue).toEqual(source);
  });

  it('resets a group and a list to originalValue', () => {
    const group = new Group({
      a: new Field({ value: 1 }),
      rows: new List(rowsTemplate(), { value: [{ n: 1, label: 'one' }] }),
    });
    const original = JSON.parse(JSON.stringify(group.originalValue));
    expect(original).toEqual({ a: 1, rows: [{ n: 1, label: 'one' }] });

    group.fields.a.value = 2;
    group.fields.rows.push({ n: 2, label: 'two' });
    expect(group.isChanged).toBe(true);
    expect(group.originalValue).toEqual(original);

    group.rebind(group.originalValue);
    expect(group.fullValue).toEqual(original);
    expect(group.isChanged).toBe(false);

    const list = group.fields.rows;
    list.get(0)!.fields.n.value = 8;
    expect(list.isChanged).toBe(true);
    list.rebind(list.originalValue);
    expect(list.fullValue).toEqual([{ n: 1, label: 'one' }]);
    expect(list.isChanged).toBe(false);
  });
});
