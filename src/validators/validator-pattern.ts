import { unref } from 'vue';

import type { FieldBase } from '../field-base';

import { translatedMessage } from './translations';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

export default class Pattern extends Validator {
  constructor(pattern: RegExp, message?: RenderContentRef) {
    const msg = message || translatedMessage('Pattern');
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      if (!pattern.test(String(unref(newValue)))) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, { newValue, oldValue, field, pattern }),
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
