import { unref } from 'vue';

import { IField } from '../field.interface';

import { MdString, RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

export default class Pattern<T = any> extends Validator {
  constructor(pattern: RegExp, message: RenderContentRef = new MdString('Value must match pattern "**{pattern}**"')) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      if (!pattern.test(String(unref(newValue)))) {
        return [
          new ValidationErrorRenderContent(this.replacePlaceholders(message, { newValue, oldValue, field, pattern })),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
