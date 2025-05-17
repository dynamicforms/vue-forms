import { describe, expect, it } from 'vitest';
import { unref } from 'vue';

import { Field } from '../field';
import { Group } from '../group';

import { ValidationErrorRenderContent } from './validation-error';
import CompareTo from './validator-compare-to';

describe('CompareTo Validator', () => {
  it('returns error when comparison fails', async () => {
    // Create two fields
    const field1 = Field.create({ value: 'abc' });
    const field2 = Field.create({ value: 'xyz' });

    // Add validator to check for equality
    field1.registerAction(
      new CompareTo(field2, (val1, val2) => val1 === val2, 'Fields must match'),
    );

    // Verify that validator correctly detects mismatch
    expect(field1.errors.length).toBe(1);
    expect(field1.errors[0]).toBeInstanceOf(ValidationErrorRenderContent);

    // When values are equal, there should be no error
    await field1.setValue('xyz');
    expect(field1.errors.length).toBe(0);

    // When changing the second field's value, it should revalidate
    await field2.setValue('123');
    expect(field1.errors.length).toBe(1);
  });

  it('validates with custom comparison function', async () => {
    const numberField = Field.create({ value: 10 });
    const limitField = Field.create({ value: 5 });

    // Check if value is greater than limit
    numberField.registerAction(
      new CompareTo(limitField, (num, limit) => num > limit, 'Value must be greater than limit'),
    );

    // Initial value is valid (10 > 5)
    expect(numberField.errors.length).toBe(0);

    // When setting an invalid value
    await numberField.setValue(3);
    expect(numberField.errors.length).toBe(1);

    // When increasing the limit, it becomes invalid
    await limitField.setValue(15);
    expect(numberField.errors.length).toBe(1);

    // When setting a valid value
    await numberField.setValue(20);
    expect(numberField.errors.length).toBe(0);
  });

  it('works in a form with two fields with bidirectional validation', async () => {
    // Create a form with two fields
    const form = new Group({
      password: Field.create({ value: 'secret' }),
      confirmPassword: Field.create({ value: '' }),
    });

    // Add validator to both fields to check for equality
    form.fields.password.registerAction(
      new CompareTo(
        form.fields.confirmPassword,
        (pass, confirm) => pass === confirm,
        'Passwords must match',
      ),
    );

    form.fields.confirmPassword.registerAction(
      new CompareTo(
        form.fields.password,
        (confirm, pass) => confirm === pass,
        'Passwords must match',
      ),
    );

    // Check initial state - both fields should have errors
    expect(form.fields.password.errors.length).toBe(1);
    expect(form.fields.confirmPassword.errors.length).toBe(1);

    // When values are equal, there should be no errors
    await form.fields.confirmPassword.setValue('secret');
    form.fields.password.validate();
    expect(form.fields.password.errors.length).toBe(0);
    expect(form.fields.confirmPassword.errors.length).toBe(0);

    // When changing one field, both should show errors
    await form.fields.password.setValue('newsecret');
    expect(form.fields.password.errors.length).toBe(1);
    expect(form.fields.confirmPassword.errors.length).toBe(1);

    // When both are set to the same value, there should be no errors
    await form.fields.confirmPassword.setValue('newsecret');
    expect(form.fields.password.errors.length).toBe(0);
    expect(form.fields.confirmPassword.errors.length).toBe(0);
  });

  it('properly formats error message with field references', async () => {
    const form = new Group({
      username: Field.create({ value: 'user123' }),
      displayName: Field.create({ value: 'user123' }),
    });

    // Check that values are different
    const errorMessage = 'Display name must be different from username';
    form.fields.displayName.registerAction(
      new CompareTo(
        form.fields.username,
        (display, user) => display !== user,
        errorMessage,
      ),
    );

    // Currently they are equal, so we expect an error
    expect(form.fields.displayName.errors.length).toBe(1);

    // Check error message content
    const errorContent = unref(form.fields.displayName.errors[0]) as ValidationErrorRenderContent;
    expect(errorContent.componentBody).toBe(errorMessage);
  });
});
