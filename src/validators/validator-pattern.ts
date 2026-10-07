import { unref } from 'vue';

import type { FieldBase } from '../field-base';

import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

export default class Pattern extends Validator {
  constructor(pattern: RegExp, message?: RenderContentRef) {
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      if (!pattern.test(String(unref(newValue)))) {
        return [
          new ValidationErrorRenderContent(
            this.messageFor(message, 'Pattern', { newValue, oldValue, field, pattern }),
            '',
            'pattern',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
