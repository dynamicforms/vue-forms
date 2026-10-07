import { vi } from 'vitest';
import { nextTick, ref } from 'vue';

import { setConfig } from '../config';
import { Field } from '../field';
import { MdString } from '../render-content';

import { type ErrorDescription, ValidationErrorDescription, ValidationError } from './validation-error';
import { Validator } from './validator';
import { MinValue } from './validator-min-max-range';
import Required from './validator-required';

const textOf = (field: Field) => (field.errors[0] as ValidationError).resolvedText;

describe('errorText', () => {
  afterEach(() => {
    setConfig({ errorText: undefined });
  });

  it('should leave a built-in error its English detail, params substituted, without errorText', () => {
    const field = new Field({ value: 1, validators: [new MinValue(5)] });
    const error = field.errors[0] as ValidationErrorDescription;

    expect(error.code).toBe('min_value');
    expect(error.params).toEqual({ newValue: 1, oldValue: 1, minValue: 5 });
    expect(error.detail).toBe('Value must be larger or equal to 5');
    expect(textOf(field)).toBe('Value must be larger or equal to 5');
  });

  it('should read an error as errorText answers for it, and as its detail where it answers undefined', () => {
    setConfig({ errorText: (error) => (error.code === 'min_value' ? `vsaj ${error.params.minValue}` : undefined) });
    const min = new Field({ value: 1, validators: [new MinValue(5)] });
    const required = new Field({ value: '', validators: [new Required()] });

    expect(textOf(min)).toBe('vsaj 5');
    expect(textOf(required)).toBe('Please enter a value');
  });

  it('should follow the reactive state errorText reads in an error already on screen, without revalidating', () => {
    const locale = ref('en');
    const texts: Record<string, string> = { en: 'Enter a value', sl: 'Vnesite vrednost' };
    setConfig({ errorText: () => texts[locale.value] });
    const field = new Field({ value: '', validators: [new Required()] });
    const error = field.errors[0] as ValidationError;
    expect(error.componentBody).toBe('Enter a value');

    locale.value = 'sl';

    expect(error.componentBody).toBe('Vnesite vrednost');
    expect(field.errors[0]).toBe(error);
  });

  it('should follow an errorText set after the error was produced', async () => {
    const field = new Field({ value: '', validators: [new Required()] });
    expect(textOf(field)).toBe('Please enter a value');

    setConfig({ errorText: () => 'Vnesite vrednost' });
    await nextTick();

    expect(textOf(field)).toBe('Vnesite vrednost');
  });

  it('should render what errorText answers as markdown where it answers an MdString', () => {
    setConfig({ errorText: (error) => new MdString(`at least **${error.params.minValue}**`) });
    const error = new Field({ value: 1, validators: [new MinValue(5)] }).errors[0] as ValidationError;

    expect(error.componentName).toBe('vue-markdown');
    expect(error.componentBindings).toMatchObject({ source: 'at least **5**' });
  });

  it('should not consult errorText for a validator given a message of its own', () => {
    const errorText = vi.fn(() => 'translated');
    setConfig({ errorText });
    const field = new Field({ value: 1, validators: [new MinValue(5, 'at least {minValue} for {field}')] });

    expect(String(textOf(field))).toMatch(/^at least 5 for /);
    expect(field.errors[0].code).toBe('min_value');
    expect(field.errors[0].params).toEqual({ newValue: 1, oldValue: 1, minValue: 5 });
    expect(errorText).not.toHaveBeenCalled();
  });

  it('should describe a rejected validation run as validation_failed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const field = new Field({ value: 1, validators: [new Validator(() => Promise.reject(new Error('down')))] });
    await vi.waitFor(() => expect(field.errors).toHaveLength(1));
    error.mockRestore();

    expect(field.errors[0]).toBeInstanceOf(ValidationErrorDescription);
    expect(field.errors[0].code).toBe('validation_failed');
    expect(textOf(field)).toBe('Validation could not be completed');
  });

  it("should render a server's error through the same errorText", () => {
    const seen: ErrorDescription[] = [];
    setConfig({
      errorText: (error) => {
        seen.push(error);
        return error.code === 'not_found' ? `Element ${error.params.pk} ne obstaja` : undefined;
      },
    });
    const error = new ValidationErrorDescription('not_found', { pk: 42 }, 'Item with pk 42 not found', '', 'server');

    expect(error.resolvedText).toBe('Element 42 ne obstaja');
    expect(seen[0].origin).toBe('server');
  });
});
