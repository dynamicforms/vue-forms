import { vi } from 'vitest';

import { ValidationErrorText } from './validation-error';

import * as Form from '.';

import DisplayMode from '@/display-mode';

describe('Field', () => {
  it('trigger onValueChanged on value change', () => {
    const onValueChanged = vi.fn();
    const field = new Form.Field({ enabled: true })
      .registerAction(new Form.ValueChangedAction(onValueChanged));

    field.value = 'test';

    expect(onValueChanged).toHaveBeenCalledWith(field, expect.any(Function), 'test', undefined);
  });

  it('does not trigger onValueChanged, when the field is read only', () => {
    const onValueChanged = vi.fn();
    const field = new Form.Field({ enabled: false })
      .registerAction(new Form.ValueChangedAction(onValueChanged));

    field.value = 'test';

    expect(onValueChanged).not.toHaveBeenCalled();
  });

  it('sets originalValue', () => {
    const field = new Form.Field({
      value: 'test',
      originalValue: 'original',
    });

    expect(field.value).toBe('test');
    expect(field.originalValue).toBe('original');
    expect(field.isChanged).toBe(true);
  });

  it('check isChanged behaviour', () => {
    const field = new Form.Field({
      value: 'test',
      originalValue: 'original',
    });

    expect(field.isChanged).toBe(true);

    field.value = 'original';
    expect(field.isChanged).toBe(false);
  });

  it('triggers validation on value change', () => {
    const onValidChanged = vi.fn();
    const field = new Form.Field({ enabled: true })
      .registerAction(new Form.ValidChangedAction(onValidChanged));

    field.errors = [new ValidationErrorText('Napaka')];
    field.value = 'test';

    expect(field.valid).toBe(false);
    expect(onValidChanged).toHaveBeenCalledWith(field, expect.any(Function), false, true);
  });

  it.each(
    [null, DisplayMode.FULL, DisplayMode.HIDDEN],
  )('triggers onVisibilityChanging on visibility change', async (changingReturnValue: DisplayMode | null) => {
    // why we're doing .each? it's to test that the async function for setting visibility value
    //  actually uses the result of the event handler.
    //  when it returns null, expected result is what was requested in the setVisibility call
    const onVisibilityChanging = vi.fn().mockResolvedValue(changingReturnValue);
    const field = new Form.Field()
      .registerAction(new Form.VisibilityChangingAction(onVisibilityChanging));

    await field.setVisibility(DisplayMode.HIDDEN);

    expect(onVisibilityChanging)
      .toHaveBeenCalledWith(field, expect.any(Function), DisplayMode.HIDDEN, DisplayMode.FULL);
    expect(field.visibility).toBe(changingReturnValue ?? DisplayMode.HIDDEN);
  });

  it.each(
    [null, true, false],
  )('triggers onEnabledChanging on enabled change', async (changingReturnValue: boolean | null) => {
    // why we're doing .each? it's to test that the async function for setting enabled value
    //  actually uses the result of the event handler.
    //  when it returns null, expected result is what was requested in the setEnabled call
    const onEnabledChanging = vi.fn().mockResolvedValue(changingReturnValue);
    const field = new Form.Field()
      .registerAction(new Form.EnabledChangingAction(onEnabledChanging));

    await field.setEnabled(false);

    expect(onEnabledChanging)
      .toHaveBeenCalledWith(field, expect.any(Function), false, true);
    expect(field.enabled).toBe(changingReturnValue ?? false);
  });
});
