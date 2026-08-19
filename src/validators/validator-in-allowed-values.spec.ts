import { describe, expect, it } from 'vitest';
import { ref, unref } from 'vue';

import { Field } from '../field';

import { ValidationErrorRenderContent } from './validation-error';
import InAllowedValues from './validator-in-allowed-values';

describe('InAllowedValues Validator', () => {
  it('returns error when value is not in allowed values (string)', () => {
    const allowedValues = ['red', 'green', 'blue'];

    const field = new Field({
      value: 'yellow',
      validators: [new InAllowedValues(allowedValues)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns error when value is not in allowed values (number)', () => {
    const allowedValues = [1, 2, 3, 5, 8, 13];

    const field = new Field({
      value: 4,
      validators: [new InAllowedValues(allowedValues)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    expect(field.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);
  });

  it('returns no error when value is in allowed values', () => {
    const allowedValues = ['red', 'green', 'blue'];

    const field = new Field({
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
    const field = new Field({
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

    const field = new Field({
      value: 'not-in-list',
      validators: [new InAllowedValues(allowedValues)],
    });

    // Assert
    expect(field.errors.length).toBe(1);

    // Check that the error message contains truncated text
    const errorContentText = (unref(field.errors[0]) as ValidationErrorRenderContent).componentBindings.source;
    expect(errorContentText).toContain('...');
    expect(errorContentText).toContain('30 items total');
    // the 40 character budget covers the suffix too, so only the first two values survive
    expect(errorContentText).toBe('Must be one of [**item-0, item-1... (30 items total)**]');
  });

  it('uses custom error message', () => {
    const allowedValues = ['admin', 'user', 'guest'];
    const customMessage = 'Invalid role selected';

    const field = new Field({
      value: 'superuser',
      validators: [new InAllowedValues(allowedValues, customMessage)],
    });

    // Assert
    expect(field.errors.length).toBe(1);
    const errorText = (unref(field.errors[0]) as ValidationErrorRenderContent).componentBody;
    expect(errorText).toBe(customMessage);
  });
});

describe('InAllowedValues Validator with a list that arrives later', () => {
  it('measures the value against the list a reference holds at validation time', () => {
    const allowedValues = ref<string[]>([]);
    const field = new Field({ value: 'red', validators: [new InAllowedValues(allowedValues)] });

    // nothing is allowed yet, so nothing passes
    expect(field.errors.length).toBe(1);

    allowedValues.value = ['red', 'green'];
    field.value = 'green';
    expect(field.errors.length).toBe(0);

    field.value = 'blue';
    expect(field.errors.length).toBe(1);
  });

  it('measures the value against the list a callback answers with', () => {
    let allowedValues = ['red'];
    const field = new Field({ value: 'blue', validators: [new InAllowedValues(() => allowedValues)] });

    expect(field.errors.length).toBe(1);

    allowedValues = ['red', 'blue'];
    field.value = 'red';
    field.value = 'blue';
    expect(field.errors.length).toBe(0);
  });

  it('names the list as it stands when the message is built', () => {
    const allowedValues = ref(['red']);
    const field = new Field({ value: 'blue', validators: [new InAllowedValues(allowedValues)] });

    expect((field.errors[0] as ValidationErrorRenderContent).componentBindings.source).toBe('Must be one of [**red**]');

    allowedValues.value = ['red', 'green'];
    field.value = 'yellow';

    expect((field.errors[0] as ValidationErrorRenderContent).componentBindings.source).toBe(
      'Must be one of [**red, green**]',
    );
  });

  it('states the in-allowed-values code on the error it produces', () => {
    const field = new Field({ value: 'blue', validators: [new InAllowedValues(['red'])] });

    expect(field.errors[0].code).toBe('in-allowed-values');
  });
});
