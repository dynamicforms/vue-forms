import { nextTick, watchEffect } from 'vue';

import { ContributionChangedAction, ValidChangedAction, ValueChangedAction } from './actions';
import { Field } from './field';
import { FieldBase } from './field-base';
import { Group } from './group';
import { List } from './list';
import { transaction } from './transaction';
import { ValidationError, Validators } from './validators';

/** every transition of `element`'s own announcements of one kind, newest last */
function watchOwn(element: FieldBase, kind: 'value' | 'valid' | 'contribution'): unknown[] {
  const seen: unknown[] = [];
  const Action = { value: ValueChangedAction, valid: ValidChangedAction, contribution: ContributionChangedAction }[
    kind
  ];
  element.registerAction(
    new Action((field: FieldBase, supr: any, newValue: any, oldValue: any) => {
      if (field === element) seen.push(newValue);
      return supr(field, newValue, oldValue);
    }),
  );
  return seen;
}

const required = (value: string) => new Field<string>({ value, validators: [new Validators.Required()] });

describe('An enabled container serializes', () => {
  it('as {} or [] where nothing inside it contributes, never as null', () => {
    const group = new Group({ a: new Field({ value: 1, access: 'disabled' }) });
    const list = new List(new Field<string>());

    expect(group.value).toEqual({});
    expect(list.value).toEqual([]);
    expect(Object.isFrozen(group.value)).toBe(true);
    expect(Object.isFrozen(list.value)).toBe(true);
  });

  it('is left out of its parent where it is disabled, whatever it holds', () => {
    const sub = new Group({ a: new Field({ value: 1 }) }, { access: 'disabled' });
    const form = new Group({ sub, name: new Field({ value: 'x' }) });

    expect(form.value).toEqual({ name: 'x' });
    sub.access = 'editable';
    expect(form.value).toEqual({ sub: { a: 1 }, name: 'x' });
  });

  it('empties its members on value = null rather than becoming null', () => {
    const group = new Group({ a: new Field({ value: 'x' }), rows: new List(new Field<string>(), { value: ['r'] }) });

    group.value = null;

    expect(group.value).toEqual({ a: null, rows: [] });
  });
});

describe('Access in a group', () => {
  it('sends an editable or readonly member, sends a disabled-null one as null and leaves a disabled one out', () => {
    const form = new Group({
      a: new Field({ value: 1 }),
      b: new Field({ value: 2, access: 'readonly' }),
      c: new Field({ value: 3, access: 'disabled-null' }),
      d: new Field({ value: 4, access: 'disabled' }),
    });

    expect(form.value).toEqual({ a: 1, b: 2, c: null });
    expect(form.fullValue).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it('keeps what a member holds for when it is sent again', () => {
    const billing = new Group({ street: new Field({ value: 'Main 1' }) });
    const form = new Group({ billing, customer: new Field({ value: 'Ada' }) });

    billing.access = 'disabled-null';
    expect(form.value).toEqual({ billing: null, customer: 'Ada' });
    expect(form.fullValue).toEqual({ billing: { street: 'Main 1' }, customer: 'Ada' });

    billing.access = 'editable';
    expect(form.value).toEqual({ billing: { street: 'Main 1' }, customer: 'Ada' });
  });

  it('runs the validators over what a member sends, and not at all where it sends nothing', () => {
    const form = new Group({ a: required('x'), b: required('y') });
    const seen = watchOwn(form, 'valid');
    expect(form.valid).toBe(true);

    form.fields.b.access = 'disabled-null';
    expect(form.fields.b.valid).toBe(false);
    expect(form.valid).toBe(false);
    form.fields.b.access = 'disabled';
    expect(form.fields.b.errors).toEqual([]);
    expect(form.valid).toBe(true);
    form.fields.b.value = '';
    expect(form.valid).toBe(true);
    form.fields.b.access = 'readonly';
    expect(form.valid).toBe(false);

    expect(seen).toEqual([false, true, false]);
  });

  it('runs a container validator over what the container sends', () => {
    const invoice = new Group({ name: new Field({ value: '' }) }, { validators: [new Validators.Required()] });
    const form = new Group({ invoice });

    invoice.fields.name.access = 'disabled';
    // a group sends {} where none of its members contributes, and Required refuses an empty object
    expect(invoice.valid).toBe(false);
    invoice.access = 'disabled-null';
    expect(invoice.valid).toBe(false);
    invoice.access = 'disabled';
    expect(invoice.valid).toBe(true);
    expect(form.valid).toBe(true);
  });

  it('checks no member of a container that sends nothing or null, and checks them again once it is sent', () => {
    const billing = new Group({ street: required(''), city: required('') });
    const form = new Group({ customer: required('Ada'), billing });
    expect(form.valid).toBe(false);

    billing.access = 'disabled-null';
    expect(billing.fields.street.effectiveAccess).toBe('disabled');
    expect(billing.fields.street.errors).toEqual([]);
    expect(form.valid).toBe(true);

    billing.access = 'editable';
    expect(billing.fields.street.valid).toBe(false);
    expect(form.valid).toBe(false);
  });

  it('checks a row once the list it joins sends it, and stops checking it once it does not', () => {
    const list = new List(required(''), { access: 'disabled' });

    list.push('');
    expect(list.get(0)!.valid).toBe(true);
    list.access = 'editable';
    expect(list.get(0)!.valid).toBe(false);
  });

  it('puts the value and the verdict back when a change of access is rolled back', () => {
    const form = new Group({ a: required('x'), b: required('y') });
    const seen = watchOwn(form, 'valid');

    transaction((tx) => {
      form.fields.b.access = 'disabled-null';
      expect(form.value).toEqual({ a: 'x', b: null });
      tx.rollback();
    });

    expect(form.fields.b.access).toBe('editable');
    expect(form.value).toEqual({ a: 'x', b: 'y' });
    expect(form.valid).toBe(true);
    expect(seen).toEqual([]);
  });

  it('carries a member into a binding with what it holds, whatever its access', () => {
    const form = new Group({
      a: new Field({ value: 1 }),
      b: new Field({ value: 2, access: 'disabled-null' }),
      c: new Field({ value: 3, access: 'disabled' }),
    });

    const bound = form.bind();

    expect(bound.fields.b.value).toBe(2);
    expect(bound.fields.c.value).toBe(3);
    expect(bound.value).toEqual({ a: 1, b: null });
  });
});

describe('A member taken out of a container that narrows its access', () => {
  it('is checked again once it is on its own', () => {
    const list = new List(required(''), { access: 'disabled' });
    list.push('');
    const row = list.get(0)!;
    expect(row.valid).toBe(true);

    list.remove(0);

    expect(row.effectiveAccess).toBe('editable');
    expect(row.valid).toBe(false);
  });

  it('is checked again once a group lets it go', () => {
    const group = new Group({ a: required('') }, { access: 'disabled-null' });

    const a = group.removeField('a')!;

    expect(a.valid).toBe(false);
  });
});

describe('An error written by hand into a member that sends nothing', () => {
  it('stays on the member and is not counted by the container', () => {
    const field = new Field({ value: 'x' });
    const form = new Group({ field });
    field.errors.push(new ValidationError('refused by the server'));
    field.validate();
    expect(form.valid).toBe(false);

    field.access = 'disabled';
    expect(field.valid).toBe(false);
    expect(form.valid).toBe(true);

    field.access = 'disabled-null';
    expect(form.valid).toBe(false);
  });
});

describe('Access in a list', () => {
  it('sends a disabled-null row as null and leaves a disabled row out', () => {
    const list = new List(new Field<string>(), { value: ['a', 'b', 'c'] });

    list.get(1)!.access = 'disabled-null';
    expect(list.value).toEqual(['a', null, 'c']);
    list.get(1)!.access = 'disabled';
    expect(list.value).toEqual(['a', 'c']);
    expect(list.fullValue).toEqual(['a', 'b', 'c']);
    expect(list.length).toBe(3);
  });

  it('checks a row over what it sends, and not at all where it sends nothing', () => {
    const list = new List(required(''), { value: ['a', ''] });
    expect(list.valid).toBe(false);

    list.get(1)!.access = 'disabled';
    expect(list.valid).toBe(true);
    list.get(1)!.access = 'disabled-null';
    expect(list.valid).toBe(false);
  });

  it('carries a row that sends nothing into a binding with what it holds', () => {
    const list = new List(new Field<string>(), { value: ['a', 'b'] });
    list.get(1)!.access = 'disabled';

    expect(list.bind().fullValue).toEqual(['a', 'b']);
  });
});

describe('Visibility', () => {
  it('changes neither what a form sends nor what it holds nor its verdict', () => {
    const form = new Group({ a: required('x'), b: required('') });
    const values = watchOwn(form, 'value');
    const contributions = watchOwn(form, 'contribution');

    form.fields.b.visibility = 'hidden';
    form.fields.a.visibility = 'suppress';
    form.fields.a.visibility = 'invisible';

    expect(form.value).toEqual({ a: 'x', b: '' });
    expect(form.fullValue).toEqual({ a: 'x', b: '' });
    expect(form.valid).toBe(false);
    expect(values).toEqual([]);
    expect(contributions).toEqual([]);
  });
});

describe('A disabled field', () => {
  it('takes a write, and stays out of what its group sends', () => {
    const form = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2, access: 'disabled' }) });

    form.value = { a: 10, b: 20 };

    expect(form.fields.b.value).toBe(20);
    expect(form.value).toEqual({ a: 10 });
  });

  it('takes a record whatever order the rules that enable it run in', () => {
    const kind = new Field({ value: 'text' });
    const text = new Field({ value: '' });
    const width = new Field({ value: 0, access: 'disabled' });
    const form = new Group({ kind, text, width });
    // the rule a form would carry: which members take part depends on the kind
    watchEffect(() => {
      const box = kind.value === 'box';
      width.access = box ? 'editable' : 'disabled';
      text.access = box ? 'disabled' : 'editable';
    });

    form.value = { kind: 'box', text: '', width: 40 };

    expect(width.value).toBe(40);
  });
});

describe('Patterns', () => {
  it('disables a group while every member is disabled, with one effect', async () => {
    const sub = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const form = new Group({ sub, name: new Field({ value: 'x' }) });
    watchEffect(() => {
      sub.access = Object.values(sub.fields).some((field) => field.enabled) ? 'editable' : 'disabled';
    });

    sub.fields.a.access = 'disabled';
    sub.fields.b.access = 'disabled';
    await nextTick();

    expect(sub.enabled).toBe(false);
    expect(form.value).toEqual({ name: 'x' });
  });

  it('sends a group as null while every member is disabled, with one effect', async () => {
    const sub = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const form = new Group({ sub, name: new Field({ value: 'x' }) });
    watchEffect(() => {
      sub.access = Object.values(sub.fields).some((field) => field.enabled) ? 'editable' : 'disabled-null';
    });

    sub.fields.a.access = 'disabled';
    sub.fields.b.access = 'disabled';
    await nextTick();

    expect(form.value).toEqual({ sub: null, name: 'x' });
  });
});

describe('One rule for every container', () => {
  it('leaves a disabled row out of a list value, and keeps it in fullValue', () => {
    const list = new List(new Field<string>(), { value: ['a', 'b', 'c'] });

    list.get(1)!.access = 'disabled';

    expect(list.value).toEqual(['a', 'c']);
    expect(list.fullValue).toEqual(['a', 'b', 'c']);
  });

  it('leaves a disabled row that is a container out, whatever it holds', () => {
    const list = new List(new Group({ a: new Field({ value: '' }) }), { value: [{ a: 'x' }, { a: 'y' }] });

    list.get(1)!.access = 'disabled';

    expect(list.value).toEqual([{ a: 'x' }]);
  });

  it('lets an element state what it contributes, and every container follows', () => {
    /** a field that is always sent, whatever its access */
    class AlwaysSent<T> extends Field<T> {
      protected serializesAs(): 'value' | 'null' | 'omit' {
        return 'value';
      }
    }
    const token = new AlwaysSent<string>({ value: 't' });
    const form = new Group({ token, name: new Field({ value: 'x' }) });
    const list = new List(new Field<string>(), { value: ['r'] });
    list.push(new AlwaysSent<string>({ value: 's' }));

    token.access = 'disabled';
    list.get(1)!.access = 'disabled-null';

    expect(form.value).toEqual({ token: 't', name: 'x' });
    expect(list.value).toEqual(['r', 's']);
  });
});

describe('What a change announces', () => {
  it('reports a change of access as a change of what is sent, never of what is held', () => {
    const form = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const values = watchOwn(form, 'value');
    const contributions = watchOwn(form, 'contribution');
    const memberContributions = watchOwn(form.fields.b, 'contribution');

    form.fields.b.access = 'disabled';
    form.fields.b.access = 'disabled-null';
    form.fields.b.access = 'editable';

    expect(values).toEqual([]);
    expect(contributions).toEqual([{ a: 1 }, { a: 1, b: null }, { a: 1, b: 2 }]);
    expect(memberContributions).toEqual([undefined, null, 2]);
  });

  it('reports a write into a disabled field as a change of what is held, never of what is sent', () => {
    const form = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2, access: 'disabled' }) });
    const values = watchOwn(form, 'value');
    const contributions = watchOwn(form, 'contribution');

    form.fields.b.value = 3;

    expect(values).toEqual([{ a: 1, b: 3 }]);
    expect(contributions).toEqual([]);
  });

  it('says nothing where the container sends the same value either way', () => {
    const sub = new Group({ a: new Field({ value: 1 }) }, { access: 'disabled' });
    const form = new Group({ sub, c: new Field({ value: 3 }) });
    const contributions = watchOwn(form, 'contribution');

    sub.fields.a.access = 'disabled';
    transaction(() => {
      form.fields.c.access = 'disabled';
      form.fields.c.access = 'editable';
    });

    expect(contributions).toEqual([]);
  });

  it('reaches every container above, through a nested one', () => {
    const inner = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const form = new Group({ inner });
    const seen = watchOwn(form, 'contribution');

    inner.fields.b.access = 'disabled';

    expect(seen).toEqual([{ inner: { a: 1 } }]);
  });
});

describe('An object a field holds', () => {
  it('is one value: a write into it announces nothing on the field or above it', () => {
    const tags = new Field<string[]>({ value: ['a'] });
    const form = new Group({ tags });
    const seenField = watchOwn(tags, 'value');
    const seenForm = watchOwn(form, 'value');

    tags.value.push('b');
    transaction(() => {
      tags.value.push('c');
    });

    expect(seenField).toEqual([]);
    expect(seenForm).toEqual([]);

    tags.value = [...tags.value, 'd'];
    expect(seenField).toEqual([['a', 'b', 'c', 'd']]);
  });
});
