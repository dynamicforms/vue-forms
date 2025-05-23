import { describe, expect, it } from 'vitest';

import { Field } from '../field';

import { Validators, ValidationErrorRenderContent } from '.';

describe('MinLength Validator', () => {
  it('returns error when string length is less than minimum', () => {
    const minLength = 5;

    const field = Field.create({
      value: 'abc',
      validators: [new Validators.MinLength(minLength)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns error when array length is less than minimum', () => {
    const minLength = 3;

    const field = Field.create({
      value: [1, 2],
      validators: [new Validators.MinLength(minLength)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns error when object keys length is less than minimum', () => {
    const minLength = 3;

    const field = Field.create({
      value: { a: 1, b: 2 },
      validators: [new Validators.MinLength(minLength)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns no error when length equals minimum', () => {
    const minLength = 3;

    // Test with string
    const fieldString = Field.create({
      value: 'abc',
      validators: [new Validators.MinLength(minLength)],
    });
    expect(fieldString.errors.length).toBe(0);

    // Test with array
    const fieldArray = Field.create({
      value: [1, 2, 3],
      validators: [new Validators.MinLength(minLength)],
    });
    expect(fieldArray.errors.length).toBe(0);

    // Test with object
    const fieldObject = Field.create({
      value: { a: 1, b: 2, c: 3 },
      validators: [new Validators.MinLength(minLength)],
    });
    expect(fieldObject.errors.length).toBe(0);
  });

  it('returns no error when length is greater than minimum', () => {
    const minLength = 3;

    const field = Field.create({
      value: 'abcdef',
      validators: [new Validators.MinLength(minLength)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('validates when value changes', () => {
    const minLength = 5;

    const field = Field.create({
      value: 'abcdefg',
      validators: [new Validators.MinLength(minLength)],
    });

    // Initially valid
    expect(field.errors.length).toBe(0);

    // Change to invalid value
    field.value = 'abc';

    // Should have error
    expect(field.errors.length).toBe(1);

    // Change back to valid value
    field.value = 'abcdef';

    // Should be valid again
    expect(field.errors.length).toBe(0);
  });
});

describe('MaxLength Validator', () => {
  it('returns error when string length exceeds maximum', () => {
    const maxLength = 5;

    const field = Field.create({
      value: 'abcdefg',
      validators: [new Validators.MaxLength(maxLength)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns error when array length exceeds maximum', () => {
    const maxLength = 3;

    const field = Field.create({
      value: [1, 2, 3, 4],
      validators: [new Validators.MaxLength(maxLength)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns error when object keys length exceeds maximum', () => {
    const maxLength = 2;

    const field = Field.create({
      value: { a: 1, b: 2, c: 3 },
      validators: [new Validators.MaxLength(maxLength)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns no error when length equals maximum', () => {
    const maxLength = 3;

    // Test with string
    const fieldString = Field.create({
      value: 'abc',
      validators: [new Validators.MaxLength(maxLength)],
    });
    expect(fieldString.errors.length).toBe(0);

    // Test with array
    const fieldArray = Field.create({
      value: [1, 2, 3],
      validators: [new Validators.MaxLength(maxLength)],
    });
    expect(fieldArray.errors.length).toBe(0);

    // Test with object
    const fieldObject = Field.create({
      value: { a: 1, b: 2, c: 3 },
      validators: [new Validators.MaxLength(maxLength)],
    });
    expect(fieldObject.errors.length).toBe(0);
  });

  it('returns no error when length is less than maximum', () => {
    const maxLength = 10;

    const field = Field.create({
      value: 'abc',
      validators: [new Validators.MaxLength(maxLength)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });
});

describe('LengthInRange Validator', () => {
  it('returns error when length is below range', () => {
    const minLength = 5;
    const maxLength = 10;

    const field = Field.create({
      value: 'abc',
      validators: [new Validators.LengthInRange(minLength, maxLength)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns error when length exceeds range', () => {
    const minLength = 5;
    const maxLength = 10;

    const field = Field.create({
      value: 'abcdefghijklmnop',
      validators: [new Validators.LengthInRange(minLength, maxLength)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns no error when length is at minimum boundary', () => {
    const minLength = 5;
    const maxLength = 10;

    const field = Field.create({
      value: 'abcde',
      validators: [new Validators.LengthInRange(minLength, maxLength)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('returns no error when length is at maximum boundary', () => {
    const minLength = 5;
    const maxLength = 10;

    const field = Field.create({
      value: 'abcdefghij',
      validators: [new Validators.LengthInRange(minLength, maxLength)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('returns no error when length is within range', () => {
    const minLength = 5;
    const maxLength = 10;

    const field = Field.create({
      value: 'abcdefg',
      validators: [new Validators.LengthInRange(minLength, maxLength)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('works with different types of values', () => {
    const minLength = 2;
    const maxLength = 4;

    // Test array within range
    const fieldArray = Field.create({
      value: [1, 2, 3],
      validators: [new Validators.LengthInRange(minLength, maxLength)],
    });
    expect(fieldArray.errors.length).toBe(0);

    // Test object within range
    const fieldObject = Field.create({
      value: { a: 1, b: 2, c: 3 },
      validators: [new Validators.LengthInRange(minLength, maxLength)],
    });
    expect(fieldObject.errors.length).toBe(0);

    // Test array outside range (too long)
    const fieldTooLong = Field.create({
      value: [1, 2, 3, 4, 5],
      validators: [new Validators.LengthInRange(minLength, maxLength)],
    });
    expect(fieldTooLong.errors.length).toBe(1);
  });

  it('validates when value changes', () => {
    const minLength = 5;
    const maxLength = 10;

    const field = Field.create({
      value: 'abcdef',
      validators: [new Validators.LengthInRange(minLength, maxLength)],
    });

    // Initially valid
    expect(field.errors.length).toBe(0);

    // Change to invalid value (too short)
    field.value = 'abc';
    expect(field.errors.length).toBe(1);

    // Change to invalid value (too long)
    field.value = 'abcdefghijklmnop';
    expect(field.errors.length).toBe(1);

    // Change back to valid value
    field.value = 'abcdefg';
    expect(field.errors.length).toBe(0);
  });
});
