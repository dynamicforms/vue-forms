import { unref } from 'vue';

import { ValidationError } from './validation-error';
import { ValidationFunction, Validator } from './validator';
import { isEmptyValue } from './value-checks';

/** The field's `newValue` and `oldValue` as given, which a failed check adds to its error params. */
export type GivenValues = { newValue: any; oldValue: any };

/**
 * A built-in validator that passes an empty value and checks any other with one function. The value is unwrapped
 * with `unref` before the empty test and the check; `check` returns the error or `null` where the value passes.
 */
export abstract class ValueCheck extends Validator {
  constructor(check: (value: any, given: GivenValues) => ValidationError | null) {
    const validationFn: ValidationFunction = (newValue, oldValue) => {
      const value = unref(newValue);
      if (isEmptyValue(value)) return null;
      const error = check(value, { newValue, oldValue });
      return error ? [error] : null;
    };

    super(validationFn);
  }
}
