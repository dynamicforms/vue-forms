import { nextTick, ref, watchEffect } from 'vue';

import { ValidChangedAction, ValueChangedAction } from './actions';
import DisplayMode from './display-mode';
import { Field } from './field';
import { FieldBase } from './field-base';
import { Group } from './group';
import { List } from './list';
import { transaction } from './transaction';
import { Validators } from './validators';

/** every transition of `element`'s own announcements of one kind, newest last */
function watchOwn(element: FieldBase, kind: 'value' | 'valid'): unknown[] {
  const seen: unknown[] = [];
  const Action = kind === 'value' ? ValueChangedAction : ValidChangedAction;
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
    const group = new Group({ a: new Field({ value: 1, enabled: false }) });
    const list = new List(new Field<string>());

    expect(group.value).toEqual({});
    expect(list.value).toEqual([]);
    expect(Object.isFrozen(group.value)).toBe(true);
    expect(Object.isFrozen(list.value)).toBe(true);
  });

  it('is left out of its parent where it is disabled and empty, and kept where it is disabled and not', () => {
    const sub = new Group({ a: new Field({ value: 1, enabled: false }) }, { enabled: false });
    const form = new Group({ sub, name: new Field({ value: 'x' }) });

    expect(form.value).toEqual({ name: 'x' });
    sub.fields.a.enabled = true;
    expect(form.value).toEqual({ sub: { a: 1 }, name: 'x' });
  });

  it('empties its members on value = null rather than becoming null', () => {
    const group = new Group({ a: new Field({ value: 'x' }), rows: new List(new Field<string>(), { value: ['r'] }) });

    group.value = null;

    expect(group.value).toEqual({ a: null, rows: [] });
  });
});

describe('Visibility in a group', () => {
  it('sends a hidden member as null and keeps what it holds for when it is shown again', () => {
    const club = new Group({ name: new Field({ value: 'NK' }) });
    const form = new Group({ club, member: new Field({ value: 'Ada' }) });

    club.visibility = DisplayMode.HIDDEN;
    expect(form.value).toEqual({ club: null, member: 'Ada' });
    expect(form.fullValue).toEqual({ club: null, member: 'Ada' });
    expect(club.value).toEqual({ name: 'NK' });

    club.visibility = DisplayMode.FULL;
    expect(form.value).toEqual({ club: { name: 'NK' }, member: 'Ada' });
  });

  it('leaves a suppressed member out of value and fullValue alike', () => {
    const form = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });

    form.fields.b.visibility = DisplayMode.SUPPRESS;

    expect(form.value).toEqual({ a: 1 });
    expect(form.fullValue).toEqual({ a: 1 });
    expect(form.fields.b.value).toBe(2);
  });

  it('leaves a hidden member out where it is also disabled: enabled decides first whether it is sent', () => {
    const form = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });

    form.fields.b.visibility = DisplayMode.HIDDEN;
    form.fields.b.enabled = false;

    expect(form.value).toEqual({ a: 1 });
    expect(form.fullValue).toEqual({ a: 1, b: null });
  });

  it('announces the change of the parent value a change of visibility makes', () => {
    const form = new Group({ a: new Field({ value: 1 }) });
    const seen = watchOwn(form, 'value');

    form.fields.a.visibility = DisplayMode.HIDDEN;
    form.fields.a.visibility = DisplayMode.SUPPRESS;
    form.fields.a.visibility = DisplayMode.FULL;

    expect(seen).toEqual([{ a: null }, {}, { a: 1 }]);
  });

  it('does not count a hidden or suppressed member towards validity', () => {
    const form = new Group({ a: required('x'), b: required('') });
    const seen = watchOwn(form, 'valid');
    expect(form.valid).toBe(false);

    form.fields.b.visibility = DisplayMode.HIDDEN;
    expect(form.valid).toBe(true);
    form.fields.b.visibility = DisplayMode.SUPPRESS;
    expect(form.valid).toBe(true);
    // a member that turns valid while it is not counted moves nothing, and counts again once it is shown
    form.fields.b.value = 'y';
    form.fields.b.value = '';
    form.fields.b.visibility = DisplayMode.FULL;
    expect(form.valid).toBe(false);

    expect(seen).toEqual([true, false]);
  });

  it('puts the value and the tally back when a change of visibility is rolled back', () => {
    const form = new Group({ a: required('x'), b: required('') });
    const seen = watchOwn(form, 'valid');

    transaction((tx) => {
      form.fields.b.visibility = DisplayMode.HIDDEN;
      expect(form.value).toEqual({ a: 'x', b: null });
      tx.rollback();
    });

    expect(form.fields.b.visibility).toBe(DisplayMode.FULL);
    expect(form.value).toEqual({ a: 'x', b: '' });
    expect(form.valid).toBe(false);
    form.fields.b.value = 'y';
    expect(seen).toEqual([true]);
  });

  it('carries a hidden or suppressed member into a binding with what it holds', () => {
    const form = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }), c: new Field({ value: 3 }) });
    form.fields.b.visibility = DisplayMode.HIDDEN;
    form.fields.c.visibility = DisplayMode.SUPPRESS;

    const bound = form.bind();

    expect(bound.fields.b.value).toBe(2);
    expect(bound.fields.c.value).toBe(3);
    expect(bound.value).toEqual({ a: 1, b: null });
  });
});

describe('Visibility in a list', () => {
  it('sends a hidden row as null and leaves a suppressed row out', () => {
    const list = new List(new Field<string>(), { value: ['a', 'b', 'c'] });

    list.get(1)!.visibility = DisplayMode.HIDDEN;
    expect(list.value).toEqual(['a', null, 'c']);
    list.get(1)!.visibility = DisplayMode.SUPPRESS;
    expect(list.value).toEqual(['a', 'c']);
    expect(list.fullValue).toEqual(['a', 'c']);
    expect(list.length).toBe(3);
  });

  it('does not count a hidden row towards validity', () => {
    const list = new List(required(''), { value: ['a', ''] });
    expect(list.valid).toBe(false);

    list.get(1)!.visibility = DisplayMode.HIDDEN;
    expect(list.valid).toBe(true);
  });

  it('carries a hidden row into a binding with what it holds', () => {
    const list = new List(new Field<string>(), { value: ['a', 'b'] });
    list.get(1)!.visibility = DisplayMode.SUPPRESS;

    expect(list.bind().length).toBe(2);
  });
});

describe('A disabled field', () => {
  it('takes a write, and stays out of what its group sends', () => {
    const form = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2, enabled: false }) });

    form.value = { a: 10, b: 20 };

    expect(form.fields.b.value).toBe(20);
    expect(form.value).toEqual({ a: 10 });
  });

  it('takes a record whatever order the rules that enable it run in', () => {
    const kind = new Field({ value: 'text' });
    const text = new Field({ value: '' });
    const width = new Field({ value: 0, enabled: false });
    const form = new Group({ kind, text, width });
    // the rule a form would carry: which members take part depends on the kind
    watchEffect(() => {
      const box = kind.value === 'box';
      width.enabled = box;
      text.enabled = !box;
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
      sub.enabled = Object.values(sub.fields).some((field) => field.enabled);
    });

    sub.fields.a.enabled = false;
    sub.fields.b.enabled = false;
    await nextTick();

    expect(sub.enabled).toBe(false);
    expect(form.value).toEqual({ name: 'x' });
  });

  it('sends a group as null while every member is disabled, with one effect', async () => {
    const sub = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const form = new Group({ sub, name: new Field({ value: 'x' }) });
    watchEffect(() => {
      const any = Object.values(sub.fields).some((field) => field.enabled);
      sub.visibility = any ? DisplayMode.FULL : DisplayMode.HIDDEN;
    });

    sub.fields.a.enabled = false;
    sub.fields.b.enabled = false;
    await nextTick();

    expect(form.value).toEqual({ sub: null, name: 'x' });
  });
});

describe('The recipes in the null and empty values guide', () => {
  it('suppresses the fields that do not apply to a type, and brings them back as they were', async () => {
    const form = new Group({
      kind: new Field({ value: 'text' }),
      text: new Field({ value: 'hello' }),
      src: new Field({ value: '' }),
    });
    watchEffect(() => {
      const image = form.fields.kind.value === 'image';
      form.fields.src.visibility = image ? DisplayMode.FULL : DisplayMode.SUPPRESS;
      form.fields.text.visibility = image ? DisplayMode.SUPPRESS : DisplayMode.FULL;
    });

    expect(form.value).toEqual({ kind: 'text', text: 'hello' });
    form.fields.kind.value = 'image';
    await nextTick();
    expect(form.value).toEqual({ kind: 'image', src: '' });
    form.fields.kind.value = 'text';
    await nextTick();
    expect(form.value).toEqual({ kind: 'text', text: 'hello' });
  });

  it('sends an optional section as null while it is off, keeps what it holds, and does not count it', async () => {
    const club = new Group({ name: required(''), city: new Field({ value: '' }) });
    const form = new Group({ member: new Field({ value: 'Ada' }), club });
    const hasClub = ref(false);
    watchEffect(() => {
      club.visibility = hasClub.value ? DisplayMode.FULL : DisplayMode.HIDDEN;
    });

    expect(form.value).toEqual({ member: 'Ada', club: null });
    expect(form.valid).toBe(true);
    expect(form.fullValue.club).toBeNull();
    club.fields.name.value = 'NK';
    expect(club.fullValue).toEqual({ name: 'NK', city: '' });

    hasClub.value = true;
    await nextTick();
    expect(form.value).toEqual({ member: 'Ada', club: { name: 'NK', city: '' } });
  });

  it('loads a record without touching visibility, and follows the data where the rule says so', async () => {
    const club = new Group({ name: new Field({ value: 'NK' }) });
    const form = new Group({ member: new Field({ value: '' }), club });
    const hasClub = ref(true);
    watchEffect(() => {
      club.visibility = hasClub.value ? DisplayMode.FULL : DisplayMode.HIDDEN;
    });

    const record = { member: 'Grace', club: null };
    form.value = record;
    expect(club.visibility).toBe(DisplayMode.FULL);
    expect(form.value).toEqual({ member: 'Grace', club: { name: null } });

    hasClub.value = record.club != null;
    await nextTick();
    expect(form.value).toEqual({ member: 'Grace', club: null });
  });

  it('clears a form with rebind(null)', () => {
    const form = new Group({ name: new Field<string | null>({ value: 'x' }), rows: new List(new Field<string>()) });
    form.fields.rows.push('r');

    form.rebind(null);

    expect(form.value).toEqual({ name: null, rows: [] });
    expect(form.isChanged).toBe(false);
  });
});

describe('One rule for every container', () => {
  it('leaves a disabled row out of a list value, and keeps it in fullValue', () => {
    const list = new List(new Field<string>(), { value: ['a', 'b', 'c'] });

    list.get(1)!.enabled = false;

    expect(list.value).toEqual(['a', 'c']);
    expect(list.fullValue).toEqual(['a', 'b', 'c']);
  });

  it('keeps a disabled row that is a container while what it composes is not empty', () => {
    const list = new List(new Group({ a: new Field({ value: '' }) }), { value: [{ a: 'x' }, { a: 'y' }] });
    const row = list.get(1)!;

    row.enabled = false;
    expect(list.value).toEqual([{ a: 'x' }, { a: 'y' }]);
    row.fields.a.enabled = false;
    expect(list.value).toEqual([{ a: 'x' }]);
  });

  it('lets an element state what it contributes, and every container follows', () => {
    /** a field that is always sent, whatever its visibility */
    class AlwaysSent<T> extends Field<T> {
      protected serializesAs(): 'value' | 'null' | 'omit' {
        return 'value';
      }
    }
    const token = new AlwaysSent<string>({ value: '', validators: [new Validators.Required()] });
    const form = new Group({ token, name: new Field({ value: 'x' }) });
    const list = new List(new Field<string>(), { value: ['r'] });
    list.push(new AlwaysSent<string>({ value: 's' }));

    token.visibility = DisplayMode.SUPPRESS;
    list.get(1)!.visibility = DisplayMode.HIDDEN;

    expect(form.value).toEqual({ token: '', name: 'x' });
    expect(form.fullValue).toEqual({ token: '', name: 'x' });
    // it is counted, since what it contributes is its own value
    expect(form.valid).toBe(false);
    expect(list.value).toEqual(['r', 's']);
  });
});
