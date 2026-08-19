import { vi } from 'vitest';

import { Field } from '../field';
import { Group } from '../group';
import { List } from '../list';
import { transaction } from '../transaction';

import { ValidationError, ValidationErrorRenderContent, ValidationErrorText } from './validation-error';
import { ValidationFunctionResult, Validator } from './validator';

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const settled = (field: Field) =>
  vi.waitFor(() => {
    expect(field.validating).toBe(false);
  });

/** the text an error renders, whichever of the two error classes carries it */
const messageOf = (error: ValidationError) =>
  error instanceof ValidationErrorRenderContent ? String(error.resolvedText) : error.componentBody;

/** a remote check: 'bad' is refused, 'unreachable' cannot be reached, anything else is accepted */
const remoteCheck = () =>
  new Validator(async (newValue: string) => {
    if (newValue === 'unreachable') throw new Error('validation service is down');
    return newValue === 'bad' ? [new ValidationErrorText('bad value')] : null;
  });

describe('Asynchronous validation sequencing', () => {
  it('keeps the verdict of the run that started last, however long the earlier one takes', async () => {
    const validator = new Validator(async (newValue: string) => {
      await delay(newValue === 'bad' ? 40 : 1);
      return newValue === 'bad' ? [new ValidationErrorText('bad value')] : null;
    });
    const field = new Field({ value: 'initial', validators: [validator] });
    await settled(field);

    field.value = 'bad';
    field.value = 'good';

    await settled(field);

    expect(field.errors.length).toBe(0);
    expect(field.valid).toBe(true);
    expect(field.validating).toBe(false);
  });

  it('lets a synchronous verdict invalidate an asynchronous run started before it', async () => {
    const validator = new Validator((newValue: string) => {
      if (newValue === 'bad') return delay(20).then(() => [new ValidationErrorText('bad value')]);
      return null;
    });
    const field = new Field({ value: 'initial', validators: [validator] });

    field.value = 'bad';
    expect(field.validating).toBe(true);

    field.value = 'good';
    expect(field.errors.length).toBe(0);

    await settled(field);

    expect(field.errors.length).toBe(0);
    expect(field.valid).toBe(true);
  });

  it('replaces its errors with the failure error and reports the reason once when the promise rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const field = new Field({ value: 'initial', validators: [remoteCheck()] });
    await settled(field);

    field.value = 'bad';
    await settled(field);
    expect(field.errors.length).toBe(1);

    field.value = 'unreachable';
    await settled(field);

    expect(field.errors.length).toBe(1);
    expect(messageOf(field.errors[0])).toBe('Validation could not be completed');
    expect(field.valid).toBe(false);
    expect(field.validating).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('withdraws the failure error when the same validator next completes successfully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const field = new Field({ value: 'unreachable', validators: [remoteCheck()] });
    await settled(field);
    expect(field.valid).toBe(false);

    field.value = 'good';
    await settled(field);

    expect(field.errors.length).toBe(0);
    expect(field.valid).toBe(true);
    expect(field.validating).toBe(false);
    consoleError.mockRestore();
  });

  it('leaves the newer verdict untouched and logs nothing when a superseded run rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectFn: (reason: unknown) => void = () => {};
    const unreachable = new Promise<ValidationFunctionResult>((_resolve, reject) => {
      rejectFn = reject;
    });
    const validator = new Validator((newValue: string) => {
      if (newValue === 'unreachable') return unreachable;
      return Promise.resolve(newValue === 'bad' ? [new ValidationErrorText('bad value')] : null);
    });
    const field = new Field({ value: 'initial', validators: [validator] });
    await settled(field);

    field.value = 'unreachable';
    field.value = 'bad';
    await vi.waitFor(() => {
      expect(field.errors.length).toBe(1);
    });

    rejectFn(new Error('validation service is down'));
    await settled(field);

    expect(field.errors.length).toBe(1);
    expect(messageOf(field.errors[0])).toBe('bad value');
    expect(field.valid).toBe(false);
    expect(field.validating).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('discards a validation that is still in flight when clearValidators is called', async () => {
    let resolveFn: (result: ValidationFunctionResult) => void = () => {};
    const pending = new Promise<ValidationFunctionResult>((resolve) => {
      resolveFn = resolve;
    });
    const field = new Field({ value: 'a', validators: [new Validator(() => pending)] });
    expect(field.validating).toBe(true);

    field.clearValidators();
    resolveFn([new ValidationErrorText('arrived too late')]);
    await settled(field);

    expect(field.errors.length).toBe(0);
    expect(field.valid).toBe(true);
    expect(field.validating).toBe(false);
  });

  it('keeps the failure error off a field whose validators were cleared mid-flight', async () => {
    let reject: (reason: Error) => void = () => {};
    const validator = new Validator(
      () =>
        new Promise<ValidationFunctionResult>((_resolve, rej) => {
          reject = rej;
        }),
    );
    const field = new Field({ value: 'x', validators: [validator] });
    expect(field.validating).toBe(true);

    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    field.clearValidators();
    reject(new Error('validation service is down'));
    await settled(field);

    expect(field.errors).toEqual([]);
    expect(field.valid).toBe(true);
    expect(field.validating).toBe(false);
    expect(reported).not.toHaveBeenCalled();
    reported.mockRestore();
  });
});

describe('Cancellation of asynchronous validation', () => {
  /** a validator that records the signal of every run and answers after `ms` */
  const recording = (signals: AbortSignal[], ms = 5) =>
    new Validator(async (newValue: unknown, oldValue: unknown, field: unknown, signal: AbortSignal) => {
      signals.push(signal);
      await delay(ms);
      return null;
    });

  it('leaves the signal of a run whose verdict still counts alone', async () => {
    const signals: AbortSignal[] = [];
    const field = new Field({ value: 'a', validators: [recording(signals)] });
    await settled(field);

    expect(signals.length).toBe(1);
    expect(signals[0].aborted).toBe(false);
  });

  it('aborts the signal of a run a newer one supersedes', async () => {
    const signals: AbortSignal[] = [];
    const field = new Field({ value: 'a', validators: [recording(signals)] });

    field.value = 'b';

    expect(signals.length).toBe(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    await settled(field);
    expect(signals[1].aborted).toBe(false);
  });

  it('aborts the signal of a run in flight when the validators are cleared', async () => {
    const signals: AbortSignal[] = [];
    const field = new Field({ value: 'a', validators: [recording(signals)] });

    field.clearValidators();

    expect(signals[0].aborted).toBe(true);
    await settled(field);
  });

  it('aborts the signal of a run in flight when the validator is unregistered', async () => {
    const signals: AbortSignal[] = [];
    const validator = recording(signals);
    const field = new Field({ value: 'a', validators: [validator] });

    field.unregisterAction(validator);

    expect(signals[0].aborted).toBe(true);
    await settled(field);
  });

  it('aborts the signal of a run started in a transaction that is rolled back', async () => {
    const signals: AbortSignal[] = [];
    const field = new Field({ value: 'a', validators: [recording(signals)] });
    await settled(field);

    transaction((tx) => {
      field.value = 'b';
      tx.rollback();
    });

    expect(signals.length).toBe(2);
    expect(signals[1].aborted).toBe(true);
    await settled(field);
  });

  it('lets a validator refuse to reach a verdict on an aborted run', async () => {
    const validator = new Validator(
      (newValue: string, oldValue: string, field: unknown, signal: AbortSignal) =>
        new Promise<ValidationFunctionResult>((resolve, reject) => {
          const timer = setTimeout(() => resolve([new ValidationErrorText(`${newValue} is refused`)]), 20);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason);
          });
        }),
    );
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    const field = new Field({ value: 'first', validators: [validator] });

    field.value = 'second';
    await settled(field);

    // the abandoned run rejects, and a run that no longer counts says nothing: neither its error nor a report
    expect(field.errors.length).toBe(1);
    expect(messageOf(field.errors[0])).toBe('second is refused');
    expect(reported).not.toHaveBeenCalled();
    reported.mockRestore();
  });
});

describe('Runs in flight where the form the field stands in changes under them', () => {
  /** a validator that records the signal of every run and answers after `ms` */
  const recording = (signals: AbortSignal[], ms = 5) =>
    new Validator(async (newValue: unknown, oldValue: unknown, field: unknown, signal: AbortSignal) => {
      signals.push(signal);
      await delay(ms);
      return null;
    });

  it('lets a removed row finish its run on its own, and takes it off the list at once', async () => {
    const list = new List(new Group({ cell: new Field({ value: 'a', validators: [remoteCheck()] }) }));
    const form = new Group({ list });
    list.push({ cell: 'bad' });
    const row = list.get(0)!;

    expect(form.validating).toBe(true);

    const removed = list.remove(0)!;

    // the run belongs to the row, and the row is no longer part of the form
    expect(form.validating).toBe(false);
    expect(list.validating).toBe(false);
    expect(removed.validating).toBe(true);

    await vi.waitFor(() => {
      expect(removed.validating).toBe(false);
    });

    // the row still holds the validator that was running, so the verdict lands where the run started
    expect(row.field('cell')!.errors.length).toBe(1);
    expect(form.validating).toBe(false);
    expect(form.valid).toBe(true);
  });

  it('leaves no run behind on a group whose addField is rolled back', async () => {
    const signals: AbortSignal[] = [];
    const group = new Group({ a: new Field({ value: 1 }) });
    const late = new Field({ value: 'x' });

    transaction((tx) => {
      group.addField('late', late);
      // the validator is registered inside the transaction, so its eager run starts while the group holds the field
      late.registerAction(recording(signals));
      expect(group.validating).toBe(true);
      tx.rollback();
    });

    // the field is out of the group again and takes the run with it; a rollback cannot un-start a run, so the
    // group would answer busy for good if it kept counting one it no longer holds
    expect(group.validating).toBe(false);
    expect(late.validating).toBe(true);

    await vi.waitFor(() => {
      expect(late.validating).toBe(false);
    });
    expect(group.validating).toBe(false);
  });

  it('lets a run reach its verdict where a rolled-back transaction takes its cancellation back', async () => {
    const validator = new Validator(
      (newValue: string, oldValue: string, field: unknown, signal: AbortSignal) =>
        new Promise<ValidationFunctionResult>((resolve, reject) => {
          const timer = setTimeout(() => resolve([new ValidationErrorText('bad value')]), 20);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason);
          });
        }),
    );
    const field = new Field({ value: 'bad', validators: [validator] });

    transaction((tx) => {
      field.clearValidators();
      tx.rollback();
    });

    await settled(field);

    // the transaction never happened, so neither did the cancellation: the field still carries the validator, and
    // a field left reporting itself valid over a value nothing checked would let a submit through on it
    expect(field.errors.length).toBe(1);
    expect(field.valid).toBe(false);
  });

  it('leaves the validator running where a rolled-back transaction takes its unregistration back', async () => {
    const signals: AbortSignal[] = [];
    const validator = recording(signals);
    const field = new Field({ value: 'a', validators: [validator] });

    transaction((tx) => {
      field.unregisterAction(validator);
      tx.rollback();
    });

    expect(signals[0].aborted).toBe(false);
    await settled(field);

    field.value = 'b';
    expect(signals.length).toBe(2);
    await settled(field);
  });
});
