import { vi } from 'vitest';

import { ValidChangedAction, ValueChangedAction } from './actions';
import DisplayMode from './display-mode';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { transaction } from './transaction';
import { Validators } from './validators';

/** what a UI layer attaches to an element: the properties it binds to the input it renders the element with */
interface Presentation {
  label: string;
}

describe('bind()', () => {
  it('reads originalValue by key presence and everything else by fallback', () => {
    const field = new Field({ value: 'a', originalValue: 'declared', enabled: false, visibility: DisplayMode.HIDDEN });

    // no key, so the new element baselines the data it was bound to and starts out unchanged
    expect(field.bind('b').originalValue).toBe('b');
    expect(field.bind('b').isChanged).toBe(false);
    // the key is there, so the baseline it names stands and the data it was bound to is a change of it
    expect(field.bind('b', { originalValue: 'declared' }).originalValue).toBe('declared');
    expect(field.bind('b', { originalValue: 'declared' }).isChanged).toBe(true);

    expect(field.bind('b').enabled).toBe(false);
    expect(field.bind('b').visibility).toBe(DisplayMode.HIDDEN);
    expect(field.bind('b', { enabled: true, visibility: DisplayMode.FULL }).enabled).toBe(true);
    expect(field.bind('b', { enabled: true, visibility: DisplayMode.FULL }).visibility).toBe(DisplayMode.FULL);
  });

  it('names the element it was called on as the declaration of what it produces', () => {
    const declaration = new Field({ value: 'a' });

    expect(declaration.bind('b').declaration).toBe(declaration);
    expect(declaration.bind('b').bind('c').declaration).toBe(declaration);
  });
});

describe('rebind()', () => {
  it('exchanges the data of the very same instance and starts the change history over', () => {
    const field = new Field({ value: 'a' });
    field.value = 'b';
    field.touched = true;
    expect(field.isChanged).toBe(true);

    const answer = field.rebind('c');

    expect(answer).toBe(field);
    expect(field.value).toBe('c');
    expect(field.originalValue).toBe('c');
    expect(field.isChanged).toBe(false);
    expect(field.touched).toBe(false);
  });

  it('announces nothing about the element it is called on', () => {
    const onChanged = vi.fn();
    const field = new Field({ value: 'a' }).registerAction(new ValueChangedAction(onChanged));

    field.rebind('b');

    expect(field.value).toBe('b');
    expect(onChanged).not.toHaveBeenCalled();
    // and the exchange is not the baseline a later change is measured against: that change is announced
    field.value = 'c';
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith(field, expect.any(Function), 'c', 'b');
  });

  it('runs the validators over the data it binds', () => {
    const field = new Field({ value: 'a', validators: [new Validators.Required()] });
    expect(field.valid).toBe(true);

    field.rebind('');

    expect(field.valid).toBe(false);
    expect(field.errors.length).toBe(1);

    field.rebind('b');

    expect(field.valid).toBe(true);
    expect(field.errors).toEqual([]);
  });

  it('keeps the extended properties the element carries', () => {
    const field = new Field<string, Presentation>({ value: 'a', label: 'Name' });

    field.rebind('b');

    expect(field.extra).toEqual({ label: 'Name' });
  });

  it('leaves a disabled element holding what it holds, and baselines that', () => {
    const field = new Field({ value: 'a' });
    field.value = 'b';
    field.enabled = false;

    field.rebind('c');

    expect(field.value).toBe('b');
    expect(field.originalValue).toBe('b');
    expect(field.isChanged).toBe(false);
  });

  it('writes through a disabled container to its members', () => {
    const group = new Group({ name: new Field({ value: 'a' }) }, { enabled: false });
    const list = new List(new Group({ name: new Field({ value: '' }) }), { value: [{ name: 'a' }], enabled: false });

    group.rebind({ name: 'b' });
    list.rebind([{ name: 'b' }]);

    expect(group.value).toEqual({ name: 'b' });
    expect(group.originalValue).toEqual({ name: 'b' });
    expect(list.value).toEqual([{ name: 'b' }]);
    expect(list.originalValue).toEqual([{ name: 'b' }]);
  });

  it('recycles a row across records, without taking it out of the list', () => {
    const template = new Group({ name: new Field({ value: 'unnamed' }), age: new Field({ value: 0 }) });
    const list = new List(template, { value: [{ name: 'John', age: 30 }] });
    const row = list.get(0)!;
    row.fields.name.value = 'Johnny';

    row.rebind({ name: 'Jane', age: 25 });

    expect(list.get(0)).toBe(row);
    expect(row.parent).toBe(list);
    expect(row.value).toEqual({ name: 'Jane', age: 25 });
    expect(row.isChanged).toBe(false);
    expect(list.value).toEqual([{ name: 'Jane', age: 25 }]);
  });

  it('takes a member the record leaves out from the declaration, not from the record before it', () => {
    const template = new Group({ name: new Field({ value: 'unnamed' }), age: new Field({ value: 0 }) });
    const list = new List(template, { value: [{ name: 'John', age: 30 }] });
    const row = list.get(0)!;

    row.rebind({ name: 'Jane' });

    expect(row.value).toEqual({ name: 'Jane', age: 0 });
  });

  it('announces nothing for the row and its own change for every member of it', () => {
    const rowSeen: any[] = [];
    const memberSeen: any[] = [];
    const template = new Group({ name: new Field({ value: '' }) });
    template.registerAction(new ValueChangedAction((element, supr, newValue) => rowSeen.push(newValue)));
    template.fields.name.registerAction(new ValueChangedAction((element, supr, newValue) => memberSeen.push(newValue)));
    const list = new List(template, { value: [{ name: 'John' }] });
    const row = list.get(0)!;
    memberSeen.length = 0;

    row.rebind({ name: 'Jane' });

    expect(rowSeen).toEqual([]);
    expect(memberSeen).toEqual(['Jane']);
  });

  it('reports the verdict the new data reaches to the container holding the element', () => {
    const validSeen: boolean[] = [];
    const template = new Group({ name: new Field({ validators: [new Validators.Required()] }) });
    const list = new List(template, { value: [{ name: 'John' }] }).registerAction(
      new ValidChangedAction((element, supr, newValue) => validSeen.push(newValue)),
    );
    expect(list.valid).toBe(true);

    list.get(0)!.rebind({ name: '' });

    expect(list.valid).toBe(false);
    expect(validSeen).toEqual([false]);

    list.get(0)!.rebind({ name: 'Jane' });

    expect(list.valid).toBe(true);
    expect(validSeen).toEqual([false, true]);
  });

  it('exchanges the rows of a list', () => {
    const template = new Group({ name: new Field({ value: '' }) });
    const list = new List(template, { value: [{ name: 'John' }, { name: 'Jane' }] });
    const firstRow = list.get(0)!;

    list.rebind([{ name: 'Bob' }]);

    expect(list.value).toEqual([{ name: 'Bob' }]);
    expect(list.isChanged).toBe(false);
    // the row standing at a position is reused, the way a whole-list assignment reuses it
    expect(list.get(0)).toBe(firstRow);
  });

  it('carries a change the open transaction still owes an announcement for', () => {
    const seen: any[] = [];
    const field = new Field({ value: 'a' }).registerAction(
      new ValueChangedAction((element, supr, newValue, oldValue) => seen.push({ newValue, oldValue })),
    );

    transaction(() => {
      field.value = 'b';
      field.rebind('c');
    });

    // the write is owed an announcement, so the exchange reports what the element became over the whole
    // transaction rather than erasing the report the write opened
    expect(field.value).toBe('c');
    expect(seen).toEqual([{ newValue: 'c', oldValue: 'a' }]);
  });

  it('carries a member change the open transaction still owes an announcement for', () => {
    const seen: any[] = [];
    const group = new Group({ name: new Field({ value: 'a' }) }).registerAction(
      new ValueChangedAction((element, supr, newValue, oldValue) => seen.push({ newValue, oldValue })),
    );

    transaction(() => {
      group.fields.name.value = 'b';
      group.rebind({ name: 'c' });
    });

    expect(group.value).toEqual({ name: 'c' });
    expect(seen).toEqual([{ newValue: { name: 'c' }, oldValue: { name: 'a' } }]);
  });

  it('carries a structural change the open transaction still owes an announcement for', () => {
    const seen: any[] = [];
    const template = new Group({ name: new Field({ value: '' }) });
    const list = new List(template, { value: [{ name: 'a' }, { name: 'b' }] }).registerAction(
      new ValueChangedAction((element, supr, newValue, oldValue) => seen.push({ newValue, oldValue })),
    );

    transaction(() => {
      list.push({ name: 'c' });
      list.rebind([{ name: 'z' }]);
    });

    // a structural operation announces without comparing, so the pair it carries has to be the one the
    // transaction opened on rather than the record the exchange left behind
    expect(list.value).toEqual([{ name: 'z' }]);
    expect(seen).toEqual([{ newValue: [{ name: 'z' }], oldValue: [{ name: 'a' }, { name: 'b' }] }]);
  });

  it('is put back by a rolled-back transaction', () => {
    const field = new Field({ value: 'a' });
    field.value = 'b';

    transaction((tx) => {
      field.rebind('c');
      expect(field.value).toBe('c');
      tx.rollback();
    });

    expect(field.value).toBe('b');
    expect(field.originalValue).toBe('a');
    expect(field.isChanged).toBe(true);
  });
});
