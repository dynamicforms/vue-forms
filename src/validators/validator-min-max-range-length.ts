import { ValidationErrorOptions } from './validator';
import { ValueCheck } from './value-check';
import { toLength } from './value-checks';

export class MinLength extends ValueCheck {
  constructor(minLength: number, options?: ValidationErrorOptions) {
    super(options, 'min_length', 'Length must be larger or equal to {minLength}', (value) =>
      toLength(value) < minLength ? { minLength } : null,
    );
  }
}

export class MaxLength extends ValueCheck {
  constructor(maxLength: number, options?: ValidationErrorOptions) {
    super(options, 'max_length', 'Length must be less than or equal to {maxLength}', (value) =>
      toLength(value) > maxLength ? { maxLength } : null,
    );
  }
}

export class LengthInRange extends ValueCheck {
  constructor(minLength: number, maxLength: number, options?: ValidationErrorOptions) {
    super(options, 'length_in_range', 'Length must be between {minLength} and {maxLength}', (value) => {
      const len = toLength(value);
      return len < minLength || len > maxLength ? { minLength, maxLength } : null;
    });
  }
}
