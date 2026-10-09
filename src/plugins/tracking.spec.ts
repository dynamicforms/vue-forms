import { vi } from 'vitest';
import { computed, reactive, toRaw, watch } from 'vue';

import {
  Action,
  Field,
  Group,
  installPlugin,
  transaction,
  ValidationError,
  Validators,
  ValueChangedAction,
} from '../index';

import { setTrackingWarnings, TrackedDate, TrackedMap, tracking, untracked } from './tracking';

let uninstall: () => void;
beforeEach(() => {
  uninstall = installPlugin(tracking);
});
afterEach(() => {
  uninstall();
  setTrackingWarnings(true);
  vi.restoreAllMocks();
});

function recorder(field: Field) {
  const seen: [unknown, unknown][] = [];
  field.registerAction(
    new ValueChangedAction((f, supr, newValue, oldValue) => {
      seen.push([JSON.parse(JSON.stringify(newValue)), JSON.parse(JSON.stringify(oldValue))]);
      return supr(f, newValue, oldValue);
    }),
  );
  return seen;
}

describe('a write into a plain object a field holds', () => {
  it('is a change: announced with the old value, validated, and part of isChanged', () => {
    const field = new Field({
      value: { city: 'Ljubljana', zip: '' },
      validators: [
        new Validators.Validator((value: any) =>
          value?.zip ? null : [new ValidationError('zip', {}, 'Enter the postcode')],
        ),
      ],
    });
    const seen = recorder(field);
    expect(field.valid).toBe(false);

    field.value.city = 'Bled';
    field.value.zip = '4260';

    expect(seen).toEqual([
      [
        { city: 'Bled', zip: '' },
        { city: 'Ljubljana', zip: '' },
      ],
      [
        { city: 'Bled', zip: '4260' },
        { city: 'Bled', zip: '' },
      ],
    ]);
    expect(field.valid).toBe(true);
    expect(field.isChanged).toBe(true);
    expect(field.originalValue).toEqual({ city: 'Ljubljana', zip: '' });
  });

  it('is put back by rebind(originalValue) and by a rollback', () => {
    const field = new Field({ value: { city: 'Ljubljana', tags: ['a'] as string[] } });
    field.value.city = 'Bled';
    field.rebind(field.originalValue);
    expect(field.value).toEqual({ city: 'Ljubljana', tags: ['a'] });

    transaction((tx) => {
      field.value.city = 'Kranj';
      field.value.tags.push('b', 'c');
      delete (field.value as any).city;
      field.value.tags.length = 0;
      tx.rollback();
    });
    expect(field.value).toEqual({ city: 'Ljubljana', tags: ['a'] });
    expect(field.isChanged).toBe(false);
  });

  it('is one change for one array method, and none for a write of the same value', () => {
    const field = new Field({ value: [3, 1, 2] });
    const seen = recorder(field);

    field.value.push(4);
    field.value.sort();
    field.value[0] = 1;

    expect(seen).toEqual([
      [
        [3, 1, 2, 4],
        [3, 1, 2],
      ],
      [
        [1, 2, 3, 4],
        [3, 1, 2, 4],
      ],
    ]);
  });

  it('re-runs what read the value', () => {
    const field = new Field({ value: { address: { city: 'Ljubljana' } } });
    const city = computed(() => field.value.address.city);
    expect(city.value).toBe('Ljubljana');

    field.value.address.city = 'Bled';

    expect(city.value).toBe('Bled');
  });
});

describe('the value a field holds', () => {
  it("is a copy: the reference the application kept is not the field's", () => {
    const address = { city: 'Ljubljana' };
    const field = new Field({ value: address });

    address.city = 'Bled';

    expect(field.value.city).toBe('Ljubljana');
    expect(field.isChanged).toBe(false);
  });

  it('keeps a row read from it as that row when the array is reordered', () => {
    const field = new Field({ value: [{ name: 'b' }, { name: 'a' }] });
    const row = field.value[1];

    field.value.sort((x, y) => x.name.localeCompare(y.name));
    row.name = 'c';

    expect(field.value).toEqual([{ name: 'c' }, { name: 'b' }]);
  });

  it('copies a value assigned from another field', () => {
    const a = new Field({ value: { n: 1 } });
    const b = new Field({ value: a.value });

    b.value.n = 2;

    expect(a.value.n).toBe(1);
  });
});

describe('Map, Set and Date', () => {
  it('are held as tracked subclasses whose mutating methods are changes', () => {
    const field = new Field({
      value: { tags: new Set(['a']), scores: new Map([['ada', { points: 1 }]]), when: new Date(2020, 0, 1) },
    });
    expect(field.value.scores).toBeInstanceOf(TrackedMap);
    expect(field.value.when).toBeInstanceOf(TrackedDate);
    const seen = recorder(field);

    field.value.tags.add('b');
    field.value.scores.get('ada')!.points = 2;
    field.value.scores.set('grace', { points: 3 });
    field.value.when.setFullYear(2021);
    field.value.when.setFullYear(2021);

    expect(seen).toHaveLength(4);
    expect([...field.value.tags]).toEqual(['a', 'b']);
    expect(field.value.scores.get('ada')).toEqual({ points: 2 });
    expect(field.value.when.getFullYear()).toBe(2021);
    expect(field.originalValue.when.getFullYear()).toBe(2020);
    expect(field.isChanged).toBe(true);
  });

  it('are restored by a rollback', () => {
    const field = new Field({
      value: { tags: new Set(['a']), scores: new Map([['ada', 1]]), when: new Date(2020, 0, 1) },
    });
    transaction((tx) => {
      field.value.tags.clear();
      field.value.scores.delete('ada');
      field.value.scores.set('grace', 2);
      field.value.when.setMonth(5);
      tx.rollback();
    });

    expect([...field.value.tags]).toEqual(['a']);
    expect([...field.value.scores]).toEqual([['ada', 1]]);
    expect(field.value.when.getMonth()).toBe(0);
    expect(field.isChanged).toBe(false);
  });

  it('re-run what read them', () => {
    const field = new Field({ value: { scores: new Map([['ada', 1]]), when: new Date(2020, 0, 1) } });
    const ada = computed(() => field.value.scores.get('ada'));
    const year = computed(() => field.value.when.getFullYear());
    expect([ada.value, year.value]).toEqual([1, 2020]);

    field.value.scores.set('ada', 5);
    field.value.when.setFullYear(2030);

    expect([ada.value, year.value]).toEqual([5, 2030]);
  });
});

describe('a container with a tracked member', () => {
  it('reports the write as a change of its value and of isChanged', () => {
    const form = new Group({ address: new Field({ value: { city: 'Ljubljana' } }) });
    const seen: unknown[] = [];
    watch(
      () => form.value,
      (value) => seen.push(JSON.parse(JSON.stringify(value))),
      { flush: 'sync' },
    );

    form.fields.address.value.city = 'Bled';

    expect(form.isChanged).toBe(true);
    expect(seen).toEqual([{ address: { city: 'Bled' } }]);
  });
});

describe('a value the plugin does not track', () => {
  class Point {
    constructor(public x = 0) {}
  }

  it('is a class instance held as it is, with one development warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const point = new Point();
    const field = new Field({ value: { point } });

    field.value = { point };

    expect(toRaw(field.value.point)).toBe(point);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Point');
  });

  it('gives no warning when marked untracked, or with warnings turned off', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const marked = untracked({ x: 1 });
    const field = new Field({ value: { marked, point: untracked(new Point()) } });
    setTrackingWarnings(false);
    field.value = { marked, point: new Point() };

    expect(toRaw(field.value.marked)).toBe(marked);
    expect(warn).not.toHaveBeenCalled();
  });

  it("is an Action's value, which keeps its identity", () => {
    const value = reactive({ label: 'Save' });
    const action = new Action({ value });

    expect(action.value).toBe(value);
  });

  it('is a value stored before the plugin was installed or after it was uninstalled', () => {
    uninstall();
    const field = new Field({ value: { n: 1 } });
    const seen = recorder(field);

    field.value.n = 2;

    expect(seen).toEqual([]);
  });
});

describe('edge cases of the copy and the tracked collections', () => {
  it('copies a cycle and an accessor, and keeps an object that appears twice as one object', () => {
    const shared = { n: 1 };
    const source: any = {
      a: shared,
      b: shared,
      get double() {
        return this.a.n * 2;
      },
    };
    source.self = source;
    const field = new Field({ value: source });

    expect(field.value.self.a).toBe(field.value.a);
    expect(field.value.a).toBe(field.value.b);
    field.value.a.n = 5;
    expect(field.value.double).toBe(10);
    expect(field.originalValue.self).toBe(field.originalValue);
    expect(field.originalValue.a.n).toBe(1);
  });

  it('treats a Set delete, a Set add of a present item and a Map set of the same value as what they are', () => {
    const field = new Field({ value: { tags: new Set(['a', 'b']), scores: new Map([['ada', 1]]) } });
    const seen = recorder(field);

    field.value.tags.add('a');
    field.value.scores.set('ada', 1);
    expect(seen).toEqual([]);

    field.value.tags.delete('a');
    expect([...field.value.tags]).toEqual(['b']);
    transaction((tx) => {
      field.value.tags.add('c');
      field.value.scores.set('ada', 2);
      field.value.scores.clear();
      field.value.tags.delete('b');
      tx.rollback();
    });
    expect([...field.value.tags]).toEqual(['b']);
    expect([...field.value.scores]).toEqual([['ada', 1]]);
    expect(seen).toHaveLength(1);
  });

  it('records every Date setter as a change and puts it back on rollback', () => {
    const when = new Date(Date.UTC(2020, 0, 15, 10, 20, 30, 400));
    const field = new Field({ value: when });
    const date = field.value as Date;
    const calls: [keyof Date, number][] = [
      ['setMilliseconds', 1],
      ['setUTCMilliseconds', 2],
      ['setSeconds', 3],
      ['setUTCSeconds', 4],
      ['setMinutes', 5],
      ['setUTCMinutes', 6],
      ['setHours', 7],
      ['setUTCHours', 8],
      ['setDate', 9],
      ['setUTCDate', 10],
      ['setMonth', 3],
      ['setUTCMonth', 4],
      ['setFullYear', 2001],
      ['setUTCFullYear', 2002],
      ['setTime', 0],
    ];
    const seen = recorder(field);

    transaction((tx) => {
      for (const [name, arg] of calls) (date[name] as (n: number) => number)(arg);
      tx.rollback();
    });
    expect(date.getTime()).toBe(when.getTime());

    for (const [name, arg] of calls) (date[name] as (n: number) => number)(arg);
    expect(date.getTime()).toBe(0);
    expect(seen).toHaveLength(calls.length);
  });

  it('leaves a tracked collection that no field holds as a plain collection', () => {
    const map = new TrackedMap([['a', 1]]);
    map.set('b', 2);
    map.delete('a');
    const date = new TrackedDate(0);
    date.setTime(5);

    expect([...map]).toEqual([['b', 2]]);
    expect(date.getTime()).toBe(5);
  });
});
