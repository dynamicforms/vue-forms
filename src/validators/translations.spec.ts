import { Field } from '../field';

import { strings, translateStrings } from './translations';
import { ValidationErrorRenderContent } from './validation-error';
import { MinValue } from './validator-min-max-range';
import Required from './validator-required';

/** the text an error renders, stripped of the markdown emphasis the default templates carry */
const messageOf = (error: ValidationErrorRenderContent) => String(error.resolvedText).replaceAll('**', '');

describe('translations', () => {
  afterEach(() => {
    translateStrings(() => undefined);
  });

  it('should show the English default before translateStrings is called', () => {
    const field = new Field({ value: '', validators: [new Required()] });

    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Please enter a value');
  });

  it('should update an error already on screen when translateStrings is called, without revalidating', () => {
    const field = new Field({ value: '', validators: [new Required()] });
    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Please enter a value');

    const translations: Partial<Record<keyof typeof strings, string>> = { Required: 'Prosimo, vnesite vrednost' };
    translateStrings((key) => translations[key]);

    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Prosimo, vnesite vrednost');
  });

  it('should keep interpolating placeholders correctly after translation', () => {
    const field = new Field({ value: 1, validators: [new MinValue(5)] });
    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toContain('5');

    const translations: Partial<Record<keyof typeof strings, string>> = {
      MinValue: 'Vrednost mora biti vsaj **{minValue}**',
    };
    translateStrings((key) => translations[key]);

    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Vrednost mora biti vsaj 5');
  });

  it('should fall back to the English default for a key translateStrings does not cover', () => {
    const translations: Partial<Record<keyof typeof strings, string>> = { Required: 'Prosimo, vnesite vrednost' };
    translateStrings((key) => translations[key]);
    expect(strings.MinValue).toBe('Value must be larger or equal to **{minValue}**');
  });
});
