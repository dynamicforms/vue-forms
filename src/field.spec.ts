import { vi } from 'vitest';

import { ValidationErrorText } from './validators/validation-error';

import Form from '.';

import DisplayMode from '@/display-mode';

describe('Field', () => {
  it('trigger onValueChanged on value change', () => {
    const onValueChanged = vi.fn();
    const field = Form.Field.create({ enabled: true })
      .registerAction(new Form.ValueChangedAction(onValueChanged));

    field.value = 'test';

    expect(onValueChanged).toHaveBeenCalledWith(field, expect.any(Function), 'test', undefined);
  });

  it('does not trigger onValueChanged, when the field is read only', () => {
    const onValueChanged = vi.fn();
    const field = Form.Field.create({ enabled: false })
      .registerAction(new Form.ValueChangedAction(onValueChanged));

    field.value = 'test';

    expect(onValueChanged).not.toHaveBeenCalled();
  });

  it('sets originalValue', () => {
    const field = Form.Field.create({
      value: 'test',
      originalValue: 'original',
    });

    expect(field.value).toBe('test');
    expect(field.originalValue).toBe('original');
    expect(field.isChanged).toBe(true);
  });

  it('check isChanged behaviour', () => {
    const field = Form.Field.create({
      value: 'test',
      originalValue: 'original',
    });

    expect(field.isChanged).toBe(true);

    field.value = 'original';
    expect(field.isChanged).toBe(false);
  });

  it('triggers validation on value change', () => {
    const onValidChanged = vi.fn();
    const field = Form.Field.create({ enabled: true })
      .registerAction(new Form.ValidChangedAction(onValidChanged));

    field.errors = [new ValidationErrorText('Napaka')];
    field.value = 'test';

    expect(field.valid).toBe(false);
    expect(onValidChanged).toHaveBeenCalledWith(field, expect.any(Function), false, true);
  });

  it.each(
    [null, DisplayMode.FULL, DisplayMode.HIDDEN],
  )('triggers onVisibilityChanging on visibility change', (changingReturnValue: DisplayMode | null) => {
    // why we're doing .each? it's to test that the function for setting visibility value
    //  actually uses the result of the event handler.
    //  when it returns null, expected result is what was requested in the setVisibility call
    const onVisibilityChanging = vi.fn().mockReturnValue(changingReturnValue);
    const field = Form.Field.create()
      .registerAction(new Form.VisibilityChangingAction(onVisibilityChanging));

    field.visibility = DisplayMode.HIDDEN;

    expect(onVisibilityChanging)
      .toHaveBeenCalledWith(field, expect.any(Function), DisplayMode.HIDDEN, DisplayMode.FULL);
    expect(field.visibility).toBe(changingReturnValue ?? DisplayMode.HIDDEN);
  });

  it.each(
    [null, true, false],
  )('triggers onEnabledChanging on enabled change', (changingReturnValue: boolean | null) => {
    // why we're doing .each? it's to test that the function for setting enabled value
    //  actually uses the result of the event handler.
    //  when it returns null, expected result is what was requested in the setEnabled call
    const onEnabledChanging = vi.fn().mockReturnValue(changingReturnValue);
    const field = Form.Field.create()
      .registerAction(new Form.EnabledChangingAction(onEnabledChanging));

    field.enabled = false;

    expect(onEnabledChanging)
      .toHaveBeenCalledWith(field, expect.any(Function), false, true);
    expect(field.enabled).toBe(changingReturnValue ?? false);
  });

  it('correctly manages valid state based on errors', () => {
    // Test initial valid state (no validators)
    const field = Form.Field.create({ value: 'test' });
    expect(field.valid).toBe(true);
    expect(field.errors.length).toBe(0);

    // Test with validator that creates error
    const fieldWithValidator = Form.Field.create({
      value: '',
      validators: [new Form.Validators.Required('Required field')],
    });
    expect(fieldWithValidator.valid).toBe(false);
    expect(fieldWithValidator.errors.length).toBe(1);

    // Test valid after setting correct value
    fieldWithValidator.value = 'not empty';
    expect(fieldWithValidator.valid).toBe(true);
    expect(fieldWithValidator.errors.length).toBe(0);

    // Test invalid after setting incorrect value
    fieldWithValidator.value = '';
    expect(fieldWithValidator.valid).toBe(false);
    expect(fieldWithValidator.errors.length).toBe(1);
  });

  it('maintains valid state after cloning', () => {
    // Test cloning field with errors (invalid)
    const invalidField = Form.Field.create({
      value: '',
      validators: [new Form.Validators.Required()],
    });
    expect(invalidField.valid).toBe(false);

    const clonedInvalid = invalidField.clone();
    expect(clonedInvalid.valid).toBe(false);
    expect(clonedInvalid.errors.length).toBe(1);

    // Test cloning field without errors (valid)
    const validField = Form.Field.create({
      value: 'valid value',
      validators: [new Form.Validators.Required()],
    });
    expect(validField.valid).toBe(true);

    const clonedValid = validField.clone();
    expect(clonedValid.valid).toBe(true);
    expect(clonedValid.errors.length).toBe(0);

    // Test cloning with value override that changes validity
    const clonedWithInvalidValue = validField.clone({ value: '' });
    expect(clonedWithInvalidValue.valid).toBe(false);
    expect(clonedWithInvalidValue.errors.length).toBe(1);
  });

  it('triggers ValidChangedAction when valid state changes', () => {
    const onValidChanged = vi.fn();
    const field = Form.Field.create({
      value: 'valid',
      validators: [new Form.Validators.Required()],
    })
      .registerAction(new Form.ValidChangedAction(onValidChanged));

    // Initially valid, no action triggered during setup
    expect(field.valid).toBe(true);

    // Make field invalid
    field.value = '';
    expect(field.valid).toBe(false);
    expect(onValidChanged).toHaveBeenCalledWith(field, expect.any(Function), false, true);

    // Reset mock and make field valid again
    onValidChanged.mockReset();
    field.value = 'valid again';
    expect(field.valid).toBe(true);
    expect(onValidChanged).toHaveBeenCalledWith(field, expect.any(Function), true, false);
  });
});
