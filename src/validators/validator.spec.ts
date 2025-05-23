// eslint-disable-next-line max-classes-per-file
import { vi } from 'vitest';

import { Field } from '../field';

import { ValidationErrorText } from './validation-error';
import { ValidationFunction, Validator } from './validator';

describe('Validator', () => {
  it('adds validation errors to field.errors', () => {
    // Arrange
    const field = Field.create();
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
    const field = Field.create({ errors: [existingError], validators: [validator] });

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
    const field = Field.create();
    field.validate = vi.fn();

    const validationFn: ValidationFunction = () => null; // No errors
    const validator = new Validator(validationFn);

    const mockSupr = vi.fn();

    // Act
    validator.execute(field, mockSupr, 'new', 'old');

    // Assert
    expect(mockSupr).toHaveBeenCalledWith(field, 'new', 'old');
  });

  it('replaces placeholders in error messages', () => {
    // Arrange
    const field = Field.create();
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
    const result = validator.testReplacePlaceholders(
      'Name: {name}, Age: {age}, Value: {value}',
      { name: 'John', age: 30, value: 'test' },
    );

    expect(result).toBe('Name: John, Age: 30, Value: test');
  });

  it('creates validator with field instance instead of mock', () => {
    // Create a field with a validator directly
    const validationFn: ValidationFunction =
      (newValue) => (newValue === 'invalid' ? [new ValidationErrorText('Invalid value')] : null);

    const field = Field.create({
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
