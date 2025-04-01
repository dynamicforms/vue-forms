import { truncate } from 'lodash-es';
import { unref } from 'vue';

import { IField } from '../field.interface';

import { MdString, RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

export default class InAllowedValues<T = any> extends Validator {
  constructor(
    allowedValues: T[],
    message: RenderContentRef = new MdString('Value must be one of "**{allowedAsText}**"'),
  ) {
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
            this.replacePlaceholders(message, { newValue, oldValue, field, allowedValues, allowedAsText }),
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
