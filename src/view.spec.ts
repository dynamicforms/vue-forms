import { expectTypeOf } from 'vitest';
import { nextTick, reactive, watchEffect } from 'vue';

import { ListItemAddedAction, ListItemRemovedAction, ValueChangedAction } from './actions';
import DisplayMode from './display-mode';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { Validators } from './validators';
import { type View, view } from './view';

const session = () =>
  new Group({
    account: new Group({ id: new Field({ value: 7 }), email: new Field({ value: 'ada@x' }) }),
    clubs: new List(new Group({ slug: new Field({ value: '' }) }), { value: [{ slug: 'nk' }, { slug: 'sk' }] }),
    permissions: new Field<string[]>({ value: ['read'] }),
  });

describe('view() of a group', () => {
  it('reads a field as its value and a container as its view', () => {
    const s = view(session());

    expect(s.account?.email).toBe('ada@x');
    expect(s.permissions).toEqual(['read']);
    expect(s.clubs?.[1]?.slug).toBe('sk');
  });

  it('writes a field through its key', () => {
    const group = session();
    const s = view(group);

    s.account!.email = 'grace@x';

    expect(group.fields.account.fields.email.value).toBe('grace@x');
  });

  it('answers every member of the element under a $ prefix, and the element as $element', () => {
    const group = new Group({ name: new Field({ value: '', validators: [new Validators.Required()] }) });
    const s = view(group);

    expect(s.$valid).toBe(false);
    expect(s.$element).toBe(group);
    s.$enabled = false;
    expect(group.enabled).toBe(false);
    s.name = 'Ada';
    expect(s.$value).toEqual({ name: 'Ada' });
    s.$value = null;
    expect(group.fields.name.value).toBeNull();
    // methods are bound to the element
    const { $validate } = s;
    $validate(true);
    expect(s.$bind({ name: 'x' })).toBeInstanceOf(Group);
  });

  it('hands out one view per element, and a view of a view is the view', () => {
    const group = session();

    expect(view(group)).toBe(view(group));
    expect(view(view(group))).toBe(view(group));
    expect(view(group).account).toBe(view(group.fields.account));
  });

  it('reads a hidden member as null and leaves a suppressed one out, whatever is enabled', () => {
    const group = session();
    const s = view(group);

    group.fields.account.visibility = DisplayMode.HIDDEN;
    expect(s.account).toBeNull();
    group.fields.permissions.visibility = DisplayMode.SUPPRESS;
    expect(s.permissions).toBeUndefined();
    expect(Object.keys(s)).toEqual(['account', 'clubs']);

    group.fields.account.visibility = DisplayMode.FULL;
    group.fields.account.enabled = false;
    expect(s.account!.email).toBe('ada@x');
  });

  it('spreads, lists its keys and stringifies as the data it holds', () => {
    const s = view(new Group({ a: new Field({ value: 1 }), b: new Group({ c: new Field({ value: 2 }) }) }));

    expect(Object.keys(s)).toEqual(['a', 'b']);
    expect({ ...s.b }).toEqual({ c: 2 });
    expect(JSON.parse(JSON.stringify(s))).toEqual({ a: 1, b: { c: 2 } });
    expect('a' in s).toBe(true);
    expect('$valid' in s).toBe(true);
  });

  it('re-runs an effect reading one field only when that field changes', async () => {
    const group = session();
    const s = view(group);
    const seen: string[] = [];
    watchEffect(() => {
      seen.push(s.account!.email!);
    });

    group.fields.account.fields.id.value = 8;
    await nextTick();
    s.account!.email = 'b@x';
    await nextTick();

    expect(seen).toEqual(['ada@x', 'b@x']);
  });

  it('is left as it is by reactive(), and is never a thenable', async () => {
    const s = view(session());

    expect(reactive({ s }).s).toBe(s);
    expect(await Promise.resolve(s)).toBe(s);
  });

  it('refuses a group whose member names a view cannot hand out', () => {
    expect(() => view(new Group({ $x: new Field() }))).toThrow(TypeError);
    expect(() => view(new Group({ then: new Field() }))).toThrow(TypeError);
  });

  it('refuses a key that is not a member', () => {
    const s = view(session()) as any;

    expect(() => {
      s.nope = 1;
    }).toThrow(TypeError);
    expect(() => {
      delete s.account;
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

  it('reads group rows as views, a hidden row as null, and leaves a suppressed row out of its indices', () => {
    const list = new List(new Group({ slug: new Field({ value: '' }) }), {
      value: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }],
    });
    const t = view(list);

    list.get(0)!.visibility = DisplayMode.HIDDEN;
    list.get(1)!.visibility = DisplayMode.SUPPRESS;

    expect(t.length).toBe(2);
    expect(t[0]).toBeNull();
    expect(t[1]!.slug).toBe('c');
    t.push({ slug: 'd' });
    expect(list.value).toEqual([null, { slug: 'c' }, { slug: 'd' }]);
    expect(list.length).toBe(4);
  });

  it('takes a view or an element as a row as readily as data', () => {
    const list = new List(new Group({ slug: new Field({ value: '' }) }));
    const t = view(list);
    const row = new Group({ slug: new Field({ value: 'r' }) });

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
  it('answers every member under a $ prefix and holds no data keys', () => {
    const field = new Field({ value: 1 });
    const f = view(field);

    expect(f.$value).toBe(1);
    f.$value = 2;
    expect(field.value).toBe(2);
    expect(Object.keys(f)).toEqual([]);
  });
});

describe('The types a view carries', () => {
  it('types a field member by its value, a container member by its view, and members under $', () => {
    const s = view(session());

    expectTypeOf(s.account).toEqualTypeOf<
      View<Group<{ id: Field<number>; email: Field<string> }>> | null | undefined
    >();
    expectTypeOf(s.account!.email).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(s.permissions).toEqualTypeOf<string[] | null | undefined>();
    expectTypeOf(s.$valid).toEqualTypeOf<boolean>();
    expectTypeOf(s.$element).toEqualTypeOf<ReturnType<typeof session>>();
    expectTypeOf(s.clubs!.length).toEqualTypeOf<number>();
  });

  it('takes on $value what the element takes, which on a group includes null', () => {
    const s = view(session());
    s.$value = null;
    s.$value = { permissions: ['x'] };

    const rejected = () => {
      // @ts-expect-error a container member is replaced through its $value
      s.account = null;
    };
    expect(rejected).toBeInstanceOf(Function);
  });

  it('announces what a write through the view changes, as a write to the element does', () => {
    const group = session();
    const seen: unknown[] = [];
    group.registerAction(
      new ValueChangedAction((field, supr, newValue, oldValue) => {
        if (field === group) seen.push(newValue);
        return supr(field, newValue, oldValue);
      }),
    );

    view(group).permissions = ['write'];

    expect(seen).toHaveLength(1);
  });
});
