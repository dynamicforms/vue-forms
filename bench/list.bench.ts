import { bench, describe } from 'vitest';

import { ValueChangedAction } from '../src/actions/value-changed-action';
import type { Group } from '../src/group';
import { List } from '../src/list';

import {
  createItemTemplate,
  createList,
  createRows,
  FixtureVariant,
  ROW_COUNT,
  RowValue,
  TARGET_FIELD,
  TARGET_ROW,
  variants,
} from './fixtures';

/*
 * Scenario ids: S1a bulk build, S1b push build, S2a single-field write, S2b single-field write with a
 * ValueChangedAction on the list, S3 remove, S4a and S4b whole-list assignment, S4c whole-list assignment with a
 * ValueChangedAction on f0 that writes f7 of the same row, S6 the validity read, S7 the access toggle between editable
 * and readonly. Every scenario runs over both fixture variants.
 *
 * Sample counts are set per scenario instead of by elapsed time, because one sample of S1b costs seconds. A
 * benchmark function is called once before the timed loop and once before the warmup loop without a sample being
 * recorded, and warmup samples are discarded, so a scenario that has to build its own 1000-row list builds it
 * outside the recorded samples.
 */

const BUILD = { time: 0, iterations: 10, warmupTime: 0, warmupIterations: 2 };
const PUSH = { time: 0, iterations: 3, warmupTime: 0, warmupIterations: 0 };
const WRITE = { time: 0, iterations: 100, warmupTime: 0, warmupIterations: 20 };
const REMOVE = { time: 0, iterations: 20, warmupTime: 0, warmupIterations: 0 };
const ASSIGN = { time: 0, iterations: 10, warmupTime: 0, warmupIterations: 1 };
const READ = { time: 0, iterations: 100, warmupTime: 0, warmupIterations: 20 };

/**
 * Holds the fixture of the scenario currently running and drops the one before it, so a benchmark file that
 * covers nine scenarios over two variants keeps one 1000-row list alive rather than eighteen.
 */
let current: { key: string; list: List } | null = null;

function fixtureList(
  key: string,
  variant: FixtureVariant,
  setup?: (list: List) => void,
  build: (variant: FixtureVariant) => List = (v) => createList(v, ROW_COUNT),
): List {
  if (current?.key !== key) {
    current = { key, list: build(variant) };
    setup?.(current.list);
  }
  return current.list;
}

/** the rows every scenario assigns from; built once, because the scenarios measure the list, not the data */
const rows: Record<string, RowValue[]> = {
  same: createRows(ROW_COUNT),
  other: createRows(ROW_COUNT, 'b'),
  longer: createRows(ROW_COUNT + 1),
};

/** the fixture list whose f0 carries a second ValueChangedAction that writes f7 of the same row */
function createSiblingWritingList(variant: FixtureVariant): List {
  const template = createItemTemplate(variant);
  template.fields.f0.registerAction(
    new ValueChangedAction((field, supr, newValue, oldValue) => {
      (field.parent as Group).fields.f7.value = `computed-${newValue}`;
      supr(field, newValue, oldValue);
    }),
  );
  return new List(template, { value: rows.same });
}

/** counter behind every write, so no assignment is a no-op the value setter can return from */
let writes = 0;

/** consumes what a scenario produces, so no measured call can be dropped as dead code */
const sink: unknown[] = [];
const consume = (value: unknown) => {
  sink[0] = value;
};

describe('S1a build a 1000-row list via new List(tpl, { value: rows })', () => {
  variants.forEach((variant) => {
    bench(
      variant,
      () => {
        consume(new List(createItemTemplate(variant), { value: rows.same }));
      },
      BUILD,
    );
  });
});

describe('S1b build a 1000-row list via 1000 push() calls', () => {
  variants.forEach((variant) => {
    bench(
      variant,
      () => {
        const list = new List(createItemTemplate(variant));
        for (let i = 0; i < ROW_COUNT; i++) list.push(rows.same[i]);
        consume(list);
      },
      PUSH,
    );
  });
});

describe('S2a write one field in row 500 of a 1000-row list, nothing mounted', () => {
  variants.forEach((variant) => {
    bench(
      variant,
      () => {
        const row = fixtureList(`S2a-${variant}`, variant).get(TARGET_ROW)!;
        writes += 1;
        row.fields[TARGET_FIELD].value = `w-${writes}`;
      },
      WRITE,
    );
  });
});

describe('S2b write one field in row 500 of a 1000-row list with a ValueChangedAction on the list', () => {
  variants.forEach((variant) => {
    bench(
      variant,
      () => {
        const list = fixtureList(`S2b-${variant}`, variant, (built) => {
          built.registerAction(new ValueChangedAction(() => undefined));
        });
        writes += 1;
        list.get(TARGET_ROW)!.fields[TARGET_FIELD].value = `w-${writes}`;
      },
      WRITE,
    );
  });
});

describe('S3 list.remove(500) on a 1000-row list', () => {
  variants.forEach((variant) => {
    // the list is one row shorter after every sample, so the scenario reports the average over a list shrinking
    // from ROW_COUNT to ROW_COUNT minus the sample count
    bench(
      variant,
      () => {
        consume(fixtureList(`S3-${variant}`, variant).remove(TARGET_ROW));
      },
      REMOVE,
    );
  });
});

describe('S4a list.value = rows, same length', () => {
  variants.forEach((variant) => {
    bench(
      variant,
      () => {
        fixtureList(`S4a-${variant}`, variant).value = rows.same;
      },
      ASSIGN,
    );
  });
});

describe('S4b list.value = rows, different length', () => {
  variants.forEach((variant) => {
    // the two arrays alternate, so every assignment lands on a list whose length differs from the one assigned
    bench(
      variant,
      () => {
        const list = fixtureList(`S4b-${variant}`, variant);
        writes += 1;
        list.value = writes % 2 === 0 ? rows.same : rows.longer;
      },
      ASSIGN,
    );
  });
});

describe('S4c list.value = rows, same length, with a ValueChangedAction on f0 that writes f7 of the row', () => {
  variants.forEach((variant) => {
    // the two arrays alternate, so f0 changes in every row and its action runs once per row
    bench(
      variant,
      () => {
        const list = fixtureList(`S4c-${variant}`, variant, undefined, createSiblingWritingList);
        writes += 1;
        list.value = writes % 2 === 0 ? rows.same : rows.other;
      },
      ASSIGN,
    );
  });
});

describe('S6 read list.valid on a 1000-row list', () => {
  variants.forEach((variant) => {
    bench(
      variant,
      () => {
        consume(fixtureList(`S6-${variant}`, variant).valid);
      },
      READ,
    );
  });
});

describe('S6 write one field in row 500, then read list.valid', () => {
  variants.forEach((variant) => {
    bench(
      variant,
      () => {
        const list = fixtureList(`S6w-${variant}`, variant);
        writes += 1;
        list.get(TARGET_ROW)!.fields[TARGET_FIELD].value = `w-${writes}`;
        consume(list.valid);
      },
      WRITE,
    );
  });
});

describe('S7 list.access = readonly, then back to editable, on a 1000-row list', () => {
  variants.forEach((variant) => {
    bench(
      variant,
      () => {
        const list = fixtureList(`S7-${variant}`, variant);
        list.access = 'readonly';
        list.access = 'editable';
      },
      WRITE,
    );
  });
});
