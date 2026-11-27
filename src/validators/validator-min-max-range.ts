import { ValidationErrorOptions } from './validator';
import { ValueCheck } from './value-check';
import { compareValues } from './value-checks';

export class MinValue<T = any> extends ValueCheck {
  constructor(minValue: T, options?: ValidationErrorOptions) {
    super(options, 'min_value', 'Value must be larger or equal to {minValue}', (value) => {
      const below = compareValues(value, minValue);
      return below === undefined || below < 0 ? { minValue } : null;
    });
  }
}

export class MaxValue<T = any> extends ValueCheck {
  constructor(maxValue: T, options?: ValidationErrorOptions) {
    super(options, 'max_value', 'Value must be less than or equal to {maxValue}', (value) => {
      const above = compareValues(value, maxValue);
      return above === undefined || above > 0 ? { maxValue } : null;
    });
  }
}

export class ValueInRange<T = any> extends ValueCheck {
  constructor(minValue: T, maxValue: T, options?: ValidationErrorOptions) {
    super(options, 'value_in_range', 'Value must be between {minValue} and {maxValue}', (value) => {
      const below = compareValues(value, minValue);
      const above = compareValues(value, maxValue);
      return below === undefined || above === undefined || below < 0 || above > 0 ? { minValue, maxValue } : null;
    });
  }
}
