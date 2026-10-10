import { isString } from 'lodash-es';
import { unref } from 'vue';

import { ValidationErrorOptions, ValidationFunction, Validator } from './validator';
import { toLength } from './value-checks';

/** How the value is read before its length is measured, and the error's code and detail. */
export type RequiredOptions = ValidationErrorOptions & {
  /**
   * Whether a string is trimmed before it is measured, so that whitespace alone counts as no value. Defaults to
   * true. Set it to false if spaces are part of the field's value.
   */
  trim?: boolean;
};

export default class Required extends Validator {
  constructor(options?: RequiredOptions) {
    const trim = options?.trim ?? true;
    const validationFn: ValidationFunction = (newValue, oldValue) => {
      const value = unref(newValue);
      if (toLength(trim && isString(value) ? value.trim() : value) === 0) {
        return [this.errorFor(options, 'required', 'Please enter a value', { newValue, oldValue })];
      }
      return null;
    };

    super(validationFn);
  }
}
