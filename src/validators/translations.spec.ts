import { createI18n } from 'vue-i18n';

import { Field } from '../field';

import { translate, translateStrings } from './translations';
import { ValidationErrorRenderContent } from './validation-error';
import { MinValue } from './validator-min-max-range';
import Required from './validator-required';

/** the text an error renders, stripped of the markdown emphasis the default templates carry */
const messageOf = (error: ValidationErrorRenderContent) => String(error.resolvedText).replaceAll('**', '');

function i18nWith(locale: string) {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: { forms: { Required: 'Enter a value' } },
      sl: { forms: { Required: 'Prosimo, vnesite vrednost', MinValue: 'Vrednost mora biti vsaj **{minValue}**' } },
    },
  });
}

describe('translations', () => {
  afterEach(() => {
    translateStrings((key) => key);
  });

  it('should show the English default before translateStrings is called', () => {
    const field = new Field({ value: '', validators: [new Required()] });

    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Please enter a value');
  });

  it('should update an error already on screen when translateStrings is called, without revalidating', () => {
    const field = new Field({ value: '', validators: [new Required()] });
    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Please enter a value');

    translateStrings(i18nWith('sl').global.t, 'forms');

    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Prosimo, vnesite vrednost');
  });

  it('should update an error already on screen when the locale switches', () => {
    const { global } = i18nWith('sl');
    translateStrings(global.t, 'forms');
    const field = new Field({ value: '', validators: [new Required()] });
    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Prosimo, vnesite vrednost');

    global.locale.value = 'en';

    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Enter a value');
  });

  it('should substitute placeholders in a translation', () => {
    const field = new Field({ value: 1, validators: [new MinValue(5)] });
    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Value must be larger or equal to 5');

    translateStrings(i18nWith('sl').global.t, 'forms');

    expect(messageOf(field.errors[0] as ValidationErrorRenderContent)).toBe('Vrednost mora biti vsaj 5');
  });

  it('should fall back to the English default for a key the translation function has no translation for', () => {
    translateStrings(i18nWith('sl').global.t, 'forms');

    expect(translate('MaxValue')).toBe('Value must be less than or equal to **{maxValue}**');
  });
});
