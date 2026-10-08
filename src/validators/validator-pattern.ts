import { unref } from 'vue';

import { ValidationErrorOptions, ValidationFunction, Validator } from './validator';
import { isEmptyValue } from './value-checks';

export default class Pattern extends Validator {
  constructor(pattern: RegExp, options?: ValidationErrorOptions) {
    // a `g` or `y` flag makes `test()` resume from the end of the previous match, so the same value would pass and
    // fail in turn; the validator tests with a copy without them and leaves the caller's expression as it is
    const tester = /[gy]/.test(pattern.flags)
      ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''))
      : pattern;
    const validationFn: ValidationFunction = (newValue, oldValue) => {
      const value = unref(newValue);
      if (isEmptyValue(value)) return null;
      if (!tester.test(String(value))) {
        return [
          this.errorFor(options, 'pattern', 'Value must match pattern "{pattern}"', {
            newValue,
            oldValue,
            pattern,
          }),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
