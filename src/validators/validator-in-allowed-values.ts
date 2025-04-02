import { truncate } from 'lodash-es';
import { unref } from 'vue';

import { IField } from '../field.interface';

import { buildErrorMessage } from './error-message-builder';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

export default class InAllowedValues<T = any> extends Validator {
  constructor(allowedValues: T[], message?: RenderContentRef) {
    const msg = message || buildErrorMessage('Must be one of [**{allowedAsText}**]');
    let allowedAsText = allowedValues.join(', ');
    if (allowedAsText.length > 60) {
      allowedAsText = truncate(allowedAsText, {
        length: 40,
        separator: ', ',
        omission: `... (${allowedValues.length} items total)`,
      });
    }

    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      if (!allowedValues.includes(unref(newValue))) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, { newValue, oldValue, field, allowedValues, allowedAsText }),
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
