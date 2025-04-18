// eslint-disable-next-line max-classes-per-file
import { IField } from '../field.interface';

import { buildErrorMessage } from './error-message-builder';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

export class MinValue<T = any> extends Validator {
  constructor(minValue: T, message?: RenderContentRef) {
    const msg = message || buildErrorMessage('Value must be larger or equal to **{minValue}**');
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      if (newValue < minValue || newValue === undefined) {
        return [
          new ValidationErrorRenderContent(this.replacePlaceholders(msg, { newValue, oldValue, field, minValue })),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class MaxValue<T = any> extends Validator {
  constructor(maxValue: T, message?: RenderContentRef) {
    const msg = message || buildErrorMessage('Value must be less than or equal to **{maxValue}**');
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      if (newValue > maxValue || newValue === undefined) {
        return [
          new ValidationErrorRenderContent(this.replacePlaceholders(msg, { newValue, oldValue, field, maxValue })),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class ValueInRange<T = any> extends Validator {
  constructor(minValue: T, maxValue: T, message?: RenderContentRef) {
    const msg = message || buildErrorMessage('Value must be between **{minValue}** and **{maxValue}**');
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      if (newValue < minValue || newValue > maxValue || newValue === undefined) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, { newValue, oldValue, field, minValue, maxValue }),
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
