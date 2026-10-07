import type { FieldBase } from '../field-base';
import { RenderContentRef } from '../render-content';

import { ValidationFunction, Validator } from './validator';

export class MinValue<T = any> extends Validator {
  constructor(minValue: T, message?: RenderContentRef) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      if (newValue < minValue || newValue === undefined) {
        return [
          this.errorFor(field, message, 'min_value', 'Value must be larger or equal to {minValue}', {
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
  constructor(maxValue: T, message?: RenderContentRef) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      if (newValue > maxValue || newValue === undefined) {
        return [
          this.errorFor(field, message, 'max_value', 'Value must be less than or equal to {maxValue}', {
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
  constructor(minValue: T, maxValue: T, message?: RenderContentRef) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      if (newValue < minValue || newValue > maxValue || newValue === undefined) {
        return [
          this.errorFor(field, message, 'value_in_range', 'Value must be between {minValue} and {maxValue}', {
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
