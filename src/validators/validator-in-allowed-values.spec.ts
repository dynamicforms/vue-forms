import { describe, expect, it } from 'vitest';
import { unref } from 'vue';

import { Field } from '../field';

import { ValidationErrorRenderContent } from './validation-error';
import InAllowedValues from './validator-in-allowed-values';

describe('InAllowedValues Validator', () => {
  it('returns error when value is not in allowed values (string)', () => {
    const allowedValues = ['red', 'green', 'blue'];

    const field = Field.create({
      value: 'yellow',
      validators: [new InAllowedValues(allowedValues)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns error when value is not in allowed values (number)', () => {
    const allowedValues = [1, 2, 3, 5, 8, 13];

    const field = Field.create({
      value: 4,
      validators: [new InAllowedValues(allowedValues)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns no error when value is in allowed values', () => {
    const allowedValues = ['red', 'green', 'blue'];

    const field = Field.create({
      value: 'green',
      validators: [new InAllowedValues(allowedValues)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('handles reactive values correctly', () => {
    const allowedValues = ['red', 'green', 'blue'];
    const validator = new InAllowedValues(allowedValues);

    // Create field with reactive value
    const field = Field.create({
      value: 'red',
      validators: [validator],
    });

    // Initially should be valid
    expect(field.errors.length).toBe(0);

    // Change to invalid value
    field.value = 'yellow';

    // Should have error
    expect(field.errors.length).toBe(1);

    // Change back to valid value
    field.value = 'blue';

    // Should be valid again
    expect(field.errors.length).toBe(0);
  });

  it('truncates long list of allowed values in error message', () => {
    // Create a long list of allowed values
    const allowedValues = Array.from({ length: 30 }, (_, i) => `item-${i}`);

    const field = Field.create({
      value: 'not-in-list',
      validators: [new InAllowedValues(allowedValues)],
    });

    // Assert
    expect(field.errors.length).toBe(1);

    // Check that the error message contains truncated text
    console.log(field.errors[0].componentName, field.errors[0].componentBody, field.errors[0].componentBindings);
    const errorContentText = (unref(field.errors[0]) as ValidationErrorRenderContent).componentBindings.source;
    expect(errorContentText).toContain('...');
    expect(errorContentText).toContain('30 items total');
  });

  it('uses custom error message', () => {
    const allowedValues = ['admin', 'user', 'guest'];
    const customMessage = 'Invalid role selected';

    const field = Field.create({
      value: 'superuser',
      validators: [new InAllowedValues(allowedValues, customMessage)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    const errorText = (unref(field.errors[0]) as ValidationErrorRenderContent).componentBody;
    expect(errorText).toBe(customMessage);
  });
});
