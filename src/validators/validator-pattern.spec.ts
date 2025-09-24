import { describe, expect, it } from 'vitest';
import { unref } from 'vue';

import { Field } from '../field';

import { ValidationErrorRenderContent } from './validation-error';
import Pattern from './validator-pattern';

describe('Pattern Validator', () => {
  it('returns error when value does not match pattern', () => {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    const invalidValues = [
      'not-an-email',
      'missing@domain',
      '@missing-username.com',
      'invalid@domain.',
      'spaces in@email.com',
    ];

    for (const invalidValue of invalidValues) {
      // Arrange - create a new field for each test case
      const field = Field.create({
        value: invalidValue,
        validators: [new Pattern(emailPattern)],
      });

      // Act - validation happens on field creation

      // Assert
      expect(field.errors.length).toBe(1);
      expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
    }
  });

  it('returns no error when value matches pattern', () => {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    const validValues = [
      'valid@example.com',
      'user.name@domain.co.uk',
      'first-last@company.org',
      'username123@sub.domain.com',
    ];

    for (const validValue of validValues) {
      // Arrange - create a new field for each test case
      const field = Field.create({
        value: validValue,
        validators: [new Pattern(emailPattern)],
      });

      // Act - validation happens on field creation

      // Assert
      expect(field.errors.length).toBe(0);
    }
  });

  it('properly converts non-string values to strings', () => {
    const numberPattern = /^[0-9]+$/;

    // Test with valid number value
    const field1 = Field.create({
      value: 12345,
      validators: [new Pattern(numberPattern)],
    });

    // Assert
    expect(field1.errors.length).toBe(0);

    // Test with another number that doesn't match pattern as a string
    const field2 = Field.create({
      value: 123.45,
      validators: [new Pattern(numberPattern)],
    });

    // Assert
    expect(field2.errors.length).toBe(1);
  });

  it('uses custom error message', () => {
    const pattern = /^[A-Z]+$/;
    const customMessage = 'Only uppercase letters allowed';

    const field = Field.create({
      value: 'lowercase',
      validators: [new Pattern(pattern, customMessage)],
    });

    // Assert
    expect(field.errors.length).toBe(1);

    // @ts-expect-error text is private, but we want to use it here internally in the library
    const errorText = unref((field.errors[0] as ValidationErrorRenderContent).text);
    expect(errorText).toBe(customMessage);
  });
});
