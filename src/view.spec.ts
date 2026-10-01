import { expectTypeOf } from 'vitest';
import { nextTick, reactive, watchEffect } from 'vue';

import { ListItemAddedAction, ListItemRemovedAction, ValueChangedAction } from './actions';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { Validators } from './validators';
import { type View, view } from './view';

const order = () =>
  new Group({
    customer: new Group({ id: new Field({ value: 7 }), email: new Field({ value: 'ada@x' }) }),
    lines: new List(new Group({ sku: new Field({ value: '' }) }), { value: [{ sku: 'a-1' }, { sku: 'b-7' }] }),
    tags: new Field<string[]>({ value: ['gift'] }),
  });

describe('view() of a group', () => {
  it('reads a field as its value and a container as its view', () => {
    const s = view(order());

    expect(s.customer?.email).toBe('ada@x');
    expect(s.tags).toEqual(['gift']);
    expect(s.lines?.[1]?.sku).toBe('b-7');
  });

  it('writes a field through its key', () => {
    const group = order();
    const s = view(group);

    s.customer!.email = 'grace@x';

    expect(group.fields.customer.fields.email.value).toBe('grace@x');
  });

  it('answers the element as $, its members read and written through it', () => {
    const group = new Group({ name: new Field({ value: '', validators: [new Validators.Required()] }) });
    const s = view(group);

    expect(s.$.valid).toBe(false);
    expect(s.$).toBe(group);
    s.$.access = 'disabled';
    expect(group.enabled).toBe(false);
    s.name = 'Ada';
    expect(s.$.value).toEqual({ name: 'Ada' });
    s.$.value = null;
    expect(group.fields.name.value).toBeNull();
    expect(s.$.bind({ name: 'x' })).toBeInstanceOf(Group);
    expect(() => {
      (s as any).$ = group;
    }).toThrow(TypeError);
  });

  it('hands out one view per element, and a view of a view is the view', () => {
    const group = order();

    expect(view(group)).toBe(view(group));
    expect(view(view(group))).toBe(view(group));
    expect(view(group).customer).toBe(view(group.fields.customer));
  });

  it('reads every member as what it holds, whatever its access or visibility', () => {
    const group = order();
    const s = view(group);

    group.fields.customer.access = 'disabled';
    group.fields.tags.access = 'disabled-null';
    group.fields.lines.visibility = 'suppress';

    expect(s.customer.email).toBe('ada@x');
    expect(s.tags).toEqual(group.fields.tags.value);
    expect(Object.keys(s)).toEqual(['customer', 'lines', 'tags']);
  });

  it('spreads, lists its keys and stringifies as the data it holds', () => {
    const s = view(new Group({ a: new Field({ value: 1 }), b: new Group({ c: new Field({ value: 2 }) }) }));

    expect(Object.keys(s)).toEqual(['a', 'b']);
    expect({ ...s.b }).toEqual({ c: 2 });
    expect(JSON.parse(JSON.stringify(s))).toEqual({ a: 1, b: { c: 2 } });
    expect('a' in s).toBe(true);
    expect('$' in s).toBe(true);
  });

  it('re-runs an effect reading one field only when that field changes', async () => {
    const group = order();
    const s = view(group);
    const seen: string[] = [];
    watchEffect(() => {
      seen.push(s.customer!.email!);
    });

    group.fields.customer.fields.id.value = 8;
    await nextTick();
    s.customer!.email = 'b@x';
    await nextTick();

    expect(seen).toEqual(['ada@x', 'b@x']);
  });

  it('is left as it is by reactive(), and is never a thenable', async () => {
    const s = view(order());

    expect(reactive({ s }).s).toBe(s);
    expect(await Promise.resolve(s)).toBe(s);
  });

  it('refuses a group whose member names a view cannot hand out', () => {
    expect(() => view(new Group({ $: new Field() }))).toThrow(TypeError);
    expect(view(new Group({ $x: new Field({ value: 1 }) })).$x).toBe(1);
    expect(() => view(new Group({ then: new Field() }))).toThrow(TypeError);
  });

  it('refuses a key that is not a member', () => {
    const s = view(order()) as any;

    expect(() => {
      s.nope = 1;
    }).toThrow(TypeError);
    expect(() => {
      delete s.customer;
    }).toThrow(TypeError);
  });
});

describe('view() of a list', () => {
  const tags = (values: string[]) => new List(new Field<string>(), { value: values });

  it('is an array: it reads, iterates and maps like one', () => {
    const t = view(tags(['a', 'b', 'c']));

    expect(Array.isArray(t)).toBe(true);
    expect(t.length).toBe(3);
    expect([...t]).toEqual(['a', 'b', 'c']);
    expect(t.map((tag) => tag!.toUpperCase())).toEqual(['A', 'B', 'C']);
    expect(t.includes('b')).toBe(true);
    expect(JSON.stringify(t)).toBe('["a","b","c"]');
  });

  it('writes a row through its index, and appends through the index past the end', () => {
    const list = tags(['a', 'b']);
    const t = view(list);

    t[0] = 'x';
    t[2] = 'z';

    expect(list.value).toEqual(['x', 'b', 'z']);
  });

  it('pushes and pops as the list does, announcing each row', () => {
    const list = tags(['a']);
    const t = view(list);
    const events: string[] = [];
    list.registerAction(
      new ListItemAddedAction((field, supr, item, index) => (events.push(`+${index}`), supr(field, item, index))),
    );
    list.registerAction(
      new ListItemRemovedAction((field, supr, item, index) => (events.push(`-${index}`), supr(field, item, index))),
    );

    expect(t.push('b', 'c')).toBe(3);
    expect(t.pop()).toBe('c');
    expect(t.shift()).toBe('a');
    expect(t.unshift('z')).toBe(2);

    expect(list.value).toEqual(['z', 'b']);
    expect(events).toEqual(['+1', '+2', '-2', '-0', '+0']);
  });

  it('splices, sorts and reverses by moving the rows themselves', () => {
    const list = tags(['c', 'a', 'b']);
    const t = view(list);
    const [c, a, b] = list.items;

    expect(t.splice(1, 1, 'x', 'y')).toEqual(['a']);
    expect(list.value).toEqual(['c', 'x', 'y', 'b']);

    const [, x, y] = list.items;
    expect(t.sort()).toBe(t);
    expect(list.value).toEqual(['b', 'c', 'x', 'y']);
    expect(list.items).toEqual([b, c, x, y]);

    t.reverse();
    expect(list.items).toEqual([y, x, c, b]);
    expect(a.parent).toBeUndefined();
  });

  it('keeps each row with its state through a sort', () => {
    const list = new List(new Field<string>({ validators: [new Validators.Required()] }), { value: ['b', ''] });
    const t = view(list);

    t.sort();

    expect(list.value).toEqual(['', 'b']);
    expect(list.get(0)!.valid).toBe(false);
    expect(list.get(1)!.valid).toBe(true);
  });

  it('shrinks by its length, and refuses to grow by it', () => {
    const list = tags(['a', 'b', 'c']);
    const t = view(list);

    t.length = 1;
    expect(list.value).toEqual(['a']);
    expect(() => {
      t.length = 5;
    }).toThrow(TypeError);
  });

  it('reads group rows as views, every row whatever its access', () => {
    const list = new List(new Group({ sku: new Field({ value: '' }) }), {
      value: [{ sku: 'a' }, { sku: 'b' }, { sku: 'c' }],
    });
    const t = view(list);

    list.get(0)!.access = 'disabled-null';
    list.get(1)!.access = 'disabled';

    expect(t.length).toBe(3);
    expect(t[0]!.sku).toBe('a');
    expect(t[1]!.sku).toBe('b');
    t.push({ sku: 'd' });
    expect(list.value).toEqual([null, { sku: 'c' }, { sku: 'd' }]);
    expect(list.length).toBe(4);
  });

  it('takes a view or an element as a row as readily as data', () => {
    const list = new List(new Group({ sku: new Field({ value: '' }) }));
    const t = view(list);
    const row = new Group({ sku: new Field({ value: 'r' }) });

    t.push(view(row));

    expect(list.get(0)).toBe(row);
  });

  it('refuses fill() and copyWithin(), which have no rows to move', () => {
    const t = view(tags(['a']));

    expect(() => (t as any).fill('x')).toThrow(TypeError);
    expect(() => (t as any).copyWithin(0, 0)).toThrow(TypeError);
  });
});

describe('view() of a field', () => {
  it('answers the field as $ and holds no data keys', () => {
    const field = new Field({ value: 1 });
    const f = view(field);

    expect(f.$.value).toBe(1);
    f.$.value = 2;
    expect(field.value).toBe(2);
    expect(Object.keys(f)).toEqual([]);
  });
});

describe('The types a view carries', () => {
  it('types a field member by its value, a container member by its view, and the element as $', () => {
    const s = view(order());

    expectTypeOf(s.customer).toEqualTypeOf<View<Group<{ id: Field<number>; email: Field<string> }>>>();
    expectTypeOf(s.customer.email).toEqualTypeOf<string>();
    expectTypeOf(s.tags).toEqualTypeOf<string[]>();
    expectTypeOf(s.$.valid).toEqualTypeOf<boolean>();
    expectTypeOf(s.$).toEqualTypeOf<ReturnType<typeof order>>();
    expectTypeOf(s.lines!.length).toEqualTypeOf<number>();
  });

  it('replaces a container through its element, whose value takes null', () => {
    const s = view(order());
    s.$.value = null;
    s.$.value = { tags: ['fragile'] };

    const rejected = () => {
      // @ts-expect-error a container member is replaced through its element: s.$.fields.customer.value
      s.customer = null;
    };
    expect(rejected).toBeInstanceOf(Function);
  });

  it('announces what a write through the view changes, as a write to the element does', () => {
    const group = order();
    const seen: unknown[] = [];
    group.registerAction(
      new ValueChangedAction((field, supr, newValue, oldValue) => {
        if (field === group) seen.push(newValue);
        return supr(field, newValue, oldValue);
      }),
    );

    view(group).tags = ['urgent'];

    expect(seen).toHaveLength(1);
  });
});
