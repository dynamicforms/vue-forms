import { createTranslatable } from '@dynamicforms/translatable';
import { toRef } from 'vue';

import { buildErrorMessage } from './error-message-builder';

/**
 * The built-in validators' default English messages, keyed by what each one validates rather than by its text -
 * a translation set reads as a list of concepts, not a list of English sentences to override. The `{name}`
 * placeholders are substituted by the validator that owns each message, against the value it is currently
 * validating, so a translation keeps them as they stand.
 */
export const { strings, translateStrings } = createTranslatable({
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
});

/** A built-in validator's default message, translated and reactive to a later `translateStrings` call. */
export function translatedMessage(key: keyof typeof strings) {
  return buildErrorMessage(toRef(strings, key));
}
