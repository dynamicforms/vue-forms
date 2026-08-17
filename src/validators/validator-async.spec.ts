import { vi } from 'vitest';

import { Field } from '../field';

import { ValidationErrorText } from './validation-error';
import { ValidationFunctionResult, Validator } from './validator';

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const settled = (field: Field) =>
  vi.waitFor(() => {
    expect(field.validating).toBe(false);
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

  it('withdraws its errors and reports the reason once when the validation promise rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const validator = new Validator(async (newValue: string) => {
      if (newValue === 'unreachable') throw new Error('validation service is down');
      return newValue === 'bad' ? [new ValidationErrorText('bad value')] : null;
    });
    const field = new Field({ value: 'initial', validators: [validator] });
    await settled(field);

    field.value = 'bad';
    await settled(field);
    expect(field.errors.length).toBe(1);

    field.value = 'unreachable';
    await settled(field);

    expect(field.errors.length).toBe(0);
    expect(field.valid).toBe(true);
    expect(consoleError).toHaveBeenCalledTimes(1);
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
});
