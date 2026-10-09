import { vi } from 'vitest';

import {
  ConditionalAccessAction,
  ConditionalVisibilityAction,
  Operator,
  Statement,
  ValidChangedAction,
  ValueChangedAction,
} from '../actions';
import { Field } from '../field';
import { Group } from '../group';
import { List } from '../list';
import { transaction } from '../transaction';
import { Validators } from '../validators';

/** what a UI layer attaches to an element: the properties it binds to the input it renders the element with */
interface Presentation {
  label: string;
}

describe('bind()', () => {
  describe('baselines every member to its part of the data', () => {
    const declaration = () =>
      new Group({
        name: new Field({ value: '' }),
        address: new Group({ city: new Field({ value: '' }) }),
        rows: new List(new Group({ item: new Field({ value: '' }) })),
      });

    it('a leaf, a nested group, a nested list and the members of its rows', () => {
      const bound = declaration().bind({ name: 'Ana', address: { city: 'Koper' }, rows: [{ item: 'a' }] });

      expect(bound.fields.name.originalValue).toBe('Ana');
      expect(bound.fields.name.isChanged).toBe(false);
      expect(bound.fields.address.originalValue).toEqual({ city: 'Koper' });
      expect(bound.fields.address.fields.city.isChanged).toBe(false);
      expect(bound.fields.rows.originalValue).toEqual([{ item: 'a' }]);
      expect(bound.fields.rows.isChanged).toBe(false);
      expect(bound.fields.rows.get(0)!.fields.item.originalValue).toBe('a');
      expect(bound.fields.rows.get(0)!.fields.item.isChanged).toBe(false);
    });

    it('a member the data leaves out to the declared member baseline', () => {
      const form = declaration();
      form.fields.name.value = 'written since';

      const bound = form.bind({ address: { city: 'Koper' } } as any);

      expect(bound.fields.name.value).toBe('');
      expect(bound.fields.name.isChanged).toBe(false);
    });

    it('the row members of a list built over data', () => {
      const list = new List(new Group({ item: new Field({ value: '' }) }), { value: [{ item: 'a' }] });

      expect(list.get(0)!.fields.item.originalValue).toBe('a');
      expect(list.get(0)!.fields.item.isChanged).toBe(false);
    });

    it('every member to null where the data is null', () => {
      const bound = declaration().bind(null as any);

      expect(bound.fields.name.value).toBeNull();
      expect(bound.fields.name.isChanged).toBe(false);
      expect(bound.isChanged).toBe(false);
    });

    it('validates a member a rule enables over the value it is bound to', () => {
      const row = new Group({
        kind: new Field({ value: 'stock' }),
        description: new Field({ value: '', validators: [new Validators.Required()] }),
      });
      row.fields.description.registerAction(
        new ConditionalAccessAction(new Statement(row.fields.kind, Operator.EQUALS, 'custom'), 'editable', 'disabled'),
      );

      const bound = row.bind({ kind: 'custom', description: 'oak' });

      expect(bound.fields.description.enabled).toBe(true);
      expect(bound.fields.description.errors).toEqual([]);
      expect(bound.valid).toBe(true);
    });

    it('every member to its current value where no data is supplied', () => {
      const form = declaration();
      form.fields.name.value = 'current';

      const bound = form.bind();

      expect(bound.fields.name.value).toBe('current');
      expect(bound.fields.name.isChanged).toBe(false);
      expect(bound.isChanged).toBe(false);
    });
  });

  it('reads originalValue by key presence and everything else by fallback', () => {
    const field = new Field({ value: 'a', originalValue: 'declared', access: 'disabled', visibility: 'hidden' });

    // no key, so the new element baselines the data it was bound to and starts out unchanged
    expect(field.bind('b').originalValue).toBe('b');
    expect(field.bind('b').isChanged).toBe(false);
    // the key is there, so the baseline it names stands and the data it was bound to is a change of it
    expect(field.bind('b', { originalValue: 'declared' }).originalValue).toBe('declared');
    expect(field.bind('b', { originalValue: 'declared' }).isChanged).toBe(true);

    expect(field.bind('b').enabled).toBe(false);
    expect(field.bind('b').visibility).toBe('hidden');
    expect(field.bind('b', { access: 'editable', visibility: 'full' }).enabled).toBe(true);
    expect(field.bind('b', { access: 'editable', visibility: 'full' }).visibility).toBe('full');
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

  it('rebinds a disabled element like any other', () => {
    const field = new Field({ value: 'a' });
    field.value = 'b';
    field.access = 'disabled';

    field.rebind('c');

    expect(field.value).toBe('c');
    expect(field.originalValue).toBe('c');
    expect(field.isChanged).toBe(false);
  });

  it('writes through a disabled container to its members', () => {
    const group = new Group({ name: new Field({ value: 'a' }) }, { access: 'disabled' });
    const list = new List(new Group({ name: new Field({ value: '' }) }), {
      value: [{ name: 'a' }],
      access: 'disabled',
    });

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
  it('gives a recycled row and its members the access and visibility of the declaration', () => {
    const template = new Group({ name: new Field({ value: '' }) });
    const list = new List(template, { value: [{ name: 'a' }, { name: 'b' }] });
    const first = list.get(0)!;
    first.access = 'disabled';
    list.get(1)!.fields.name.visibility = 'hidden';
    expect(list.value).toEqual([{ name: 'b' }]);

    list.rebind(list.originalValue);

    expect(list.get(0)).toBe(first);
    expect(first.access).toBe('editable');
    expect(list.get(1)!.fields.name.visibility).toBe('full');
    expect(list.value).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  it('gives a row reused by an assignment the access of the declaration', () => {
    const list = new List(new Group({ name: new Field({ value: '' }) }), { value: [{ name: 'a' }] });
    list.get(0)!.access = 'disabled';

    list.value = [{ name: 'b' }];

    expect(list.get(0)!.access).toBe('editable');
    expect(list.value).toEqual([{ name: 'b' }]);
  });

  it('applies the conditional rules of a recycled row again over the record it takes', () => {
    const template = new Group({ kind: new Field({ value: 'standard' }), detail: new Field({ value: '' }) });
    template.fields.detail.registerAction(
      new ConditionalVisibilityAction(new Statement(template.fields.kind, Operator.EQUALS, 'other')),
    );
    const list = new List(template, { value: [{ kind: 'other', detail: 'x' }] });
    const detail = list.get(0)!.fields.detail;
    expect(detail.visibility).toBe('full');

    // the statement's result is the same before and after: the rule still writes it over the declaration's visibility
    list.rebind([{ kind: 'other', detail: 'y' }]);

    expect(detail.visibility).toBe('full');
  });

  it('gives the members of a bound group the access and visibility of the declaration', () => {
    const declaration = new Group({ name: new Field({ value: '' }) });
    const group = declaration.bind({ name: 'a' });
    group.access = 'readonly';
    group.fields.name.access = 'disabled';

    group.rebind({ name: 'b' });

    expect(group.access).toBe('readonly');
    expect(group.fields.name.access).toBe('editable');
    expect(group.value).toEqual({ name: 'b' });
  });

  describe('records the baseline after the conditional rules applied over the new record', () => {
    const detailWhenOther = (kind: Field<string>) =>
      new ConditionalAccessAction(new Statement(kind, Operator.EQUALS, 'other'), 'editable', 'disabled');
    const rowTemplate = () => {
      const template = new Group({ kind: new Field({ value: 'standard' }), detail: new Field({ value: '' }) });
      template.fields.detail.registerAction(detailWhenOther(template.fields.kind));
      return template;
    };

    it('where the statement keeps its result', () => {
      const list = new List(rowTemplate(), { value: [{ kind: 'other', detail: 'x' }] });
      const row = list.get(0)!;

      row.rebind({ kind: 'other', detail: 'y' });

      expect(row.value).toEqual({ kind: 'other', detail: 'y' });
      expect(row.originalValue).toEqual({ kind: 'other', detail: 'y' });
      expect(row.isChanged).toBe(false);
    });

    it('where the statement changes its result', () => {
      const list = new List(rowTemplate(), { value: [{ kind: 'standard', detail: '' }] });
      const row = list.get(0)!;

      row.rebind({ kind: 'other', detail: 'y' });

      expect(row.value).toEqual({ kind: 'other', detail: 'y' });
      expect(row.isChanged).toBe(false);
    });

    it('on a list whose row is reused', () => {
      const list = new List(rowTemplate(), { value: [{ kind: 'standard', detail: '' }] });

      list.rebind([{ kind: 'other', detail: 'y' }]);

      expect(list.value).toEqual([{ kind: 'other', detail: 'y' }]);
      expect(list.get(0)!.isChanged).toBe(false);
      expect(list.isChanged).toBe(false);
    });

    it('on a row reused by an assignment, whose list stays changed', () => {
      const list = new List(rowTemplate(), { value: [{ kind: 'standard', detail: '' }] });

      list.value = [{ kind: 'other', detail: 'y' }];

      expect(list.get(0)!.isChanged).toBe(false);
      expect(list.isChanged).toBe(true);
    });

    it('on a declared group', () => {
      const form = new Group({ kind: new Field({ value: 'standard' }), detail: new Field({ value: '' }) });
      form.fields.detail.registerAction(detailWhenOther(form.fields.kind));

      form.rebind({ kind: 'other', detail: 'y' });

      expect(form.value).toEqual({ kind: 'other', detail: 'y' });
      expect(form.isChanged).toBe(false);
    });
  });

  it('keeps the access and visibility of the element it is called on and of a declared member', () => {
    const form = new Group({ name: new Field({ value: 'a' }) });
    form.access = 'readonly';
    form.visibility = 'hidden';
    form.fields.name.access = 'disabled';

    form.rebind({ name: 'b' });

    expect(form.access).toBe('readonly');
    expect(form.visibility).toBe('hidden');
    expect(form.fields.name.access).toBe('disabled');
  });

  it('restores the access of a recycled row when the transaction rolls back', () => {
    const list = new List(new Group({ name: new Field({ value: '' }) }), { value: [{ name: 'a' }] });
    list.get(0)!.access = 'disabled';

    expect(() =>
      transaction(() => {
        list.rebind([{ name: 'b' }]);
        throw new Error('abandon');
      }),
    ).toThrow('abandon');

    expect(list.get(0)!.access).toBe('disabled');
  });
});
