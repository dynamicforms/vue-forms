import { computed, effectScope, EffectScope, nextTick, ref } from 'vue';

import { ContributionChangedAction, ListItemRemovedAction, ValueChangedAction } from '../actions';
import { Field } from '../field';
import { FieldBase } from '../field-base';
import { Group } from '../group';
import { List } from '../list';
import { installPlugin } from '../plugins';
import { tracking } from '../plugins/tracking';
import { transaction } from '../transaction';
import { Validators } from '../validators';
import { view } from '../view';

/** a validator that passes every value and counts its runs per element */
function countingValidator(counts: Map<FieldBase, number>) {
  return new Validators.Validator((_value, _old, field) => {
    counts.set(field, (counts.get(field) ?? 0) + 1);
    return null;
  });
}

function total(counts: Map<FieldBase, number>): number {
  let sum = 0;
  counts.forEach((n) => (sum += n));
  return sum;
}

describe('tracking plugin: array methods on a field value', () => {
  let uninstall: () => void;
  let scope: EffectScope;

  beforeEach(() => {
    uninstall = installPlugin(tracking);
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
    uninstall();
  });

  const source = () => Array.from({ length: 1000 }, (_, i) => (i * 7919) % 1000);

  function build() {
    const counts = new Map<FieldBase, number>();
    const changes: unknown[] = [];
    const field = new Field<number[]>({ value: source(), validators: [countingValidator(counts)] });
    field.registerAction(
      new ValueChangedAction((f, supr, newValue, oldValue) => {
        changes.push(newValue);
        return supr(f, newValue, oldValue);
      }),
    );
    counts.clear();
    return { field, counts, changes };
  }

  const calls: [string, (arr: any[]) => unknown][] = [
    ['push(x)', (arr) => arr.push(42)],
    ['pop()', (arr) => arr.pop()],
    ['shift()', (arr) => arr.shift()],
    ['unshift(x)', (arr) => arr.unshift(42)],
    ["splice(1, 2, 'a')", (arr) => arr.splice(1, 2, 'a')],
    ['sort()', (arr) => arr.sort()],
    ['reverse()', (arr) => arr.reverse()],
    ['fill(0)', (arr) => arr.fill(0)],
  ];

  it.each(calls)('%s runs the validator once and leaves the array as the native method does', (_name, call) => {
    const { field, counts } = build();
    const expected = source();
    const expectedResult = call(expected);

    const result = call(field.value);

    expect(total(counts)).toBe(1);
    expect([...field.value]).toEqual(expected);
    if (Array.isArray(expectedResult)) expect([...(result as unknown[])]).toEqual(expectedResult);
    else if (expectedResult !== expected) expect(result).toEqual(expectedResult);
  });

  it.each(calls)('%s fires ValueChangedAction once', (_name, call) => {
    const { field, changes } = build();
    call(field.value);
    expect(changes).toHaveLength(1);
  });

  it('an empty push() runs no validator and fires no ValueChangedAction', () => {
    const { field, counts, changes } = build();
    expect(field.value.push()).toBe(1000);
    expect(total(counts)).toBe(0);
    expect(changes).toHaveLength(0);
  });

  it('a transaction that reverses the array and throws restores the original array', () => {
    const { field } = build();
    expect(() =>
      transaction(() => {
        field.value.reverse();
        throw new Error('abort');
      }),
    ).toThrow('abort');
    expect([...field.value]).toEqual(source());
  });

  it('a computed over a kept reference to the array updates after push() and shift()', async () => {
    const { field } = build();
    const arr = field.value;
    const head = scope.run(() => computed(() => [arr.length, arr[0]]))!;
    expect(head.value).toEqual([1000, 0]);

    arr.push(5);
    await nextTick();
    expect(head.value).toEqual([1001, 0]);

    arr.shift();
    await nextTick();
    expect(head.value).toEqual([1000, source()[1]]);
  });
});

describe('validators over a field holding a Vue ref', () => {
  // [name, validator factory, plain value]: the field holding ref(value) gets the verdict of the plain value
  const cases: [string, () => Validators.Validator<any>, unknown][] = [
    ['Pattern (fails)', () => new Validators.Pattern(/^\d+$/), 'abc'],
    ['Pattern (passes)', () => new Validators.Pattern(/^\d+$/), '123'],
    ['InAllowedValues (fails)', () => new Validators.InAllowedValues(['a', 'b']), 'c'],
    ['InAllowedValues (passes)', () => new Validators.InAllowedValues(['a', 'b']), 'a'],
    ['MinValue (fails)', () => new Validators.MinValue(10), 5],
    ['MinValue (passes)', () => new Validators.MinValue(10), 15],
    ['MaxValue (fails)', () => new Validators.MaxValue(10), 15],
    ['MaxValue (passes)', () => new Validators.MaxValue(10), 5],
    ['ValueInRange (fails)', () => new Validators.ValueInRange(0, 10), 15],
    ['ValueInRange (passes)', () => new Validators.ValueInRange(0, 10), 5],
    ['MinLength (fails)', () => new Validators.MinLength(3), 'ab'],
    ['MinLength (passes)', () => new Validators.MinLength(3), 'abcd'],
    ['MaxLength (fails)', () => new Validators.MaxLength(20), 'a'.repeat(25)],
    ['MaxLength (passes)', () => new Validators.MaxLength(3), 'ab'],
    ['LengthInRange (fails)', () => new Validators.LengthInRange(2, 20), 'a'.repeat(25)],
    ['LengthInRange (passes)', () => new Validators.LengthInRange(2, 4), 'abc'],
  ];

  it.each(cases)('%s gives the verdict of the plain value', (_name, make, plain) => {
    const plainField = new Field<any>({ value: plain, validators: [make()] });
    const refField = new Field<any>({ value: ref(plain), validators: [make()] });
    expect(refField.valid).toBe(plainField.valid);
    expect(refField.errors.map((e) => e.code)).toEqual(plainField.errors.map((e) => e.code));
  });

  // a field unwraps a ref it is given, so the validator receives a Ref only where it is run with one: through
  // execute(), which every action has
  it.each(cases)('%s run with a Ref gives the verdict of the plain value', (_name, make, plain) => {
    const plainValidator = make();
    const refValidator = make();
    const plainField = new Field<any>({ value: null, validators: [plainValidator] });
    const refField = new Field<any>({ value: null, validators: [refValidator] });

    plainValidator.execute(plainField, () => null, plain, null);
    refValidator.execute(refField, () => null, ref(plain), null);

    expect(refField.errors.map((e) => e.code)).toEqual(plainField.errors.map((e) => e.code));
  });
});

describe('view of a list: removals', () => {
  function build() {
    const list = new List(new Group({ n: new Field<number>({ value: 0 }) }), {
      value: [0, 1, 2, 3, 4, 5].map((n) => ({ n })),
    });
    const removed: [number, number][] = [];
    list.registerAction(
      new ListItemRemovedAction((field, supr, item, index) => {
        removed.push([index, item.fields.n.value]);
        return supr(field, item, index);
      }),
    );
    return { list, rows: view(list), removed };
  }

  const ns = (list: List<any>) => list.items.map((row: any) => row.fields.n.value);

  it('pop() removes the last row, returns it and announces the last index', () => {
    const { list, rows, removed } = build();
    expect((rows.pop() as any).n).toBe(5);
    expect(ns(list)).toEqual([0, 1, 2, 3, 4]);
    expect(removed).toEqual([[5, 5]]);
  });

  it('shift() removes the first row, returns it and announces index 0', () => {
    const { list, rows, removed } = build();
    expect((rows.shift() as any).n).toBe(0);
    expect(ns(list)).toEqual([1, 2, 3, 4, 5]);
    expect(removed).toEqual([[0, 0]]);
  });

  it('splice(from, count) removes count rows, returns them and announces index from count times', () => {
    const { list, rows, removed } = build();
    expect(rows.splice(1, 3).map((r: any) => r.n)).toEqual([1, 2, 3]);
    expect(ns(list)).toEqual([0, 4, 5]);
    expect(removed).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
    ]);
  });

  it('length = n removes the rows from n on and announces index n for each of them', () => {
    const { list, rows, removed } = build();
    rows.length = 2;
    expect(ns(list)).toEqual([0, 1]);
    expect(removed).toEqual([
      [2, 2],
      [2, 3],
      [2, 4],
      [2, 5],
    ]);
  });
});

describe('bulk assignment to a list with a dependent field action', () => {
  const N = 300;
  const names = Array.from({ length: 8 }, (_, i) => `f${i}`);

  function template() {
    const fields: Record<string, Field<string>> = {};
    names.forEach((name) => (fields[name] = new Field<string>({ value: '' })));
    fields.f0.registerAction(
      new ValueChangedAction((f, supr, newValue, oldValue) => {
        (f.parent as Group).fields.f7.value = `${newValue}!`;
        return supr(f, newValue, oldValue);
      }),
    );
    return new Group(fields);
  }

  it('every row ends with f7 === f0 + "!", the list announces once and the container sees the final values', () => {
    const list = new List(template(), {
      value: Array.from({ length: N }, (_, i) => ({ f0: `old${i}`, f7: `old${i}!` })),
    });
    const root = new Group({ rows: list });
    const listChanges: unknown[] = [];
    const rootChanges: any[] = [];
    list.registerAction(
      new ValueChangedAction((f, supr, newValue, oldValue) => {
        listChanges.push(newValue);
        return supr(f, newValue, oldValue);
      }),
    );
    root.registerAction(
      new ValueChangedAction((f, supr, newValue, oldValue) => {
        rootChanges.push(newValue);
        return supr(f, newValue, oldValue);
      }),
    );

    list.value = Array.from({ length: N }, (_, i) => ({ f0: `new${i}`, f1: `x${i}` })) as any;

    const rows = list.items as readonly Group[];
    expect(rows).toHaveLength(N);
    rows.forEach((row, i) => {
      expect(row.fields.f0.value).toBe(`new${i}`);
      expect(row.fields.f7.value).toBe(`new${i}!`);
    });
    expect(listChanges).toHaveLength(1);
    expect(rootChanges.length).toBeGreaterThan(0);
    const last = rootChanges[rootChanges.length - 1];
    last.rows.forEach((row: any, i: number) => expect(row.f7).toBe(`new${i}!`));
  });
});

describe('access of a list row', () => {
  function build() {
    const list = new List(new Group({ a: new Field<number>({ value: 0 }), b: new Field<string>({ value: '' }) }), {
      value: [0, 1, 2].map((a) => ({ a, b: `b${a}` })),
    });
    const root = new Group({ rows: list, title: new Field<string>({ value: 't' }) });
    const valueChanges: unknown[] = [];
    const contributionChanges: unknown[] = [];
    root.registerAction(
      new ValueChangedAction((f, supr, newValue, oldValue) => {
        valueChanges.push(newValue);
        return supr(f, newValue, oldValue);
      }),
    );
    root.registerAction(
      new ContributionChangedAction((f, supr, newValue, oldValue) => {
        contributionChanges.push(newValue);
        return supr(f, newValue, oldValue);
      }),
    );
    return { list, root, valueChanges, contributionChanges };
  }

  it("'readonly' and back keeps value and fullValue and announces nothing on the root", () => {
    const { list, root, valueChanges, contributionChanges } = build();
    const value = root.value;
    const fullValue = root.fullValue;

    list.get(1)!.access = 'readonly';
    expect(root.value).toEqual(value);
    expect(root.fullValue).toEqual(fullValue);

    list.get(1)!.access = 'editable';
    expect(root.value).toEqual(value);
    expect(root.fullValue).toEqual(fullValue);

    expect(valueChanges).toHaveLength(0);
    expect(contributionChanges).toHaveLength(0);
  });

  it("'disabled' omits the row from value and fires ContributionChangedAction once", () => {
    const { list, root, contributionChanges } = build();
    const fullValue = root.fullValue;

    list.get(1)!.access = 'disabled';

    expect(root.value.rows).toEqual([
      { a: 0, b: 'b0' },
      { a: 2, b: 'b2' },
    ]);
    expect(root.fullValue).toEqual(fullValue);
    expect(contributionChanges).toHaveLength(1);
  });
});

describe('building list rows with Required validators', () => {
  const names = Array.from({ length: 8 }, (_, i) => `f${i}`);

  it('runs each validator once per row and reports the right errors', () => {
    const counts = new Map<FieldBase, number>();
    const fields: Record<string, Field<string>> = {};
    names.forEach(
      (name) =>
        (fields[name] = new Field<string>({
          value: '',
          validators: [new Validators.Required(), countingValidator(counts)],
        })),
    );
    const templ = new Group(fields);
    const templateCounts = new Map(counts);

    const data = Array.from({ length: 20 }, (_, i) => {
      const row: Record<string, string> = {};
      names.forEach((name, j) => (row[name] = j === i % 8 ? '' : `${name}-${i}`));
      return row;
    });
    const list = new List(templ, { value: data });

    const rows = list.items as readonly Group[];
    expect(rows).toHaveLength(20);
    rows.forEach((row, i) => {
      names.forEach((name, j) => {
        const field = row.fields[name];
        expect(counts.get(field)).toBe(1);
        expect(field.errors.map((e) => e.code)).toEqual(j === i % 8 ? ['vue-forms.required'] : []);
      });
      expect(row.valid).toBe(false);
    });
    expect(list.valid).toBe(false);
    // the template's own fields ran at their construction and not again
    names.forEach((name) => expect(counts.get(templ.fields[name])).toBe(templateCounts.get(templ.fields[name])));
  });
});
