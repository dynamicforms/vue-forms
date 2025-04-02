import { unref } from 'vue';

import { IField } from '../field.interface';

import { buildErrorMessage } from './error-message-builder';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

export default class Pattern<T = any> extends Validator {
  constructor(pattern: RegExp, message?: RenderContentRef) {
    const msg = message || buildErrorMessage('Value must match pattern "**{pattern}**"');
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      if (!pattern.test(String(unref(newValue)))) {
        return [
          new ValidationErrorRenderContent(this.replacePlaceholders(msg, { newValue, oldValue, field, pattern })),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
