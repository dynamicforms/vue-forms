import { isArray, isObject, isString } from 'lodash-es';
import { unref } from 'vue';

import { IField } from '../field.interface';

import { buildErrorMessage } from './error-message-builder';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

function toLength(a: any): number {
  if (a == null) return 0;
  if (isArray(a)) return a.length;
  if (isString(a)) return a.length;
  if (isObject(a) && Object.getPrototypeOf(a) === Object.prototype) return Object.keys(a).length;
  return String(a).length;
}

export default class Required<T = any> extends Validator {
  constructor(message?: RenderContentRef) {
    const msg = message || buildErrorMessage('Please enter a value');
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      if (toLength(unref(newValue)) === 0) {
        return [new ValidationErrorRenderContent(this.replacePlaceholders(msg, { newValue, oldValue, field }))];
      }
      return null;
    };

    super(validationFn);
  }
}
