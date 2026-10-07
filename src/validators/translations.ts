import { createTranslatable } from '@dynamicforms/translatable';
import { computed } from 'vue';

import { buildErrorMessage } from './error-message-builder';

/**
 * The built-in validators' default English messages, keyed by what each one validates rather than by its text -
 * a translation set reads as a list of concepts, not a list of English sentences to override. The `{name}`
 * placeholders take the values the validator that owns each message passes when it reports an error.
 */
const defaults = {
  Required: 'Please enter a value',
  MinValue: 'Value must be larger or equal to **{minValue}**',
  MaxValue: 'Value must be less than or equal to **{maxValue}**',
  ValueInRange: 'Value must be between **{minValue}** and **{maxValue}**',
  MinLength: 'Length must be larger or equal to **{minLength}**',
  MaxLength: 'Length must be less than or equal to **{maxLength}**',
  LengthInRange: 'Length must be between **{minLength}** and **{maxLength}**',
  Pattern: 'Value must match pattern "**{pattern}**"',
  InAllowedValues: 'Must be one of [**{allowedAsText}**]',
  ValidationFailed: 'Validation could not be completed',
};

export type TranslationKey = keyof typeof defaults;

export const { translate, translateStrings } = createTranslatable(defaults);

/** A built-in validator's message with `params` substituted, reactive to the locale and to `translateStrings`. */
export function translatedMessage(key: TranslationKey, params: Record<string, unknown>) {
  return buildErrorMessage(computed(() => translate(key, params)));
}
