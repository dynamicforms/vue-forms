import { isArray, isObject, isString } from 'lodash-es';

import type { FieldBase } from '../field-base';

import { translatedMessage } from './translations';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
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
    const msg = message || translatedMessage('MinLength');
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      if (toLength(newValue) < minLength) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, { newValue, oldValue, field, minLength }),
            '',
            'min-length',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class MaxLength extends Validator {
  constructor(maxLength: number, message?: RenderContentRef) {
    const msg = message || translatedMessage('MaxLength');
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      if (toLength(newValue) > maxLength) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, { newValue, oldValue, field, maxLength }),
            '',
            'max-length',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class LengthInRange extends Validator {
  constructor(minLength: number, maxLength: number, message?: RenderContentRef) {
    const msg = message || translatedMessage('LengthInRange');
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      const len = toLength(newValue);
      if (len < minLength || len > maxLength) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, { newValue, oldValue, field, minLength, maxLength }),
            '',
            'range-length',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
