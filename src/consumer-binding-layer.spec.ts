import { vi } from 'vitest';
import { computed, EffectScope, effectScope, nextTick, watchEffect } from 'vue';

import { ValueChangedAction } from './actions';
import DisplayMode from './display-mode';
import { Field } from './field';
import { FieldBase } from './field-base';
import { Group } from './group';
import { ValidationErrorText, Validators } from './validators';
import { ValidationFunctionResult, Validator } from './validators/validator';

/**
 * The contract a UI layer binds an element to a rendered control with, held from that layer's seat rather than
 * from the library's. Such a layer holds a computed over `control.value` whose setter writes `control.value`,
 * reads `errors`, `valid`, `touched`, `enabled` and `visibility` off the element, and repaints when any of those
 * reads changes; it registers no handler of its own, so what it renders is whatever the element ends up holding
 * once everything registered on the element has run.
 *
 * Every effect below runs inside one scope that is stopped after each test, and each test states both what the
 * element holds afterwards and how many times the reads re-ran: the run count is what decides whether the
 * rendered control is repainted, and the two answers differ where a write does not move the value.
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

/** a read a binding layer renders from: the element member reached through a computed, the way the layer holds it */
function bindRead<T>(read: () => T) {
  return scope.run(() => computed<T>(read))!;
}

/** the computed a binding layer holds over an element: the read a control renders from, the write its input makes */
function bindValue<T>(field: FieldBase<T>) {
  return scope.run(() =>
    computed<T>({
      get: () => field.value,
      set: (newValue: T) => {
        field.value = newValue;
      },
    }),
  )!;
}

describe('a value bound through a computed', () => {
  it('reaches the field through the setter and answers the written value through the getter', async () => {
    const field = new Field({ value: 'a' });
    const bound = bindValue(field);
    const runs = track(() => bound.value);

    bound.value = 'b';

    expect(field.value).toBe('b');
    expect(bound.value).toBe('b');

    await nextTick();
    expect(runs).toEqual(['a', 'b']);
  });

  it('answers what a handler wrote in place of the write, and the read re-runs on it', async () => {
    const field = new Field({ value: 'a' });
    field.registerAction(
      new ValueChangedAction((element, supr, newValue: string) => {
        if (newValue !== newValue.toUpperCase()) element.value = newValue.toUpperCase();
      }),
    );
    const bound = bindValue(field);
    const direct = track(() => field.value);
    const runs = track(() => bound.value);

    bound.value = 'b';

    expect(field.value).toBe('B');

    await nextTick();
    expect(direct).toEqual(['a', 'B']);
    expect(runs).toEqual(['a', 'B']);
  });

  // A handler that writes back the value the field already holds leaves the field where it was: the slot is
  // written twice, so an effect reading `field.value` re-runs and reads the value it read before, while a
  // computed over the field answers what it answered last and nothing reading the field through one re-runs.
  it('leaves the field where it was where a handler writes back the value it already held', async () => {
    const field = new Field({ value: 'abcde' });
    field.registerAction(
      new ValueChangedAction((element, supr, newValue: string) => {
        if (newValue.length > 5) element.value = newValue.slice(0, 5);
      }),
    );
    const bound = bindValue(field);
    const direct = track(() => field.value);
    const runs = track(() => bound.value);

    bound.value = 'abcdef';

    expect(field.value).toBe('abcde');

    await nextTick();
    expect(direct).toEqual(['abcde', 'abcde']);
    expect(runs).toEqual(['abcde']);
  });

  // A disabled field's setter reaches no slot at all, so neither read has anything to re-run for.
  it('drops a write to a disabled field and re-runs neither read', async () => {
    const field = new Field({ value: 'a', enabled: false });
    const bound = bindValue(field);
    const direct = track(() => field.value);
    const runs = track(() => bound.value);

    bound.value = 'b';

    expect(field.value).toBe('a');

    await nextTick();
    expect(direct).toEqual(['a']);
    expect(runs).toEqual(['a']);
  });

  // A handler that throws unwinds the whole write and the throw reaches the caller: the slot is written and put
  // back, so an effect reading `field.value` re-runs over the value the field started with, and a computed over
  // the field answers that same value and re-runs nothing.
  it('unwinds a write a handler threw out of and hands the throw to the caller', async () => {
    const field = new Field({ value: 'a' });
    field.registerAction(
      new ValueChangedAction(() => {
        throw new Error('the service refused the value');
      }),
    );
    const bound = bindValue(field);
    const direct = track(() => field.value);
    const runs = track(() => bound.value);

    expect(() => {
      bound.value = 'b';
    }).toThrow('the service refused the value');

    expect(field.value).toBe('a');

    await nextTick();
    expect(direct).toEqual(['a', 'a']);
    expect(runs).toEqual(['a']);
  });
});

describe('the verdict a binding layer renders', () => {
  it('re-runs the errors and valid reads when a validator rejects the value and accepts it again', async () => {
    const field = new Field({ value: 'a', validators: [new Validators.Required()] });
    const bound = bindValue(field);
    const boundValid = bindRead(() => field.valid);
    const boundErrors = bindRead(() => field.errors);
    const valid = track(() => boundValid.value);
    const errorCount = track(() => boundErrors.value.length);

    bound.value = '';
    await nextTick();

    expect(valid).toEqual([true, false]);
    expect(errorCount).toEqual([0, 1]);

    bound.value = 'b';
    await nextTick();

    expect(valid).toEqual([true, false, true]);
    expect(errorCount).toEqual([0, 1, 0]);
  });

  it('re-runs them when an asynchronous validator settles', async () => {
    let settle: (result: ValidationFunctionResult) => void = () => {};
    const pending = new Promise<ValidationFunctionResult>((resolve) => {
      settle = resolve;
    });
    const field = new Field({ value: 'a', validators: [new Validator(() => pending)] });
    const boundValid = bindRead(() => field.valid);
    const boundErrors = bindRead(() => field.errors);
    const valid = track(() => boundValid.value);
    const errorCount = track(() => boundErrors.value.length);

    expect(field.validating).toBe(true);

    settle([new ValidationErrorText('rejected by the service')]);
    await vi.waitFor(() => {
      expect(field.validating).toBe(false);
    });
    await nextTick();

    expect(valid).toEqual([true, false]);
    expect(errorCount).toEqual([0, 1]);
    expect(field.errors.map((error) => error.componentBody)).toEqual(['rejected by the service']);
  });

  it('re-runs the touched read, which the layer both reads and writes', async () => {
    const field = new Field({ value: 'a' });
    const bound = scope.run(() =>
      computed<boolean>({
        get: () => field.touched,
        set: (newValue: boolean) => {
          field.touched = newValue;
        },
      }),
    )!;
    const runs = track(() => bound.value);

    bound.value = true;

    expect(field.touched).toBe(true);

    await nextTick();
    expect(runs).toEqual([false, true]);
  });
});

describe('the element state a binding layer renders', () => {
  it('re-runs the enabled and visibility reads when the element is written', async () => {
    const field = new Field({ value: 'a' });
    const boundEnabled = bindRead(() => field.enabled);
    const boundVisibility = bindRead(() => field.visibility);
    const enabled = track(() => boundEnabled.value);
    const visibility = track(() => boundVisibility.value);

    field.enabled = false;
    field.visibility = DisplayMode.HIDDEN;
    await nextTick();

    expect(enabled).toEqual([true, false]);
    expect(visibility).toEqual([DisplayMode.FULL, DisplayMode.HIDDEN]);
  });
});

describe('the value object a group hands out', () => {
  it('is frozen, so a layer that renders it cannot write into what the group reports', () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const value = group.value!;

    expect(Object.isFrozen(value)).toBe(true);
    expect(group.value).toBe(value);
  });

  it('is a new object for every change, so an effect comparing identity sees each one', async () => {
    const group = new Group({ a: new Field({ value: 1 }), b: new Field({ value: 2 }) });
    const runs = track(() => group.value);

    group.fields.a.value = 9;
    await nextTick();

    group.fields.b.value = 8;
    await nextTick();

    expect(runs).toEqual([
      { a: 1, b: 2 },
      { a: 9, b: 2 },
      { a: 9, b: 8 },
    ]);
    expect(new Set(runs).size).toBe(3);
    expect(runs.every((value) => Object.isFrozen(value))).toBe(true);
  });
});
