// eslint-disable-next-line max-classes-per-file
import { isArray, isObject, isString } from 'lodash-es';

import { IField } from '../field.interface';

import { MdString, RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

function toLength(a: any): number {
  if (a == null) return 0;
  if (isArray(a)) return a.length;
  if (isString(a)) return a.length;
  if (isObject(a) && Object.getPrototypeOf(a) === Object.prototype) return Object.keys(a).length;
  return String(a).length;
}

export class MinLength<T = any> extends Validator {
  constructor(
    minLength: number,
    message: RenderContentRef = new MdString('Length must be larger or equal to **{minLength}**'),
  ) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      if (toLength(newValue) < minLength) {
        return [
          new ValidationErrorRenderContent(this.replacePlaceholders(message, { newValue, oldValue, field, minLength })),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class MaxLength<T = any> extends Validator {
  constructor(
    maxLength: number,
    message: RenderContentRef = new MdString('Length must be less than or equal to **{maxLength}**'),
  ) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      if (toLength(newValue) > maxLength) {
        return [
          new ValidationErrorRenderContent(this.replacePlaceholders(message, { newValue, oldValue, field, maxLength })),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}

export class LengthInRange<T = any> extends Validator {
  constructor(
    minLength: number,
    maxLength: number,
    message: RenderContentRef = new MdString('Length must be between **{minLength}** and **{maxLength}**'),
  ) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      const len = toLength(newValue);
      if (len < minLength || len > maxLength) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(message, { newValue, oldValue, field, minLength, maxLength }),
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
