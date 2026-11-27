import { namespaced } from './error-namespace';
import { ValidationErrorOptions } from './validator';
import { ValueCheck } from './value-check';
import { toLength } from './value-checks';

export class MinLength extends ValueCheck {
  constructor(minLength: number, options?: ValidationErrorOptions) {
    super((value, given) =>
      toLength(value) < minLength
        ? this.errorFor(options, namespaced('min_length'), 'Length must be larger or equal to {minLength}', {
            ...given,
            minLength,
          })
        : null,
    );
  }
}

export class MaxLength extends ValueCheck {
  constructor(maxLength: number, options?: ValidationErrorOptions) {
    super((value, given) =>
      toLength(value) > maxLength
        ? this.errorFor(options, namespaced('max_length'), 'Length must be less than or equal to {maxLength}', {
            ...given,
            maxLength,
          })
        : null,
    );
  }
}

export class LengthInRange extends ValueCheck {
  constructor(minLength: number, maxLength: number, options?: ValidationErrorOptions) {
    super((value, given) => {
      const len = toLength(value);
      if (!(len < minLength || len > maxLength)) return null;
      return this.errorFor(
        options,
        namespaced('length_in_range'),
        'Length must be between {minLength} and {maxLength}',
        { ...given, minLength, maxLength },
      );
    });
  }
}
