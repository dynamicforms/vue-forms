import { unref } from 'vue';

import { ValidationErrorOptions, ValidationFunction, Validator } from './validator';

export default class Pattern extends Validator {
  constructor(pattern: RegExp, options?: ValidationErrorOptions) {
    const validationFn: ValidationFunction = (newValue, oldValue) => {
      if (!pattern.test(String(unref(newValue)))) {
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
