import type { FieldBase } from '../field-base';

import { translatedMessage } from './translations';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

export class MinValue<T = any> extends Validator {
  constructor(minValue: T, message?: RenderContentRef) {
    const msg = message || translatedMessage('MinValue');
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      if (newValue < minValue || newValue === undefined) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, { newValue, oldValue, field, minValue }),
            '',
            'min',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class MaxValue<T = any> extends Validator {
  constructor(maxValue: T, message?: RenderContentRef) {
    const msg = message || translatedMessage('MaxValue');
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      if (newValue > maxValue || newValue === undefined) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, { newValue, oldValue, field, maxValue }),
            '',
            'max',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class ValueInRange<T = any> extends Validator {
  constructor(minValue: T, maxValue: T, message?: RenderContentRef) {
    const msg = message || translatedMessage('ValueInRange');
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      if (newValue < minValue || newValue > maxValue || newValue === undefined) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, { newValue, oldValue, field, minValue, maxValue }),
            '',
            'range',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
