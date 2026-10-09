import { Action } from '../action';
import { SubmitAction } from '../actions';
import { transaction } from '../transaction';

import { edit, leaves, lists, random, realisticForms, snapshot } from './realistic-forms';

const SEEDS = Array.from({ length: 25 }, (_, index) => index + 1);
const EDITS = 8;

const pairs = <T>(items: T[]): [T, T][] => items.flatMap((a) => items.map((b): [T, T] => [a, b]));

/** Every element of the tree whose isChanged is true, by path. */
const changed = (state: Record<string, unknown>) =>
  Object.entries(state)
    .filter(([, own]) => (own as { isChanged?: boolean }).isChanged)
    .map(([path]) => path);

describe.each(realisticForms)('invariants of the $name form', (fixture) => {
  it.each(fixture.records.map((record, index) => [index, record]))(
    'a form built over record %i holds no change',
    (_, record) => {
      expect(changed(snapshot(fixture.build(record)))).toEqual([]);
    },
  );

  // the rules are registered after the constructor wrote the value, so what they change on the group itself is a
  // change of the group (see registerAction); its members hold their part of the value as their baseline
  it.each(fixture.records.map((record, index) => [index, record]))(
    'every member of a form constructed with record %i as its value holds no change',
    (_, record) => {
      expect(changed(snapshot(fixture.construct(record))).filter((path) => path !== '$')).toEqual([]);
    },
  );

  it.each(pairs(fixture.records.map((_, index) => index)))(
    'rebind from record %i to record %i equals a form built over the second one',
    (from, to) => {
      const form = fixture.build(fixture.records[from]);

      form.rebind(fixture.records[to]);

      expect(snapshot(form)).toEqual(snapshot(fixture.build(fixture.records[to])));
    },
  );

  it.each(pairs(fixture.records.map((_, index) => index)))(
    'a list assigned the rows of record %i over record %i holds rows equal to newly built ones',
    (to, from) => {
      const form = fixture.build(fixture.records[from]);
      const expected = fixture.build(fixture.records[to]);

      lists(form).forEach(({ name, list }) => {
        list.value = fixture.records[to][name];
      });

      lists(expected).forEach(({ name, list: expectedList }) => {
        const list = lists(form).find((candidate) => candidate.name === name)!.list;
        expect(list.length).toBe(expectedList.length);
        for (let index = 0; index < list.length; index++) {
          expect(snapshot(list.get(index)!)).toEqual(snapshot(expectedList.get(index)!));
        }
      });
    },
  );

  describe.each(fixture.records.map((record, index) => ({ index, record })))('over record $index', ({ record }) => {
    it.each(SEEDS)('a reject after edits (seed %i) equals a form built over the baseline', (seed) => {
      const form = fixture.build(record);
      const baseline = form.originalValue;
      const next = random(seed);
      const log = Array.from({ length: EDITS }, () => edit(form, fixture, next));

      form.rebind(form.originalValue);

      expect(snapshot(form), log.join('; ')).toEqual(snapshot(fixture.build(baseline)));
      expect(changed(snapshot(form)), log.join('; ')).toEqual([]);
    });

    it.each(SEEDS)('writing every leaf back after edits (seed %i) leaves no change', (seed) => {
      const form = fixture.build(record);
      const originals = new Map(leaves(form).map(({ field }) => [field, field.value]));
      const next = random(seed);
      // edits of values only: a row added or removed is not undone by writing leaves
      const noRows = { ...fixture, newRows: {} };
      const log = Array.from({ length: EDITS }, () => edit(form, noRows, next));

      // the leaves are written back in the opposite order, so a leaf a rule disabled is enabled again first
      [...originals.entries()].reverse().forEach(([field, value]) => {
        field.value = value;
      });

      expect(changed(snapshot(form)), log.join('; ')).toEqual([]);
    });

    it.each(SEEDS)('a rolled back transaction of edits and a rebind (seed %i) leaves the form as it was', (seed) => {
      const form = fixture.build(record);
      const next = random(seed);
      Array.from({ length: 3 }, () => edit(form, fixture, next));
      const before = snapshot(form);
      const other = fixture.records[(fixture.records.indexOf(record) + 1) % fixture.records.length];

      expect(() =>
        transaction(() => {
          Array.from({ length: EDITS }, () => edit(form, fixture, next));
          form.rebind(other);
          throw new Error('abandon');
        }),
      ).toThrow('abandon');

      expect(snapshot(form)).toEqual(before);
    });

    it.each(SEEDS)('a submit the server echoes (seed %i) leaves no change', async (seed) => {
      const form = fixture.build(record);
      const save = new Action({ value: { label: 'Save' } });
      save.registerAction(new SubmitAction(form, (value) => JSON.parse(JSON.stringify(value)), { rebind: true }));
      const next = random(seed);
      const log = Array.from({ length: EDITS }, () => edit(form, fixture, next));
      if (!form.valid) return;

      const result = await save.execute();

      expect(result.sent, log.join('; ')).toBeDefined();
      expect(changed(snapshot(form)), log.join('; ')).toEqual([]);
    });
  });
});
