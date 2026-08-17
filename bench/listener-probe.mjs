/*
 * How much of the single-write cost depends on somebody listening for the list's value.
 *
 * S2a in list.bench.ts writes into a list nobody has registered a ValueChangedAction on, so the list is free to
 * skip building its value. A consumer that registers one pays for the build on every write. This probe times the
 * same write against both lists, so the S2a figure can be read with the condition it holds under.
 *
 * Run it through the build script, which bundles it and starts node:
 *   node bench/build-harness.mjs bench/listener-probe.mjs
 */
import process from 'node:process';

import { ValueChangedAction } from '../src/actions/value-changed-action';

import { createList, ROW_COUNT, TARGET_FIELD, TARGET_ROW } from './fixtures';

const WARMUP = 200;
const SAMPLES = 1000;

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

let writes = 0;
const sink = [];

/** median milliseconds of one field write in the middle of a ROW_COUNT-row list */
function timeWrite(list) {
  const row = list.get(TARGET_ROW);
  for (let i = 0; i < WARMUP; i += 1) {
    writes += 1;
    row.fields[TARGET_FIELD].value = `w-${writes}`;
  }
  const samples = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    writes += 1;
    const started = process.hrtime.bigint();
    row.fields[TARGET_FIELD].value = `w-${writes}`;
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  return median(samples);
}

const print = (label, value) => process.stdout.write(`${label.padEnd(52)} ${value}\n`);

process.stdout.write(`node ${process.version}\n\n-- one field write in row ${TARGET_ROW} of a ${ROW_COUNT}-row list\n`);

const silent = createList('plain', ROW_COUNT);
print('no ValueChangedAction on the list: median ms', timeWrite(silent).toFixed(4));

const heard = createList('plain', ROW_COUNT);
let received = 0;
heard.registerAction(
  new ValueChangedAction((field, newValue) => {
    received += 1;
    sink[0] = newValue;
  }),
);
print('ValueChangedAction on the list: median ms', timeWrite(heard).toFixed(4));
print('events the listener received', received);
