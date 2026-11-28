import { namespaced } from './error-namespace';
import { ValidationErrorOptions } from './validator';
import { ValueCheck } from './value-check';
import { compareValues } from './value-checks';

export class MinValue<T = any> extends ValueCheck {
  constructor(minValue: T, options?: ValidationErrorOptions) {
    super((value, given) => {
      const below = compareValues(value, minValue);
      if (!(below === undefined || below < 0)) return null;
      return this.errorFor(options, namespaced('min_value'), 'Value must be larger or equal to {minValue}', {
        ...given,
        minValue,
      });
    });
  }
}

export class MaxValue<T = any> extends ValueCheck {
  constructor(maxValue: T, options?: ValidationErrorOptions) {
    super((value, given) => {
      const above = compareValues(value, maxValue);
      if (!(above === undefined || above > 0)) return null;
      return this.errorFor(options, namespaced('max_value'), 'Value must be less than or equal to {maxValue}', {
        ...given,
        maxValue,
      });
    });
  }
}

export class ValueInRange<T = any> extends ValueCheck {
  constructor(minValue: T, maxValue: T, options?: ValidationErrorOptions) {
    super((value, given) => {
      const below = compareValues(value, minValue);
      const above = compareValues(value, maxValue);
      if (below !== undefined && above !== undefined && below >= 0 && above <= 0) return null;
      return this.errorFor(options, namespaced('value_in_range'), 'Value must be between {minValue} and {maxValue}', {
        ...given,
        minValue,
        maxValue,
      });
    });
  }
}
