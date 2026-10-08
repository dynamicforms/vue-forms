import { ValidationErrorOptions, ValidationFunction, Validator } from './validator';
import { compareValues, isEmptyValue } from './value-checks';

export class MinValue<T = any> extends Validator {
  constructor(minValue: T, options?: ValidationErrorOptions) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T) => {
      if (isEmptyValue(newValue)) return null;
      const below = compareValues(newValue, minValue);
      if (below === undefined || below < 0) {
        return [
          this.errorFor(options, 'min_value', 'Value must be larger or equal to {minValue}', {
            newValue,
            oldValue,
            minValue,
          }),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class MaxValue<T = any> extends Validator {
  constructor(maxValue: T, options?: ValidationErrorOptions) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T) => {
      if (isEmptyValue(newValue)) return null;
      const above = compareValues(newValue, maxValue);
      if (above === undefined || above > 0) {
        return [
          this.errorFor(options, 'max_value', 'Value must be less than or equal to {maxValue}', {
            newValue,
            oldValue,
            maxValue,
          }),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class ValueInRange<T = any> extends Validator {
  constructor(minValue: T, maxValue: T, options?: ValidationErrorOptions) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T) => {
      if (isEmptyValue(newValue)) return null;
      const below = compareValues(newValue, minValue);
      const above = compareValues(newValue, maxValue);
      if (below === undefined || above === undefined || below < 0 || above > 0) {
        return [
          this.errorFor(options, 'value_in_range', 'Value must be between {minValue} and {maxValue}', {
            newValue,
            oldValue,
            minValue,
            maxValue,
          }),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
