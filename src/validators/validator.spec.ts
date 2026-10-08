import { vi } from 'vitest';
import { toRaw } from 'vue';

import { Field } from '../field';

import { ValidationError } from './validation-error';
import { ValidationErrorOptions, ValidationFunction, Validator } from './validator';

import { Validators } from '.';

describe('Validator', () => {
  it('adds validation errors to field.errors', () => {
    // Arrange
    const field = new Field();
    field.validate = vi.fn();

    const validationFn: ValidationFunction = () => [new ValidationError('invalid', {}, 'Error message')];
    const validator = new Validator(validationFn);

    // Act
    validator.execute(field, vi.fn(), 'new', 'old');

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationError);
    expect((field.errors[0] as ValidationError).detail).toBe('Error message');
    expect(field.validate).toHaveBeenCalled();
  });

  it('removes previous errors from the same validator', () => {
    // Arrange
    const existingError = new ValidationError('invalid', {}, 'Existing error');

    const validationFn: ValidationFunction = (newValue) => {
      if (newValue === 'old') return [new ValidationError('invalid', {}, 'New error')];
      return null;
    };
    const validator = new Validator(validationFn);
    const field = new Field({ errors: [existingError], validators: [validator] });

    // Act - First execution adds the error
    field.value = 'old';
    // Assert - Should have both errors
    expect(field.errors.length).toBe(2);

    field.value = 'new';
    // Assert - Should only have the original error left
    expect(field.errors.length).toBe(1);
    expect(toRaw(field.errors[0])).toBe(existingError);
  });

  it('continues the action chain by calling supr', () => {
    // Arrange
    const field = new Field();
    field.validate = vi.fn();

    const validationFn: ValidationFunction = () => null; // No errors
    const validator = new Validator(validationFn);

    const mockSupr = vi.fn();

    // Act
    validator.execute(field, mockSupr, 'new', 'old');

    // Assert
    expect(mockSupr).toHaveBeenCalledWith(expect.anything(), 'new', 'old');
    expect(mockSupr.mock.calls[0][0]).toBe(field);
  });

  it('substitutes params into the detail of the error it builds', () => {
    class TestValidator extends Validator {
      constructor(options?: ValidationErrorOptions) {
        super((newValue, oldValue) => [
          this.errorFor(options, 'test', 'New: {newValue}, Old: {oldValue}', { newValue, oldValue }),
        ]);
      }
    }
    const field = new Field();
    field.validate = vi.fn();

    new TestValidator().execute(field, vi.fn(), 'new-value', 'old-value');

    expect(field.errors[0].code).toBe('test');
    expect(field.errors[0].detail).toBe('New: new-value, Old: old-value');
    expect(field.errors[0].params).toEqual({ newValue: 'new-value', oldValue: 'old-value' });
  });

  it('states the code and the detail the options give, with params substituted into the detail', () => {
    class TestValidator extends Validator {
      constructor(options?: ValidationErrorOptions) {
        super((newValue) => [this.errorFor(options, 'test', 'Default', { newValue })]);
      }
    }
    const field = new Field();
    field.validate = vi.fn();

    new TestValidator({ code: 'custom', detail: 'Got {newValue}, {unknown} stays' }).execute(field, vi.fn(), 'a', '');

    expect(field.errors[0].code).toBe('custom');
    expect(field.errors[0].detail).toBe('Got a, {unknown} stays');
  });

  it('creates validator with field instance instead of mock', () => {
    // Create a field with a validator directly
    const validationFn: ValidationFunction = (newValue) =>
      newValue === 'invalid' ? [new ValidationError('invalid', {}, 'Invalid value')] : null;

    const field = new Field({
      value: 'valid',
      validators: [new Validator(validationFn)],
    });

    // Initially should be valid
    expect(field.errors.length).toBe(0);

    // Change to invalid value
    field.value = 'invalid';

    // Should have error
    expect(field.errors.length).toBe(1);
    expect((field.errors[0] as ValidationError).detail).toBe('Invalid value');

    // Change back to valid
    field.value = 'valid';

    // Error should be removed
    expect(field.errors.length).toBe(0);
  });
});

describe('Shared ValidationError', () => {
  const failWith = (errors: ValidationError[]) => new Validator((newValue) => (newValue === 'bad' ? errors : null));

  it('accepts one error instance produced by two validators of the same field', () => {
    const shared = new ValidationError('invalid', {}, 'Shared error');

    const build = () =>
      new Field({
        value: 'x',
        validators: [new Validator(() => [shared]), new Validator(() => [shared])],
      });

    expect(build).not.toThrow();
    // each of the two validators reports a failure, so the field holds one error per validator
    expect(build().errors.length).toBe(2);
  });

  it('lets both validators withdraw their error when the first field is cleared first', () => {
    const shared = new ValidationError('invalid', {}, 'Shared error');
    const field1 = new Field({ value: 'bad', validators: [failWith([shared])] });
    const field2 = new Field({ value: 'bad', validators: [failWith([shared])] });

    expect(field1.valid).toBe(false);
    expect(field2.valid).toBe(false);

    field1.value = 'ok';
    expect(field1.errors.length).toBe(0);
    expect(field1.valid).toBe(true);
    expect(field2.errors.length).toBe(1);

    field2.value = 'ok';
    expect(field2.errors.length).toBe(0);
    expect(field2.valid).toBe(true);
  });

  it('lets both validators withdraw their error when the second field is cleared first', () => {
    const shared = new ValidationError('invalid', {}, 'Shared error');
    const field1 = new Field({ value: 'bad', validators: [failWith([shared])] });
    const field2 = new Field({ value: 'bad', validators: [failWith([shared])] });

    field2.value = 'ok';
    expect(field2.errors.length).toBe(0);
    expect(field2.valid).toBe(true);
    expect(field1.errors.length).toBe(1);

    field1.value = 'ok';
    expect(field1.errors.length).toBe(0);
    expect(field1.valid).toBe(true);
  });

  it('does not repeat an unchanged error instance returned by the same validator twice', () => {
    const shared = new ValidationError('invalid', {}, 'Shared error');
    const field = new Field({ value: 'bad', validators: [failWith([shared])] });

    expect(field.errors.length).toBe(1);

    field.value = 'also bad';
    field.value = 'bad';

    expect(field.errors.length).toBe(1);
    expect(field.errors[0].detail).toBe('Shared error');
  });

  it('hands a second validator an error equal to the shared instance', () => {
    const shared = new ValidationError('shared', { limit: 3 }, 'Shared text', 'server');

    const field1 = new Field({ value: 'bad', validators: [failWith([shared])] });
    const field2 = new Field({ value: 'bad', validators: [failWith([shared])] });

    expect(field1.errors.length).toBe(1);
    expect(field2.errors[0]).toBeInstanceOf(ValidationError);
    expect(toRaw(field2.errors[0])).not.toBe(shared);
    expect(field2.errors[0].sameAs(shared)).toBe(true);
    expect(field2.errors[0].origin).toBe('server');
  });
});

describe('Async Validator', () => {
  it('handles async validation correctly', async () => {
    const asyncValidator = new Validator(async (newValue: string) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
      if (newValue === 'test@taken.com') {
        return [new ValidationError('invalid', {}, 'Email already taken')];
      }
      return null;
    });

    const field = new Field({
      value: 'initial',
      validators: [asyncValidator],
    });

    // Initially should be valid
    expect(field.valid).toBe(true);
    expect(field.validating).toBe(true); // after initialisation, validators are eagerly executed

    // Wait for promise to resolve
    await vi.waitFor(() => {
      expect(field.validating).toBe(false);
    });
    expect(field.valid).toBe(true);

    // Act - trigger async validation
    field.value = 'test@taken.com';

    // Assert - should be validating
    expect(field.validating).toBe(true);
    expect(field.errors.length).toBe(0); // No errors yet

    // Wait for promise to resolve
    await vi.waitFor(() => {
      expect(field.validating).toBe(false);
    });

    // Should now have error
    expect(field.errors.length).toBe(1);
    expect(field.errors[0].detail).toBe('Email already taken');
    expect(field.valid).toBe(false);

    // Change to valid value
    field.value = 'test@free.com';

    expect(field.validating).toBe(true);
    // Wait for promise to resolve
    await vi.waitFor(() => {
      expect(field.validating).toBe(false);
    });

    // Should clear error and not be validating
    expect(field.validating).toBe(false);
    expect(field.errors.length).toBe(0);
    expect(field.valid).toBe(true);
  });
});

describe('Asynchronous validation', () => {
  it('flags the field as validating while the validation promise is pending', async () => {
    let resolveFn: (result: null) => void = () => {};
    const pending = new Promise<null>((resolve) => {
      resolveFn = resolve;
    });
    const field = new Field({ value: 'a', validators: [new Validator(() => pending)] });

    field.value = 'b';
    expect(field.validating).toBe(true);

    resolveFn(null);
    await pending;
    await Promise.resolve();
    expect(field.validating).toBe(false);
  });
});

describe('Error codes', () => {
  const failWith = (errors: ValidationError[]) => new Validator((newValue) => (newValue === 'bad' ? errors : null));

  it('carries the code a custom validator gives its error', () => {
    const field = new Field({
      value: 'bad',
      validators: [failWith([new ValidationError('not-in-this-country', {}, 'Not allowed here')])],
    });

    expect(field.errors[0].code).toBe('not-in-this-country');
  });

  it('keeps the code on the copy a second validator of the same error instance receives', () => {
    const shared = new ValidationError('shared-code', {}, 'Shared error');
    const field1 = new Field({ value: 'bad', validators: [failWith([shared])] });
    const field2 = new Field({ value: 'bad', validators: [failWith([shared])] });

    // the second validator owns a copy of the instance the first one claimed, and the copy answers the same code
    expect(field2.errors[0]).not.toBe(field1.errors[0]);
    expect(field1.errors[0].code).toBe('shared-code');
    expect(field2.errors[0].code).toBe('shared-code');
  });
});

describe('the error instance a re-run leaves standing', () => {
  it('keeps the instance where the re-run produces an equal error', () => {
    const shared = new ValidationError('invalid', {}, 'Invalid');
    const field = new Field({ value: 'bad', validators: [new Validator(() => [shared])] });
    const first = field.errors[0];

    field.value = 'worse';

    expect(field.errors).toHaveLength(1);
    expect(field.errors[0]).toBe(first);
  });

  it('replaces it where the params change, so the params state the value the field holds', () => {
    const field = new Field({ value: 'ab', validators: [new Validators.MinLength(5)] });
    const first = field.errors[0];

    field.value = 'abc';

    expect(field.errors).toHaveLength(1);
    expect(field.errors[0]).not.toBe(first);
    expect(field.errors[0].params.newValue).toBe('abc');
  });
});
