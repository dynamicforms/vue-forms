import { describe, expect, it } from 'vitest';
import { unref } from 'vue';

import { Field } from '../field';

import { ValidationErrorRenderContent } from './validation-error';
import Required from './validator-required';

describe('Required Validator', () => {
  it('returns error when value is empty', async () => {
    // Test with different empty values
    const emptyValues = [
      '', // empty string
      null,
      undefined,
      [], // empty array
      {}, // empty object
    ];

    for (const emptyValue of emptyValues) {
      // Arrange - create a new field for each test case
      const field = Field.create({
        value: emptyValue,
        validators: [new Required()],
      });

      // Assert
      expect(field.errors.length).toBe(1);
      expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
    }
  });

  it('returns no error when value is not empty', async () => {
    // Test with different non-empty values
    const nonEmptyValues = [
      'value',
      0, // 0 is not empty
      false, // false is not empty
      [1, 2], // non-empty array
      { key: 'value' }, // non-empty object
    ];

    for (const nonEmptyValue of nonEmptyValues) {
      // Arrange - create a new field for each test case
      const field = Field.create({
        value: nonEmptyValue,
        validators: [new Required()],
      });

      // Act - validation happens on field creation

      // Assert
      expect(field.errors.length).toBe(0);
    }
  });

  it('uses custom error message', async () => {
    // Arrange
    const customMessage = 'This field is required!';
    const field = Field.create({
      value: '',
      validators: [new Required(customMessage)],
    });

    // Act - validation happens on field creation

    // Assert
    expect(field.errors.length).toBe(1);

    // @ts-ignore
    const errorText = unref((field.errors[0] as ValidationErrorRenderContent).text);
    expect(errorText).toBe(customMessage);
  });
});
