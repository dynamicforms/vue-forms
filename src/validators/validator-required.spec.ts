import { describe, expect, it } from 'vitest';
import { unref } from 'vue';

import { Field } from '../field';

import { ValidationErrorRenderContent } from './validation-error';
import Required from './validator-required';

describe('Required Validator', () => {
  it('returns error when value is empty', () => {
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
      const field = new Field({
        value: emptyValue,
        validators: [new Required()],
      });

      // Assert
      expect(field.errors.length).toBe(1);
      expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
    }
  });

  it('returns no error when value is not empty', () => {
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
      const field = new Field({
        value: nonEmptyValue,
        validators: [new Required()],
      });

      // Act - validation happens on field creation

      // Assert
      expect(field.errors.length).toBe(0);
    }
  });

  it('uses custom error message', () => {
    // Arrange
    const customMessage = 'This field is required!';
    const field = new Field({
      value: '',
      validators: [new Required(customMessage)],
    });

    // Act - validation happens on field creation

    // Assert
    expect(field.errors.length).toBe(1);

    // @ts-expect-error text is private, but we want to use it here internally in the library
    const errorText = unref((field.errors[0] as ValidationErrorRenderContent).text);
    expect(errorText).toBe(customMessage);
  });
});

describe('Required Validator whitespace', () => {
  it('rejects a string of whitespace alone', () => {
    const field = new Field({ value: '   ', validators: [new Required()] });

    expect(field.errors.length).toBe(1);
    expect(field.valid).toBe(false);
  });

  it('accepts a string of whitespace alone where trimming is switched off', () => {
    const field = new Field({ value: '   ', validators: [new Required({ trim: false })] });

    expect(field.errors.length).toBe(0);
    expect(field.valid).toBe(true);
  });

  it('accepts a value that is only surrounded by whitespace', () => {
    const field = new Field({ value: '  a  ', validators: [new Required()] });

    expect(field.errors.length).toBe(0);
  });

  it('leaves values that are not strings alone', () => {
    expect(new Field({ value: 0, validators: [new Required()] }).errors.length).toBe(0);
    expect(new Field({ value: [' '], validators: [new Required()] }).errors.length).toBe(0);
  });

  it('takes the options next to a message', () => {
    const field = new Field({ value: '  ', validators: [new Required('Enter something', { trim: false })] });

    expect(field.errors.length).toBe(0);

    field.value = '';
    expect(field.errors.length).toBe(1);
    expect(field.errors[0].componentBody).toBe('Enter something');
  });

  it('reads a component message as the message rather than as options', () => {
    const field = new Field({ value: '', validators: [new Required({ componentName: 'my-error' })] });

    expect(field.errors.length).toBe(1);
    expect(field.errors[0].componentName).toBe('my-error');
  });

  it('states the required code on the error it produces', () => {
    const field = new Field({ value: '', validators: [new Required()] });

    expect(field.errors[0].code).toBe('required');
  });
});
