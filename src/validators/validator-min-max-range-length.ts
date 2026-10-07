import { isArray, isObject, isString } from 'lodash-es';

import type { FieldBase } from '../field-base';
import { RenderContentRef } from '../render-content';

import { ValidationFunction, Validator } from './validator';

function toLength(a: any): number {
  if (a == null) return 0;
  if (isArray(a)) return a.length;
  if (isString(a)) return a.length;
  if (isObject(a) && Object.getPrototypeOf(a) === Object.prototype) return Object.keys(a).length;
  return String(a).length;
}

export class MinLength extends Validator {
  constructor(minLength: number, message?: RenderContentRef) {
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      if (toLength(newValue) < minLength) {
        return [
          this.errorFor(field, message, 'min_length', 'Length must be larger or equal to {minLength}', {
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
  constructor(maxLength: number, message?: RenderContentRef) {
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      if (toLength(newValue) > maxLength) {
        return [
          this.errorFor(field, message, 'max_length', 'Length must be less than or equal to {maxLength}', {
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
  constructor(minLength: number, maxLength: number, message?: RenderContentRef) {
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      const len = toLength(newValue);
      if (len < minLength || len > maxLength) {
        return [
          this.errorFor(field, message, 'length_in_range', 'Length must be between {minLength} and {maxLength}', {
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
