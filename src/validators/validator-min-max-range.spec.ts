import { describe, expect, it } from 'vitest';

import { Field } from '../field';

import { ValidationErrorRenderContent } from './validation-error';
import { MinValue, MaxValue, ValueInRange } from './validator-min-max-range';

describe('MinValue Validator', () => {
  it('returns error when value is less than minimum', async () => {
    const minValue = 10;

    const field = Field.create<number | undefined>({
      value: 5,
      validators: [new MinValue(minValue)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);

    await field.setValue(undefined);
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns no error when value equals minimum', async () => {
    const minValue = 10;

    const field = Field.create({
      value: 10,
      validators: [new MinValue(minValue)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('returns no error when value is greater than minimum', async () => {
    const minValue = 10;

    const field = Field.create({
      value: 15,
      validators: [new MinValue(minValue)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('validates when value changes', async () => {
    const minValue = 10;

    const field = Field.create({
      value: 15,
      validators: [new MinValue(minValue)],
    });

    // Initially valid
    expect(field.errors.length).toBe(0);

    // Change to invalid value
    field.value = 5;

    // Should have error
    expect(field.errors.length).toBe(1);

    // Change back to valid value
    field.value = 12;

    // Should be valid again
    expect(field.errors.length).toBe(0);
  });
});

describe('MaxValue Validator', () => {
  it('returns error when value is greater than maximum', async () => {
    const maxValue = 10;

    const field = Field.create({
      value: 15,
      validators: [new MaxValue(maxValue)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns no error when value equals maximum', async () => {
    const maxValue = 10;

    const field = Field.create({
      value: 10,
      validators: [new MaxValue(maxValue)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('returns no error when value is less than maximum', async () => {
    const maxValue = 10;

    const field = Field.create({
      value: 5,
      validators: [new MaxValue(maxValue)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });
});

describe('ValueInRange Validator', () => {
  it('returns error when value is outside the range (too low)', async () => {
    const minValue = 10;
    const maxValue = 20;

    const field = Field.create({
      value: 5,
      validators: [new ValueInRange(minValue, maxValue)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns error when value is outside the range (too high)', async () => {
    const minValue = 10;
    const maxValue = 20;

    const field = Field.create({
      value: 25,
      validators: [new ValueInRange(minValue, maxValue)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns no error when value is at the minimum boundary', async () => {
    const minValue = 10;
    const maxValue = 20;

    const field = Field.create({
      value: 10,
      validators: [new ValueInRange(minValue, maxValue)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('returns no error when value is at the maximum boundary', async () => {
    const minValue = 10;
    const maxValue = 20;

    const field = Field.create({
      value: 20,
      validators: [new ValueInRange(minValue, maxValue)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('returns no error when value is inside the range', async () => {
    const minValue = 10;
    const maxValue = 20;

    const field = Field.create({
      value: 15,
      validators: [new ValueInRange(minValue, maxValue)],
    });

    // Assert
    expect(field.errors.length).toBe(0);
  });

  it('validates when value changes', async () => {
    const minValue = 10;
    const maxValue = 20;

    const field = Field.create({
      value: 15,
      validators: [new ValueInRange(minValue, maxValue)],
    });

    // Initially valid
    expect(field.errors.length).toBe(0);

    // Change to invalid value (too low)
    field.value = 5;
    expect(field.errors.length).toBe(1);

    // Change to invalid value (too high)
    field.value = 25;
    expect(field.errors.length).toBe(1);

    // Change back to valid value
    field.value = 12;
    expect(field.errors.length).toBe(0);
  });
});
