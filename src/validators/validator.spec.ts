import { vi } from 'vitest';
import { ref } from 'vue';

import { Field } from '../field';

import { MdString, ValidationError, ValidationErrorRenderContent, ValidationErrorText } from './validation-error';
import { ValidationFunction, Validator } from './validator';
import Required from './validator-required';

import { Validators } from '.';

describe('Validator', () => {
  it('adds validation errors to field.errors', () => {
    // Arrange
    const field = new Field();
    field.validate = vi.fn();

    const validationFn: ValidationFunction = () => [new ValidationErrorText('Error message')];
    const validator = new Validator(validationFn);

    // Act
    validator.execute(field, vi.fn(), 'new', 'old');

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorText);
    expect((field.errors[0] as ValidationErrorText).text).toBe('Error message');
    expect(field.validate).toHaveBeenCalled();
  });

  it('removes previous errors from the same validator', () => {
    // Arrange
    const existingError = new ValidationErrorText('Existing error');

    const validationFn: ValidationFunction = (newValue) => {
      if (newValue === 'old') return [new ValidationErrorText('New error')];
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
    expect(field.errors[0]).toStrictEqual(existingError);
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

  it('replaces placeholders in error messages', () => {
    // Arrange
    const field = new Field();
    field.validate = vi.fn();

    // Create a custom validator with a validation function that uses replacePlaceholders
    class TestValidator extends Validator {
      constructor() {
        super(() => {
          const errorText = this.replacePlaceholders('New: {newValue}, Old: {oldValue}', {
            newValue: 'new-value',
            oldValue: 'old-value',
          });
          return [new ValidationErrorText(errorText as string)];
        });
      }

      // Expose protected method for testing
      public testReplacePlaceholders(text: string, replace: Record<string, any>): string {
        return this.replacePlaceholders(text, replace) as string;
      }
    }

    const validator = new TestValidator();

    // Act
    validator.execute(field, vi.fn(), 'new-value', 'old-value');

    // Assert
    expect(field.errors.length).toBe(1);
    expect((field.errors[0] as ValidationErrorText).text).toBe('New: new-value, Old: old-value');
  });

  it('properly replaces placeholders with direct method call', () => {
    // Create validator with exposed replacement method
    class TestValidator extends Validator {
      constructor() {
        super(() => null);
      }

      // Expose protected method for testing
      public testReplacePlaceholders(text: string, replace: Record<string, any>): string {
        return this.replacePlaceholders(text, replace) as string;
      }
    }

    const validator = new TestValidator();

    // Test replacement
    const result = validator.testReplacePlaceholders('Name: {name}, Age: {age}, Value: {value}', {
      name: 'John',
      age: 30,
      value: 'test',
    });

    expect(result).toBe('Name: John, Age: 30, Value: test');
  });

  it('renders an element named as a placeholder by its class', () => {
    class TestValidator extends Validator {
      constructor() {
        super(() => null);
      }

      public testReplacePlaceholders(text: string, replace: Record<string, any>): string {
        return this.replacePlaceholders(text, replace) as string;
      }
    }

    const validator = new TestValidator();
    const field = new Field({ value: 'x' });

    // every built-in validator hands the element it ran over in as {field}
    expect(validator.testReplacePlaceholders('Value: {newValue}', { newValue: 'a', field })).toBe('Value: a');
    // a message that names it reads the element's tag, which is its class rather than the bare object
    expect(validator.testReplacePlaceholders('On {field}', { newValue: 'a', field })).toBe('On [object Field]');
  });
  it('creates validator with field instance instead of mock', () => {
    // Create a field with a validator directly
    const validationFn: ValidationFunction = (newValue) =>
      newValue === 'invalid' ? [new ValidationErrorText('Invalid value')] : null;

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
    expect((field.errors[0] as ValidationErrorText).text).toBe('Invalid value');

    // Change back to valid
    field.value = 'valid';

    // Error should be removed
    expect(field.errors.length).toBe(0);
  });
});

describe('Shared ValidationError', () => {
  const failWith = (errors: ValidationError[]) => new Validator((newValue) => (newValue === 'bad' ? errors : null));

  it('accepts one error instance produced by two validators of the same field', () => {
    const shared = new ValidationErrorText('Shared error');

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
    const shared = new ValidationErrorText('Shared error');
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
    const shared = new ValidationErrorText('Shared error');
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
    const shared = new ValidationErrorText('Shared error');
    const field = new Field({ value: 'bad', validators: [failWith([shared])] });

    expect(field.errors.length).toBe(1);

    field.value = 'also bad';
    field.value = 'bad';

    expect(field.errors.length).toBe(1);
    expect(field.errors[0].componentBody).toBe('Shared error');
  });

  it('renders the error a second validator receives exactly like the shared instance', () => {
    const options = { html: true };
    const plugins = [{ name: 'plugin' }];
    const text = new ValidationErrorText('Shared text', 'text-class');
    const content = new ValidationErrorRenderContent(new MdString('**shared**', options, plugins), 'content-class');
    const shared = [text, content];

    const field1 = new Field({ value: 'bad', validators: [failWith(shared)] });
    const field2 = new Field({ value: 'bad', validators: [failWith(shared)] });

    expect(field1.errors.length).toBe(2);
    expect(field2.errors.length).toBe(2);
    expect(field2.errors[0]).toBeInstanceOf(ValidationErrorText);
    expect(field2.errors[1]).toBeInstanceOf(ValidationErrorRenderContent);

    [text, content].forEach((original, idx) => {
      expect(field2.errors[idx].componentName).toBe(original.componentName);
      expect(field2.errors[idx].componentBody).toBe(original.componentBody);
      expect(field2.errors[idx].componentBindings).toEqual(original.componentBindings);
      expect(field2.errors[idx].extraClasses).toBe(original.extraClasses);
    });
  });
});

describe('Reference messages', () => {
  it('resolves a Ref message on read, so a changed reference changes the message', () => {
    const message = ref('Please enter a value');
    const field = new Field({ value: '', validators: [new Required(message)] });

    expect(field.errors.length).toBe(1);
    expect(field.errors[0].componentBody).toBe('Please enter a value');

    message.value = 'A value is required';

    expect(field.errors[0].componentBody).toBe('A value is required');
  });

  it('keeps a Ref of MdString markdown, with its options and plugins', () => {
    const plugins = [{ name: 'plugin' }];
    const options = { html: true };
    const message = ref(new MdString('**{newValue}** is not enough', options, plugins));
    const field = new Field({ value: '', validators: [new Required(message)] });

    expect(field.errors[0].componentName).toBe('vue-markdown');
    expect(field.errors[0].componentBindings).toEqual({ source: '**** is not enough', options, plugins });

    message.value = new MdString('_{newValue}_ is too short', options, plugins);

    expect(field.errors[0].componentBindings).toEqual({ source: '__ is too short', options, plugins });
  });
});

describe('Async Validator', () => {
  it('handles async validation correctly', async () => {
    const asyncValidator = new Validator(async (newValue: string) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
      if (newValue === 'test@taken.com') {
        return [new ValidationErrorText('Email already taken')];
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
    expect(field.errors[0].componentBody).toBe('Email already taken');
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
      validators: [failWith([new ValidationErrorText('Not allowed here', '', 'not-in-this-country')])],
    });

    expect(field.errors[0].code).toBe('not-in-this-country');
  });

  it('leaves the code undefined on an error built without one', () => {
    expect(new ValidationErrorText('Plain').code).toBeUndefined();
    expect(new ValidationErrorRenderContent('Plain').code).toBeUndefined();
    expect(new ValidationError().code).toBeUndefined();
  });

  it('keeps the code on the copy a second validator of the same error instance receives', () => {
    const shared = new ValidationErrorText('Shared error', '', 'shared-code');
    const field1 = new Field({ value: 'bad', validators: [failWith([shared])] });
    const field2 = new Field({ value: 'bad', validators: [failWith([shared])] });

    // the second validator owns a copy of the instance the first one claimed, and the copy answers the same code
    expect(field2.errors[0]).not.toBe(field1.errors[0]);
    expect(field1.errors[0].code).toBe('shared-code');
    expect(field2.errors[0].code).toBe('shared-code');
  });
});

describe('the error instance a re-run leaves standing', () => {
  it('keeps the instance where the message it produces is the one already there', () => {
    const field = new Field({ value: '', validators: [new Required()] });
    const first = field.errors[0];
    expect(field.valid).toBe(false);

    // still empty once trimmed, so the same rule fails again with the same message
    field.value = '   ';

    expect(field.valid).toBe(false);
    expect(field.errors).toHaveLength(1);
    // the field holds the error it already held: an equal error is not a new error, and nothing re-renders
    expect(field.errors[0]).toBe(first);
  });

  it('replaces it where the message changes', () => {
    const min = 5;
    const field = new Field({ value: 'ab', validators: [new Validators.MinLength(min)] });
    const first = field.errors[0];

    field.value = 'abc';
    // the message names the length it wants rather than the value it got, so it does not move
    expect(field.errors[0]).toBe(first);

    field.value = 'abcde';
    expect(field.valid).toBe(true);
    field.value = 'a';
    // the error was withdrawn in between, so what stands now is a fresh one
    expect(field.errors[0]).not.toBe(first);
  });
});
