/**
 * Loads the built ESM artifact and exercises it, so that what the package publishes is checked rather than what
 * the source compiles to under the test runner. The specs import `src/`; nothing else reaches `dist/`.
 *
 * Run after `npm run build`.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const artifact = pathToFileURL(resolve('dist/dynamicforms-vue-forms.js')).href;
const m = await import(artifact);

// every value the declarations export (classes, functions, constants, enums, namespaces) is read from the built
// index.d.ts, so a value that is declared but missing at runtime, or present at runtime but not declared, fails the
// build; types and interfaces have no runtime counterpart and are not checked
const declarations = readFileSync(resolve('dist/index.d.ts'), 'utf8');
const declared = [
  ...declarations.matchAll(/^export declare (?:abstract )?(?:class|const|function|enum|namespace) (\w+)/gm),
].map((match) => match[1]);
const expected = [...new Set(declared), 'default'];
assert.ok(declared.length > 40, `only ${declared.length} value exports declared - the declarations rolled up empty?`);
const missing = expected.filter((name) => !(name in m));
assert.equal(missing.length, 0, `the artifact is missing exports: ${missing.join(', ')}`);
const undeclared = Object.keys(m).filter((name) => !expected.includes(name));
assert.equal(undeclared.length, 0, `the artifact exports values the declarations do not: ${undeclared.join(', ')}`);

// a form end to end: composition, validation, serialization
const template = new m.Group({
  name: new m.Field({ value: '', validators: [new m.Validators.Required()] }),
  note: new m.Field({ value: '' }),
});
const list = new m.List(template);
list.push({ name: 'Ada', note: 'first' });
list.push({ name: '', note: 'second' });

assert.equal(list.length, 2, 'the list holds both rows');
assert.equal(list.valid, false, 'a row failing Required leaves the list invalid');
assert.equal(list.get(1).fields.name.errors[0].code, 'required', 'the error carries its code');

list.get(1).fields.name.value = 'Grace';
assert.equal(list.valid, true, 'filling the row settles the list');

list.get(0).fields.note.access = 'disabled';
assert.deepEqual(list.value[0], { name: 'Ada' }, 'value leaves a disabled field out');
assert.deepEqual(list.fullValue[0], { name: 'Ada', note: 'first' }, 'fullValue carries it');

// a transaction announces once and a throw puts everything back
let announced = 0;
list.registerAction(new m.ValueChangedAction(() => (announced += 1)));
m.transaction(() => {
  list.push({ name: 'Katherine', note: 'third' });
  list.push({ name: 'Dorothy', note: 'fourth' });
});
assert.equal(announced, 1, 'one announcement for the whole transaction');
assert.equal(list.length, 4, 'both rows landed');

assert.throws(
  () =>
    m.transaction(() => {
      list.push({ name: 'Mary', note: 'fifth' });
      throw new Error('handler failed');
    }),
  /handler failed/,
);
assert.equal(list.length, 4, 'a throw rolls the transaction back');

console.log(`artifact verified: ${expected.length} exports, a list of ${list.length} rows exercised end to end`);
