import { isArray, isObject, isString } from 'lodash-es';
import { unref } from 'vue';

import { ValidationErrorOptions, ValidationFunction, Validator } from './validator';

function toLength(a: any): number {
  if (a == null) return 0;
  if (isArray(a)) return a.length;
  if (isString(a)) return a.length;
  if (isObject(a) && Object.getPrototypeOf(a) === Object.prototype) return Object.keys(a).length;
  return String(a).length;
}

/** How the value is read before its length is taken, and what the error states. */
export interface RequiredOptions extends ValidationErrorOptions {
  /**
   * Whether a string is trimmed before it is measured, so that whitespace alone is no value. Defaults to true.
   * Set it to false where the spaces are part of what the field holds.
   */
  trim?: boolean;
}

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
