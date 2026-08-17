import { vi } from 'vitest';

import { Field } from '../field';

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
