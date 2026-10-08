import { ValidationErrorOptions, ValidationFunction, Validator } from './validator';
import { isEmptyValue, toLength } from './value-checks';

export class MinLength extends Validator {
  constructor(minLength: number, options?: ValidationErrorOptions) {
    const validationFn: ValidationFunction = (newValue, oldValue) => {
      if (isEmptyValue(newValue)) return null;
      if (toLength(newValue) < minLength) {
        return [
          this.errorFor(options, 'min_length', 'Length must be larger or equal to {minLength}', {
            newValue,
            oldValue,
            minLength,
          }),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class MaxLength extends Validator {
  constructor(maxLength: number, options?: ValidationErrorOptions) {
    const validationFn: ValidationFunction = (newValue, oldValue) => {
      if (isEmptyValue(newValue)) return null;
      if (toLength(newValue) > maxLength) {
        return [
          this.errorFor(options, 'max_length', 'Length must be less than or equal to {maxLength}', {
            newValue,
            oldValue,
            maxLength,
          }),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class LengthInRange extends Validator {
  constructor(minLength: number, maxLength: number, options?: ValidationErrorOptions) {
    const validationFn: ValidationFunction = (newValue, oldValue) => {
      if (isEmptyValue(newValue)) return null;
      const len = toLength(newValue);
      if (len < minLength || len > maxLength) {
        return [
          this.errorFor(options, 'length_in_range', 'Length must be between {minLength} and {maxLength}', {
            newValue,
            oldValue,
            minLength,
            maxLength,
          }),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
