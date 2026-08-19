import { vi } from 'vitest';

import type { IFieldConstructorParams } from './field.interface';
import { ValidationErrorText } from './validators/validation-error';

import Form from '.';

import DisplayMode from '@/display-mode';

describe('Field', () => {
  it('trigger onValueChanged on value change', () => {
    const onValueChanged = vi.fn();
    const field = new Form.Field({ enabled: true }).registerAction(new Form.ValueChangedAction(onValueChanged));

    field.value = 'test';

    expect(onValueChanged).toHaveBeenCalledWith(field, expect.any(Function), 'test', undefined);
  });

  it('does not trigger onValueChanged, when the field is read only', () => {
    const onValueChanged = vi.fn();
    const field = new Form.Field({ enabled: false }).registerAction(new Form.ValueChangedAction(onValueChanged));

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
    const field = new Form.Field({ enabled: true }).registerAction(new Form.ValidChangedAction(onValidChanged));

    field.errors = [new ValidationErrorText('Napaka')];
    field.value = 'test';

    expect(field.valid).toBe(false);
    expect(onValidChanged).toHaveBeenCalledWith(field, expect.any(Function), false, true);
  });

  it.each([null, DisplayMode.FULL, DisplayMode.HIDDEN])(
    'triggers onVisibilityChanging on visibility change',
    (changingReturnValue: DisplayMode | null) => {
      // why we're doing .each? it's to test that the function for setting visibility value
      //  actually uses the result of the event handler.
      //  when it returns null, expected result is what was requested in the setVisibility call
      const onVisibilityChanging = vi.fn().mockReturnValue(changingReturnValue);
      const field = new Form.Field().registerAction(new Form.VisibilityChangingAction(onVisibilityChanging));

      field.visibility = DisplayMode.HIDDEN;

      expect(onVisibilityChanging).toHaveBeenCalledWith(
        field,
        expect.any(Function),
        DisplayMode.HIDDEN,
        DisplayMode.FULL,
      );
      expect(field.visibility).toBe(changingReturnValue ?? DisplayMode.HIDDEN);
    },
  );

  it.each([null, true, false])(
    'triggers onEnabledChanging on enabled change',
    (changingReturnValue: boolean | null) => {
      // why we're doing .each? it's to test that the function for setting enabled value
      //  actually uses the result of the event handler.
      //  when it returns null, expected result is what was requested in the setEnabled call
      const onEnabledChanging = vi.fn().mockReturnValue(changingReturnValue);
      const field = new Form.Field().registerAction(new Form.EnabledChangingAction(onEnabledChanging));

      field.enabled = false;

      expect(onEnabledChanging).toHaveBeenCalledWith(field, expect.any(Function), false, true);
      expect(field.enabled).toBe(changingReturnValue ?? false);
    },
  );

  it('correctly manages valid state based on errors', () => {
    // Test initial valid state (no validators)
    const field = new Form.Field({ value: 'test' });
    expect(field.valid).toBe(true);
    expect(field.errors.length).toBe(0);

    // Test with validator that creates error
    const fieldWithValidator = new Form.Field({
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

  it('maintains valid state in the element bind() produces', () => {
    // binding a field that holds errors (invalid)
    const invalidField = new Form.Field({
      value: '',
      validators: [new Form.Validators.Required()],
    });
    expect(invalidField.valid).toBe(false);

    const boundInvalid = invalidField.bind();
    expect(boundInvalid.valid).toBe(false);
    expect(boundInvalid.errors.length).toBe(1);

    // binding a field without errors (valid)
    const validField = new Form.Field({
      value: 'valid value',
      validators: [new Form.Validators.Required()],
    });
    expect(validField.valid).toBe(true);

    const boundValid = validField.bind();
    expect(boundValid.valid).toBe(true);
    expect(boundValid.errors.length).toBe(0);

    // binding data that changes the verdict
    const boundToInvalidValue = validField.bind('');
    expect(boundToInvalidValue.valid).toBe(false);
    expect(boundToInvalidValue.errors.length).toBe(1);
  });

  it('triggers ValidChangedAction when valid state changes', () => {
    const onValidChanged = vi.fn();
    const field = new Form.Field<string>({
      value: 'valid',
      validators: [new Form.Validators.Required()],
    }).registerAction(new Form.ValidChangedAction(onValidChanged));

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

describe('Field construction', () => {
  it('constructs directly, with and without parameters', () => {
    expect(new Form.Field().value).toBeUndefined();
    expect(new Form.Field({ value: 'x' }).value).toBe('x');
  });

  it('binds into the subclass it was called on', () => {
    class MyField extends Form.Field<string> {}

    const onChange = vi.fn();
    const original = new MyField({ value: 'a' }).registerAction(new Form.ValueChangedAction(onChange));
    const copy = original.bind();

    expect(copy).toBeInstanceOf(MyField);
    expect(copy).not.toBe(original);
    expect(copy.value).toBe('a');

    onChange.mockClear();
    copy.value = 'b';
    expect(onChange).toHaveBeenCalled();
  });

  it('runs init before a subclass class field initializer', () => {
    const seenDuringInit: unknown[] = [];

    class Suffixed extends Form.Field<string> {
      suffix = ' EUR';

      protected init(params?: Partial<IFieldConstructorParams<string>>) {
        seenDuringInit.push(this.suffix);
        super.init(params);
      }
    }

    const field = new Suffixed({ value: 'a' });

    // init is called from Field's constructor, so the subclass initializer has not run yet
    expect(seenDuringInit).toEqual([undefined]);
    expect(field.suffix).toBe(' EUR');
    expect(field.value).toBe('a');
  });

  it('runs every constructor-supplied validator exactly once, over the constructed value', () => {
    const runs: string[] = [];
    const field = new Form.Field<string>({
      value: 'good',
      validators: [
        new Form.Validators.Validator<string>((newValue) => {
          runs.push(`first:${newValue}`);
          return null;
        }),
        new Form.Validators.Validator<string>((newValue) => {
          runs.push(`second:${newValue}`);
          return null;
        }),
      ],
    });

    expect(runs.sort()).toEqual(['first:good', 'second:good']);
    expect(field.valid).toBe(true);
    expect(field.errors).toHaveLength(0);
  });

  it('keeps the verdict of a constructor-supplied validator that rejects the constructed value', () => {
    const runs: unknown[] = [];
    const field = new Form.Field<string>({
      value: '',
      validators: [
        new Form.Validators.Validator<string>((newValue) => {
          runs.push(newValue);
          return newValue === '' ? [new ValidationErrorText('Required field')] : null;
        }),
      ],
    });

    expect(runs).toEqual(['']);
    expect(field.valid).toBe(false);
    expect(field.errors).toHaveLength(1);
  });

  it('lets a constructor-supplied changing action rewrite the parameters that carry it', () => {
    const visibilitySeen: DisplayMode[] = [];
    const enabledSeen: boolean[] = [];
    const field = new Form.Field({
      value: 1,
      visibility: DisplayMode.HIDDEN,
      enabled: false,
      actions: [
        new Form.VisibilityChangingAction(() => DisplayMode.SUPPRESS),
        new Form.VisibilityChangedAction((f, supr, newValue) => {
          visibilitySeen.push(newValue);
        }),
        new Form.EnabledChangingAction(() => true),
        new Form.EnabledChangedAction((f, supr, newValue) => {
          enabledSeen.push(newValue);
        }),
      ],
    });

    expect(field.visibility).toBe(DisplayMode.SUPPRESS);
    expect(field.enabled).toBe(true);
    expect(visibilitySeen).toEqual([DisplayMode.SUPPRESS]);
    expect(enabledSeen).toEqual([true]);
  });

  it('falls back to originalValue for an undefined value and keeps an explicit null', () => {
    expect(new Form.Field({ value: undefined, originalValue: 'orig' }).value).toBe('orig');
    expect(new Form.Field({ originalValue: 'orig' }).value).toBe('orig');
    expect(new Form.Field<string | null>({ value: null, originalValue: 'orig' }).value).toBeNull();
  });

  it('takes the data it binds only from an argument the caller supplied', () => {
    const field = new Form.Field<string | null | undefined>({ value: 'a' });

    expect(field.bind().value).toBe('a');
    expect(field.bind(undefined).value).toBe('a');
    expect(field.bind(null).value).toBeNull();
    expect(field.bind('b').value).toBe('b');
  });
});
