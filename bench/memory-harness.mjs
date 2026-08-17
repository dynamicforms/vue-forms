/*
 * The metrics `vitest bench` does not produce: retained heap per field, Vue proxies per row, and the number of
 * validator runs one row costs while it is built.
 *
 * Run it through the build script, which bundles it and starts node with --expose-gc:
 *   node bench/build-harness.mjs
 *
 * Retained heap is the difference in process.memoryUsage().heapUsed across a full collection before and after the
 * lists are built, over the number of fields they hold. Proxy counts come from the counting `reactive` the build
 * script substitutes for vue's. Neither needs a change in the library source.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { List } from '../src/list';
import { Validator } from '../src/validators/validator';
import { Field } from '../src/field';
import { Group } from '../src/group';

import { createItemTemplate, createList, createRows, fieldNames, FIELD_COUNT, ROW_COUNT, variants } from './fixtures';
import { proxyCount, resetProxyCount } from './vue-proxy-counter.mjs';

const gc = globalThis.gc;
if (typeof gc !== 'function') {
  process.stderr.write('the harness needs a node started with --expose-gc\n');
  process.exit(1);
}

const LISTS = 10;
const REPETITIONS = 3;

const selfPath = fileURLToPath(import.meta.url);

/** collects twice, because the first pass can leave objects that only the second one finds unreachable */
const heapUsed = () => {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};

const print = (label, value) => process.stdout.write(`${label.padEnd(52)} ${value}\n`);

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * The heap a batch of LISTS lists of ROW_COUNT rows occupies: the difference of two readings taken across a full
 * collection, with the batch reachable at the second one.
 *
 * One batch per process, and it is the only one the process builds. A collection cannot be counted on to release
 * a batch a previous measurement in the same process built, so a second reading pair would report a difference
 * that says more about what was released than about what was allocated.
 */
function measureBatch(variant) {
  const before = heapUsed();
  const lists = [];
  for (let i = 0; i < LISTS; i += 1) lists.push(createList(variant, ROW_COUNT));
  const after = heapUsed();
  // the array is read after the second reading, so the lists cannot be collected before it is taken
  if (lists.length !== LISTS) throw new Error('lists went missing');
  return after - before;
}

/** Bytes one field of a filled list retains, as the median over REPETITIONS child processes of one batch each. */
function retainedBytesPerField(variant) {
  const samples = [];
  for (let rep = 0; rep < REPETITIONS; rep += 1) {
    const child = spawnSync(process.execPath, ['--expose-gc', selfPath, variant], { encoding: 'utf8' });
    if (child.status !== 0) throw new Error(`batch measurement failed: ${child.stderr}`);
    samples.push(Number(child.stdout.trim()));
  }

  const total = median(samples);
  const fields = LISTS * ROW_COUNT * FIELD_COUNT;
  return {
    bytes: total / fields,
    total,
    fields,
    spread: (Math.max(...samples) - Math.min(...samples)) / total,
  };
}

/** vue proxies one row of a list costs, and what the item template costs once */
function proxiesPerRow(variant) {
  const rows = 100;
  const data = createRows(rows);

  resetProxyCount();
  const template = createItemTemplate(variant);
  const templateProxies = proxyCount();

  resetProxyCount();
  const list = new List(template, { value: data });
  // the List itself is one proxy; the rest belongs to the rows
  const rowProxies = (proxyCount() - 1) / rows;

  if (list.value.length !== rows) throw new Error('rows went missing');
  return { templateProxies, rowProxies };
}

/**
 * Validator runs one row costs while it is built, counted with a validator that does nothing but count. The
 * three paths differ in how much of the row already exists when the value arrives.
 */
function validatorRuns() {
  let calls = 0;
  const counting = () => new Validator(() => {
    calls += 1;
    return null;
  });

  const rowValue = {};
  fieldNames.forEach((name, col) => {
    rowValue[name] = `a-0-${col}`;
  });

  const buildTemplate = () => {
    const fields = {};
    fieldNames.forEach((name) => {
      fields[name] = new Field({ value: '', validators: [counting()] });
    });
    return new Group(fields);
  };

  calls = 0;
  const singleField = new Field({ value: 'x', validators: [counting()] });
  const perFieldConstruction = calls;

  const template = buildTemplate();
  calls = 0;
  template.clone({ value: rowValue });
  const perRowClone = calls;

  const listTemplate = buildTemplate();
  calls = 0;
  const list = new List(listTemplate, { value: [rowValue] });
  const perRowList = calls;

  if (!singleField.valid || !list.valid) throw new Error('the counting validator rejected the row');
  return { perFieldConstruction, perRowClone, perRowList };
}

// a variant on the command line makes this process one batch measurement and nothing else
const batchVariant = process.argv[2];
if (batchVariant) {
  process.stdout.write(`${measureBatch(batchVariant)}\n`);
  process.exit(0);
}

process.stdout.write(`node ${process.version}\n\n`);

process.stdout.write(`-- retained heap (median of ${REPETITIONS} runs, one batch of ${LISTS} lists of ${ROW_COUNT} rows each)\n`);
variants.forEach((variant) => {
  const { bytes, total, fields, spread } = retainedBytesPerField(variant);
  print(`${variant}: retained bytes`, `${total} over ${fields} fields`);
  print(`${variant}: retained bytes per field`, bytes.toFixed(1));
  print(`${variant}: retained KiB per 1000-row list`, (total / LISTS / 1024).toFixed(1));
  print(`${variant}: spread across runs`, `${(spread * 100).toFixed(1)} %`);
});

process.stdout.write('\n-- vue proxies\n');
variants.forEach((variant) => {
  const { templateProxies, rowProxies } = proxiesPerRow(variant);
  print(`${variant}: proxies for the item template`, templateProxies);
  print(`${variant}: proxies per row`, rowProxies);
  print(`${variant}: proxies for a 1000-row list`, 1 + rowProxies * ROW_COUNT);
});

process.stdout.write('\n-- validator runs\n');
const runs = validatorRuns();
print('runs per field, new Field({ value, validators })', runs.perFieldConstruction);
print('runs per row, template.clone({ value })', `${runs.perRowClone} (${runs.perRowClone / FIELD_COUNT} per field)`);
print('runs per row, new List(tpl, { value: [row] })', `${runs.perRowList} (${runs.perRowList / FIELD_COUNT} per field)`);
