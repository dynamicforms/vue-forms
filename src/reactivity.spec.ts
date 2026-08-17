import { isEqual } from 'lodash-es';
import { EffectScope, effectScope, isReactive, isReadonly, nextTick, readonly, toRaw, watchEffect } from 'vue';

import { Action } from './action';
import DisplayMode from './display-mode';
import { Field } from './field';
import { Group } from './group';
import { List } from './list';
import { ValidationErrorText, Validators } from './validators';

/**
 * A field is not a proxy of itself - it carries __v_skip, and what is reactive is the state it holds its members
 * in. A template or a watcher that reads a field member still re-runs when that member is written, and toRaw() of
 * a field is the field. The effects below all run inside one scope that is stopped after each test: a leaked
 * effect keeps firing on later tests' fixtures and shows up as an off-by-one run count somewhere else entirely.
 */
let scope: EffectScope;

beforeEach(() => {
  scope = effectScope();
});

afterEach(() => {
  scope.stop();
});

/** starts a watcher over fn and returns the array it appends to, one entry per run, first entry synchronous */
function track<T>(fn: () => T): T[] {
  const runs: T[] = [];
  scope.run(() => {
    watchEffect(() => {
      runs.push(fn());
    });
  });
  return runs;
}

/** group.value builds a fresh object on every read, so run history is compared as snapshots, not by identity */
function snapshot(field: { value: any }): () => string {
  return () => JSON.stringify(field.value);
}

describe('scheduling', () => {
  it('flushes watchers on the next tick, not on the write', async () => {
    const field = new Field({ value: 1 });
    const runs = track(() => field.value);
    expect(runs).toEqual([1]);

    field.value = 2;
    expect(runs).toEqual([1]); // the write only queues the effect

    await nextTick();
    expect(runs).toEqual([1, 2]);
  });
});

describe('reactivity flags', () => {
  it('answers isReactive for every field type', () => {
    class MyField extends Field {}

    expect(isReactive(new Field({ value: 1 }))).toBe(true);
    expect(isReactive(new Action({ value: { label: 'x' } }))).toBe(true);
    expect(isReactive(new Group({ a: new Field({ value: 1 }) }))).toBe(true);
    expect(isReactive(new List())).toBe(true);
    // the flags are on the base's prototype, so a subclass answers the same without doing anything for it
    expect(isReactive(new MyField({ value: 1 }))).toBe(true);
  });

  it('hands an element back unwrapped from readonly()', () => {
    // __v_skip stops readonly() the same way it stops reactive(), so the wrapper protects nothing and the
    // documentation says so: what a caller hands out instead is the value, which is frozen
    const field = new Field({ value: 1 });
    const view = readonly(field);

    expect(view).toBe(field);
    expect(isReadonly(view)).toBe(false);
    // the type readonly() gives back still refuses the assignment, so the write is what a JavaScript caller, or
    // one that casts, ends up doing
    (view as Field<number>).value = 2;
    expect(field.value).toBe(2);
  });

  it('keeps child fields reactive and identical to what was passed in', () => {
    const child = new Field({ value: 1 });
    const group = new Group({ child });
    const list = new List(new Group({ n: new Field({ value: 0 }) }));
    list.push({ n: 1 });

    expect(group.fields.child).toBe(child);
    expect(group.field('child')).toBe(child);
    expect(isReactive(group.fields.child)).toBe(true);
    expect(child.parent).toBe(group);

    expect(isReactive(list.get(0))).toBe(true);
    expect(list.get(0)!.parent).toBe(list);
  });

  it('keeps the parent back-reference out of enumeration, in a group member and in a list row', () => {
    const inner = new Group({ x: new Field({ value: 1 }) });
    const rows = new List(new Group({ n: new Field({ value: 0 }) }));
    const outer = new Group({ inner, rows });
    rows.push({ n: 1 });

    expect(Object.keys(inner)).not.toContain('parent');
    expect(Object.keys(toRaw(inner))).not.toContain('parent');
    expect(Object.keys(inner)).not.toContain('fieldName');
    expect(Object.keys(rows.get(0)!)).not.toContain('parent');
    expect(Object.keys(toRaw(rows.get(0)!))).not.toContain('parent');

    // both walkers follow own enumerable properties, so the parent/child cycle must not be reachable through them
    expect(() => JSON.stringify(outer)).not.toThrow();
    expect(() => isEqual(outer, outer.clone())).not.toThrow();
  });
});

describe('Field reactivity', () => {
  it('re-runs on a value change', async () => {
    const field = new Field({ value: 'a' });
    const runs = track(() => field.value);

    field.value = 'b';
    await nextTick();

    expect(runs).toEqual(['a', 'b']);
  });

  it('re-runs on touched, visibility and enabled changes', async () => {
    const field = new Field({ value: 1 });
    const touched = track(() => field.touched);
    const visibility = track(() => field.visibility);
    const enabled = track(() => field.enabled);

    field.touched = true;
    field.visibility = DisplayMode.SUPPRESS;
    field.enabled = false;
    await nextTick();

    expect(touched).toEqual([false, true]);
    expect(visibility).toEqual([DisplayMode.FULL, DisplayMode.SUPPRESS]);
    expect(enabled).toEqual([true, false]);
  });

  it('re-runs on validity and on the errors array', async () => {
    const field = new Field({ value: 'a', validators: [new Validators.Required()] });
    const valid = track(() => field.valid);
    const errorCount = track(() => field.errors.length);

    field.value = '';
    await nextTick();

    expect(valid).toEqual([true, false]);
    expect(errorCount).toEqual([0, 1]);

    field.value = 'b';
    await nextTick();

    expect(valid).toEqual([true, false, true]);
    expect(errorCount).toEqual([0, 1, 0]);
  });

  it('does not re-run when the setter ignores the write', async () => {
    // a write the setter refuses reaches no slot, so nothing is triggered and the reader keeps the value it has
    const same = new Field({ value: 1 });
    const sameRuns = track(() => same.value);
    same.value = 1;
    await nextTick();
    expect(sameRuns).toEqual([1]);

    const disabled = new Field({ value: 1, enabled: false });
    const disabledRuns = track(() => disabled.value);
    disabled.value = 5;
    await nextTick();
    expect(disabledRuns).toEqual([1]);
    expect(disabled.value).toBe(1);
  });

  it('re-runs on validationEpoch', async () => {
    const field = new Field({ value: 1, validators: [new Validators.Required()] });
    const runs = track(() => field.validationEpoch);
    expect(runs).toEqual([0]);

    field.clearValidators();
    await nextTick();

    expect(field.validationEpoch).toBe(1);
    expect(runs).toEqual([0, 1]);
  });
});

describe('parent reactivity', () => {
  it('re-runs when a group takes a field', async () => {
    const field = new Field({ value: 1 });
    const runs = track(() => field.parent !== undefined);
    expect(runs).toEqual([false]);

    const group = new Group({ field });
    await nextTick();

    expect(field.parent).toBe(group);
    expect(runs).toEqual([false, true]);
  });

  it('re-runs when a list releases a row', async () => {
    const list = new List(new Group({ n: new Field({ value: 0 }) }), { value: [{ n: 1 }] });
    const row = list.get(0)!;
    const runs = track(() => row.parent !== undefined);
    await nextTick();
    expect(runs).toEqual([true]);

    list.remove(0);
    await nextTick();

    expect(row.parent).toBeUndefined();
    expect(runs).toEqual([true, false]);
  });

  it('re-runs on fieldName when a group takes a field', async () => {
    const field = new Field({ value: 1 });
    const runs = track(() => field.fieldName);
    expect(runs).toEqual([undefined]);

    const group = new Group({ named: field });
    await nextTick();

    expect(group.field('named')).toBe(field);
    expect(runs).toEqual([undefined, 'named']);
  });
});

describe('Group reactivity', () => {
  it('re-runs on a child field change', async () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const runs = track(snapshot(group));

    group.fields.a.value = 9;
    await nextTick();

    expect(runs).toEqual(['{"a":1,"b":2}', '{"a":9,"b":2}']);
  });

  it('re-runs on a whole-group value assignment', async () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const runs = track(snapshot(group));

    group.value = { a: 9 };
    await nextTick();

    expect(runs).toEqual(['{"a":1,"b":2}', '{"a":9,"b":2}']);
  });

  it('re-runs on validity when a child becomes invalid', async () => {
    const group = new Group({ a: new Field({ value: 'x', validators: [new Validators.Required()] }) });
    const runs = track(() => group.valid);

    group.fields.a.value = '';
    await nextTick();

    expect(runs).toEqual([true, false]);
  });

  it('re-runs on touched, both from a child and from the group', async () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const fromChild = track(() => group.touched);

    group.fields.a.touched = true;
    await nextTick();
    expect(fromChild).toEqual([false, true]);

    const fromGroup = track(() => group.touched);
    group.touched = false;
    await nextTick();
    expect(fromGroup).toEqual([true, false]);
  });

  it('re-runs on visibility and enabled assignments', async () => {
    const group = new Group({ a: new Field({ value: 1 }) });
    const visibility = track(() => group.visibility);
    const enabled = track(() => group.enabled);

    group.visibility = DisplayMode.HIDDEN;
    group.enabled = false;
    await nextTick();

    expect(visibility).toEqual([DisplayMode.FULL, DisplayMode.HIDDEN]);
    expect(enabled).toEqual([true, false]);
  });

  it('re-runs when a group-level error is pushed, without a validate() call', async () => {
    const group = new Group({ a: new Field({ value: 1 }) });
    const valid = track(() => group.valid);
    const errorCount = track(() => group.errors.length);

    // validate() exists to fire ValidChangedAction; rendering does not depend on it
    group.errors.push(new ValidationErrorText('At least one contact is required'));
    await nextTick();

    expect(valid).toEqual([true, false]);
    expect(errorCount).toEqual([0, 1]);
    expect(group.valid).toBe(false);
  });

  it('re-runs when the whole errors array is replaced', async () => {
    const group = new Group({ a: new Field({ value: 1 }) });
    const valid = track(() => group.valid);

    group.errors = [new ValidationErrorText('napaka')];
    await nextTick();
    expect(valid).toEqual([true, false]);

    group.errors = [];
    await nextTick();
    expect(valid).toEqual([true, false, true]);
  });

  it('propagates a nested group change to the outer group', async () => {
    const inner = new Group({ x: new Field({ value: 1 }) });
    const outer = new Group({ inner, y: new Field({ value: 2 }) });
    const value = track(snapshot(outer));
    const valid = track(() => outer.valid);

    inner.fields.x.value = 9;
    await nextTick();
    expect(value).toEqual(['{"inner":{"x":1},"y":2}', '{"inner":{"x":9},"y":2}']);

    inner.errors.push(new ValidationErrorText('napaka'));
    await nextTick();
    expect(valid).toEqual([true, false]);
  });
});

describe('List reactivity', () => {
  function buildList() {
    return new List(new Group({ n: new Field({ value: 0 }) }));
  }

  it('re-runs on push', async () => {
    const list = buildList();
    const runs = track(snapshot(list));

    list.push({ n: 1 });
    await nextTick();

    expect(runs).toEqual(['null', '[{"n":1}]']);
  });

  it('re-runs on insert', async () => {
    const list = buildList();
    list.push({ n: 1 });
    const runs = track(snapshot(list));

    list.insert({ n: 2 }, 0);
    await nextTick();

    expect(runs).toEqual(['[{"n":1}]', '[{"n":2},{"n":1}]']);
  });

  it('re-runs on remove', async () => {
    const list = buildList();
    list.push({ n: 1 });
    list.push({ n: 2 });
    const runs = track(snapshot(list));

    list.remove(0);
    await nextTick();

    expect(runs).toEqual(['[{"n":1},{"n":2}]', '[{"n":2}]']);
  });

  it('re-runs on pop', async () => {
    const list = buildList();
    list.push({ n: 1 });
    list.push({ n: 2 });
    const runs = track(snapshot(list));

    list.pop();
    await nextTick();

    expect(runs).toEqual(['[{"n":1},{"n":2}]', '[{"n":1}]']);
  });

  it('re-runs on clear', async () => {
    const list = buildList();
    list.push({ n: 1 });
    const runs = track(snapshot(list));

    list.clear();
    await nextTick();

    expect(runs).toEqual(['[{"n":1}]', 'null']);
  });

  it('tracks the item count', async () => {
    const list = buildList();
    const runs = track(() => list.value?.length ?? 0);

    list.push({ n: 1 });
    await nextTick();
    expect(runs).toEqual([0, 1]);

    list.push({ n: 2 });
    await nextTick();
    expect(runs).toEqual([0, 1, 2]);
  });

  it('re-runs on validity when an invalid item is added and again when it is removed', async () => {
    const list = new List(new Group({ n: new Field({ value: '', validators: [new Validators.Required()] }) }));
    const runs = track(() => list.valid);

    list.push({ n: '' });
    await nextTick();
    expect(runs).toEqual([true, false]);

    list.remove(0);
    await nextTick();
    expect(runs).toEqual([true, false, true]);
  });

  it('re-runs a watcher on a field inside a list item', async () => {
    const list = buildList();
    list.push({ n: 1 });
    const runs = track(snapshot(list));

    list.get(0)!.fields.n.value = 5;
    await nextTick();

    expect(runs).toEqual(['[{"n":1}]', '[{"n":5}]']);
  });

  it('propagates list changes to the containing group', async () => {
    const rows = buildList();
    const group = new Group({ rows, name: new Field({ value: 'x' }) });
    const runs = track(snapshot(group));

    rows.push({ n: 1 });
    await nextTick();
    expect(runs).toEqual(['{"rows":null,"name":"x"}', '{"rows":[{"n":1}],"name":"x"}']);

    rows.remove(0);
    await nextTick();
    expect(runs).toEqual(['{"rows":null,"name":"x"}', '{"rows":[{"n":1}],"name":"x"}', '{"rows":null,"name":"x"}']);
  });
});

describe('Action reactivity', () => {
  it('re-runs on a label change and on a whole-value assignment', async () => {
    const action = new Action({ value: { label: 'Save', icon: 'save' } });
    const runs = track(() => action.label);

    action.label = 'Cancel';
    await nextTick();
    expect(runs).toEqual(['Save', 'Cancel']);

    action.value = { label: 'Close', icon: 'close' };
    await nextTick();
    expect(runs).toEqual(['Save', 'Cancel', 'Close']);
  });

  it('re-runs on enabled', async () => {
    const action = new Action({ value: { label: 'Save' } });
    const runs = track(() => action.enabled);

    action.enabled = false;
    await nextTick();

    expect(runs).toEqual([true, false]);
  });
});
