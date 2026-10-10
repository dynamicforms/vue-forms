import { watch } from 'vue';

import {
  AccessChangedAction,
  ConditionalVisibilityAction,
  EnabledChangedAction,
  FieldActionBase,
  Field,
  Group,
  List,
  Operator,
  Statement,
  transaction,
  Validators,
  ValueChangedAction,
  view,
  VisibilityChangedAction,
  VisibilityChangingAction,
} from '../index';

describe('a construction parameter named like a member', () => {
  it('becomes an extended property where it names a method, and leaves the method as it is', () => {
    const field = new Field({ value: 1, validate: true, bind: 'x' } as any);

    expect(field.extra).toEqual({ validate: true, bind: 'x' });
    expect(typeof field.validate).toBe('function');
    expect(() => field.validate()).not.toThrow();
  });

  it('still throws for a getter-only accessor', () => {
    expect(() => new Field({ value: 1, valid: false } as any)).toThrow(TypeError);
  });
});

describe('Pattern with a g or y flag', () => {
  it('gives the same result for every value, and leaves the caller expression as it is', () => {
    const pattern = /^\d+$/g;
    const field = new Field({ value: '12', validators: [new Validators.Pattern(pattern)] });
    const seen: boolean[] = [];
    for (const value of ['34', '56', '78', 'x', '90']) {
      field.value = value;
      seen.push(field.valid);
    }

    expect(seen).toEqual([true, true, true, false, true]);
    expect(pattern.lastIndex).toBe(0);
  });
});

describe('a VisibilityChangingAction that returns the current visibility', () => {
  it('refuses the write: nothing is written and nothing is announced', () => {
    const seen: string[] = [];
    const field = new Field({
      value: 1,
      actions: [
        new VisibilityChangingAction((f, s, newValue, oldValue) => oldValue),
        new VisibilityChangedAction((f, s, newValue, oldValue) => seen.push(`${oldValue}->${newValue}`)),
      ],
    });

    field.visibility = 'hidden';

    expect(field.visibility).toBe('full');
    expect(seen).toEqual([]);
  });
});

describe('a conditional action registered on several elements of one record', () => {
  it('applies the current result to an element registered after it was applied to another', () => {
    const source = new Field({ value: 1 });
    const a = new Field({ value: 0 });
    const b = new Field({ value: 0 });
    new Group({ source, a, b });
    const rule = new ConditionalVisibilityAction(new Statement(source, Operator.EQUALS, 2), 'full', 'suppress');

    a.registerAction(rule);
    b.registerAction(rule);
    expect([a.visibility, b.visibility]).toEqual(['suppress', 'suppress']);

    source.value = 2;
    expect([a.visibility, b.visibility]).toEqual(['full', 'full']);
  });
});

describe('rebind with a value that leaves a member out', () => {
  it('puts the member back to its own baseline, so the reset recipe restores a disabled member', () => {
    const form = new Group({ name: new Field({ value: 'n' }), secret: new Field({ value: 's', access: 'disabled' }) });
    form.fields.name.value = 'm';
    form.fields.secret.value = 't';

    form.rebind(form.originalValue);

    expect(form.fields.name.value).toBe('n');
    expect(form.fields.secret.value).toBe('s');
    expect(form.fields.secret.access).toBe('disabled');
    expect(form.isChanged).toBe(false);
  });

  it('takes the item template member baseline for a list row, not the previous record', () => {
    const list = new List(new Group({ a: new Field({ value: 0 }), b: new Field({ value: 7 }) }));
    list.value = [{ a: 1, b: 2 }];

    list.value = [{ a: 3 }];

    expect(list.get(0)!.fields.b.value).toBe(7);
  });
});

describe('a write of NaN over NaN', () => {
  it('is not a change', () => {
    let changes = 0;
    const field = new Field({
      value: NaN,
      actions: [new ValueChangedAction((f, s, n, o) => (changes++, s(f, n, o)))],
    });

    field.value = NaN;
    field.value = NaN;

    expect(changes).toBe(0);
  });
});

describe('access, enabled and visibility events', () => {
  it('fire at the commit, once, with the net change', () => {
    const seen: string[] = [];
    const field = new Field({
      value: 1,
      actions: [
        new AccessChangedAction((f, s, n, o) => (seen.push(`access ${o}->${n}`), s(f, n, o))),
        new EnabledChangedAction((f, s, n, o) => (seen.push(`enabled ${o}->${n}`), s(f, n, o))),
        new VisibilityChangedAction((f, s, n, o) => (seen.push(`visibility ${o}->${n}`), s(f, n, o))),
      ],
    });

    transaction(() => {
      field.access = 'disabled';
      field.visibility = 'hidden';
      expect(seen).toEqual([]);
      field.access = 'readonly';
      field.visibility = 'full';
    });

    expect(seen).toEqual(['access editable->readonly', 'enabled true->false']);
  });

  it('do not fire for a change a transaction undoes or rolls back', () => {
    const seen: string[] = [];
    const field = new Field({
      value: 1,
      actions: [new AccessChangedAction((f, s, n, o) => (seen.push(`${o}->${n}`), s(f, n, o)))],
    });

    transaction(() => {
      field.access = 'disabled';
      field.access = 'editable';
    });
    transaction((tx) => {
      field.access = 'disabled';
      tx.rollback();
    });

    expect(seen).toEqual([]);
    expect(field.access).toBe('editable');
  });
});

describe('a list whose rows are held outside Vue reactivity', () => {
  it('still re-runs readers of length, get() and items when a row is inserted or removed', () => {
    const list = new List(new Group({ a: new Field({ value: 0 }) }));
    list.push({ a: 1 });
    const seen: string[] = [];
    watch(
      () => [list.length, list.get(0)?.fields.a.value, list.items.length].join(','),
      (state) => seen.push(state),
      { flush: 'sync' },
    );

    list.insert({ a: 5 }, 0);
    list.remove(0);

    expect(seen).toEqual(['2,5,2', '1,1,1']);
  });

  it('restores the rows on rollback', () => {
    const list = new List(new Group({ a: new Field({ value: 0 }) }));
    list.push({ a: 1 });

    transaction((tx) => {
      list.insert({ a: 5 }, 0);
      tx.rollback();
    });

    expect(list.value).toEqual([{ a: 1 }]);
    expect(view(list).length).toBe(1);
  });
});

describe('value validators on an empty or a non-comparable value', () => {
  const valid = (value: unknown, validator: Validators.Validator) =>
    new Field({ value, validators: [validator] }).valid;

  it('pass an empty value: refusing it is Required', () => {
    for (const empty of [null, undefined, '', []]) {
      expect(valid(empty, new Validators.MinValue(5))).toBe(true);
      expect(valid(empty, new Validators.ValueInRange(1, 5))).toBe(true);
      expect(valid(empty, new Validators.MinLength(2))).toBe(true);
      expect(valid(empty, new Validators.Pattern(/^\d+$/))).toBe(true);
      expect(valid(empty, new Validators.InAllowedValues(['a']))).toBe(true);
    }
  });

  it('refuse a value that cannot be compared with the bound', () => {
    expect(valid(NaN, new Validators.MinValue(5))).toBe(false);
    expect(valid('abc', new Validators.MinValue(5))).toBe(false);
    expect(valid(new Date('x'), new Validators.MaxValue(new Date()))).toBe(false);
  });

  it('compare numbers, strings and dates', () => {
    expect(valid(6, new Validators.MinValue(5))).toBe(true);
    expect(valid('b', new Validators.MinValue('a'))).toBe(true);
    expect(valid(new Date(2020, 0, 1), new Validators.MaxValue(new Date(2021, 0, 1)))).toBe(true);
    expect(valid(new Date(2022, 0, 1), new Validators.MaxValue(new Date(2021, 0, 1)))).toBe(false);
  });
});

describe('Required and the length validators on a Map, a Set and an object without a prototype', () => {
  it('measure a Map and a Set by size, and a null-prototype object by its keys', () => {
    const required = (value: unknown) => new Field({ value, validators: [new Validators.Required()] }).valid;

    expect(required(new Map())).toBe(false);
    expect(required(new Set([1]))).toBe(true);
    expect(required(Object.create(null))).toBe(false);
    expect(new Field({ value: new Set([1, 2]), validators: [new Validators.MaxLength(1)] }).valid).toBe(false);
  });
});

describe('a value that contains a placeholder', () => {
  it('is substituted once, not substituted again by a later param', () => {
    const field = new Field({
      value: '{minLength}',
      validators: [new Validators.MinLength(20, { code: 'custom', detail: 'Got {newValue}, need {minLength}' })],
    });

    expect(field.errors[0].detail).toBe('Got {minLength}, need 20');
  });
});

describe('a list row that was not built from the item template', () => {
  it('is replaced by a value assignment, not reset through the template', () => {
    const list = new List(new Group({ a: new Field({ value: 0 }) }));
    const own = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    list.push(own);

    list.value = [{ a: 5 }];

    expect(list.get(0)).not.toBe(own);
    expect(list.value).toEqual([{ a: 5 }]);
    expect(own.fields.b.value).toBe(2);
  });
});

describe('an action class without a classIdentifier', () => {
  it('is refused at registration and leaves the element working', () => {
    class Unnamed extends FieldActionBase {}
    const field = new Field({ value: 1 });

    expect(() => field.registerAction(new Unnamed(() => null))).toThrow('classIdentifier must be declared');
    field.value = 2;
    expect(field.value).toBe(2);
  });
});
