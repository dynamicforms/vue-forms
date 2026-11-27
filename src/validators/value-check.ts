import { unref } from 'vue';

import { namespaced } from './error-namespace';
import { ValidationErrorOptions, ValidationFunction, Validator } from './validator';
import { isEmptyValue } from './value-checks';

/**
 * The params a failed check adds to its error next to `newValue` and `oldValue`, or `null` where the value passes.
 */
export type ValueCheckFailure = Record<string, unknown> | null;

/**
 * A built-in validator that passes an empty value and checks any other with one predicate. The value is unwrapped
 * with `unref` before the empty test and the predicate; the error carries the field's `newValue` and `oldValue` as
 * given.
 */
export abstract class ValueCheck extends Validator {
  constructor(
    options: ValidationErrorOptions | undefined,
    code: string,
    detail: string,
    failure: (value: any) => ValueCheckFailure,
  ) {
    const validationFn: ValidationFunction = (newValue, oldValue) => {
      const value = unref(newValue);
      if (isEmptyValue(value)) return null;
      const params = failure(value);
      return params ? [this.errorFor(options, namespaced(code), detail, { newValue, oldValue, ...params })] : null;
    };

    super(validationFn);
  }
}
