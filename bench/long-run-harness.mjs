/*
 * Heap a long-lived form keeps per cycle of use: a cycle makes elements or registrations and drops them again, so
 * a form that releases everything it made retains nothing per cycle, however many cycles it runs.
 *
 * Run it through the build script, which bundles it and starts node with --expose-gc:
 *   node bench/build-harness.mjs bench/long-run-harness.mjs
 *
 * Each scenario runs in a process of its own, once in production and once in development mode. It runs WARMUP cycles, takes a reading across a full collection, and
 * then takes another reading after each of SEGMENTS segments of CYCLES cycles. The figure per segment is the
 * growth of process.memoryUsage().heapUsed over the segment divided by CYCLES: a constant positive figure is heap
 * that grows with the number of cycles, figures around zero are heap that does not.
 *
 * Each cycle advances Date.now() by CYCLE_MS, as one user action a second would: a declaration removes the
 * references to collected bindings once a minute of that clock, when it records a binding.
 *
 * The cycles yield to the event loop every YIELD_EVERY cycles, as an application's do between user actions: in
 * development the devtools registry drops the entry of a collected element in a FinalizationRegistry callback, and
 * such a callback runs only when the event loop runs a task.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { Field } from '../src/field';
import { Group } from '../src/group';
import { List } from '../src/list';
import CompareTo from '../src/validators/validator-compare-to';
import Required from '../src/validators/validator-required';

import { createItemTemplate, createRows } from './fixtures';

const gc = globalThis.gc;
if (typeof gc !== 'function') {
  process.stderr.write('the harness needs a node started with --expose-gc\n');
  process.exit(1);
}

const WARMUP = 1000;
const CYCLES = 10000;
const SEGMENTS = 3;
const YIELD_EVERY = 100;
const CYCLE_MS = 1000;

let now = Date.now();
Date.now = () => now;

const selfPath = fileURLToPath(import.meta.url);

const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Collects twice, because the first pass can leave objects that only the second one finds unreachable, and lets
 * the finalization callbacks the collections queued run before the reading.
 */
const heapUsed = async () => {
  gc();
  gc();
  await yieldToEventLoop();
  gc();
  return process.memoryUsage().heapUsed;
};

/** runs `count` cycles, yielding to the event loop every YIELD_EVERY of them */
const run = async (cycle, count) => {
  for (let i = 0; i < count; i += 1) {
    cycle();
    now += CYCLE_MS;
    if ((i + 1) % YIELD_EVERY === 0) await yieldToEventLoop();
  }
};

const print = (label, value) => process.stdout.write(`${label.padEnd(64)} ${value}\n`);

/** the actions registered on `element`: the ones of its declaration */
const registrationCount = (element) => element.boundActions?.registrations.length ?? 0;

const [row] = createRows(1);

/**
 * Each scenario returns `cycle`, which runs one cycle, and optionally `count`, a number read after the last segment
 * that shows what the retained heap consists of.
 */
const scenarios = {
  'bind a declaration and drop the binding': () => {
    const declaration = createItemTemplate('plain');
    return {
      cycle: () => {
        const binding = declaration.bind(row);
        binding.fields.f3.value = 'edited';
      },
    };
  },

  'the same, with a registration every 100 cycles': () => {
    const declaration = createItemTemplate('plain');
    const rule = new Required();
    let cycles = 0;
    return {
      cycle: () => {
        const binding = declaration.bind(row);
        binding.fields.f3.value = 'edited';
        cycles += 1;
        if (cycles % 100 === 0) {
          declaration.fields.f3.registerAction(rule);
          declaration.fields.f3.unregisterAction(rule);
        }
      },
    };
  },

  'push a row to a list of 100 rows and remove the first': () => {
    const list = new List(createItemTemplate('plain'), { value: createRows(100) });
    return {
      cycle: () => {
        list.push(row);
        list.remove(0);
      },
    };
  },

  'add a field with CompareTo, unregister it, remove the field': () => {
    const form = new Group({ password: new Field({ value: 'secret' }) });
    return {
      cycle: () => {
        const confirmation = new Field({ value: 'secret' });
        const rule = new CompareTo(form.fields.password, (mine, other) => mine === other);
        form.addField('confirmation', confirmation);
        confirmation.registerAction(rule);
        confirmation.unregisterAction(rule);
        form.removeField('confirmation');
      },
      count: () => `${registrationCount(form.fields.password)} actions on the compared field`,
    };
  },

  'add a field with Required, unregister it, remove the field': () => {
    const form = new Group({ password: new Field({ value: 'secret' }) });
    return {
      cycle: () => {
        const confirmation = new Field({ value: 'secret' });
        const rule = new Required();
        form.addField('confirmation', confirmation);
        confirmation.registerAction(rule);
        confirmation.unregisterAction(rule);
        form.removeField('confirmation');
      },
      count: () => `${registrationCount(form.fields.password)} actions on the other field`,
    };
  },
};

/** Runs one scenario and writes its readings as JSON: bytes per cycle for each segment, and the count. */
async function measure(name) {
  const { cycle, count } = scenarios[name]();
  await run(cycle, WARMUP);
  let previous = await heapUsed();
  const perCycle = [];
  for (let segment = 0; segment < SEGMENTS; segment += 1) {
    await run(cycle, CYCLES);
    const now = await heapUsed();
    perCycle.push((now - previous) / CYCLES);
    previous = now;
  }
  return { perCycle, count: count?.() };
}

// a scenario name on the command line makes this process one measurement and nothing else
const scenario = process.argv[2];
if (scenario) {
  process.stdout.write(`${JSON.stringify(await measure(scenario))}\n`);
  process.exit(0);
}

process.stdout.write(`node ${process.version}\n`);
// the bundle reads process.env.NODE_ENV at run time, so each mode is a child process with its own environment
['production', 'development'].forEach((mode) => {
  process.stdout.write(
    `\n-- ${mode}: retained bytes per cycle, in ${SEGMENTS} segments of ${CYCLES} cycles after ${WARMUP} warm-up cycles\n`,
  );
  Object.keys(scenarios).forEach((name) => {
    const child = spawnSync(process.execPath, ['--expose-gc', selfPath, name], {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: mode },
    });
    if (child.status !== 0) throw new Error(`${name} failed: ${child.stderr}`);
    const { perCycle, count } = JSON.parse(child.stdout.trim());
    print(name, perCycle.map((bytes) => bytes.toFixed(1)).join(' / '));
    if (count) print('', count);
  });
});
