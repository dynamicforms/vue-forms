import { isArray, isObject, isString } from 'lodash-es';
import { unref } from 'vue';

import type { FieldBase } from '../field-base';

import { isOptions } from './message-or-options';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

function toLength(a: any): number {
  if (a == null) return 0;
  if (isArray(a)) return a.length;
  if (isString(a)) return a.length;
  if (isObject(a) && Object.getPrototypeOf(a) === Object.prototype) return Object.keys(a).length;
  return String(a).length;
}

/** How the value is read before its length is taken. */
export interface RequiredOptions {
  /**
   * Whether a string is trimmed before it is measured, so that whitespace alone is no value. Defaults to true.
   * Set it to false where the spaces are part of what the field holds.
   */
  trim?: boolean;
}

export default class Required extends Validator {
  constructor(options?: RequiredOptions);
  constructor(message?: RenderContentRef, options?: RequiredOptions);
  constructor(messageOrOptions?: RenderContentRef | RequiredOptions, options?: RequiredOptions) {
    const message = isOptions<RequiredOptions>(messageOrOptions) ? undefined : messageOrOptions;
    const trim = (isOptions<RequiredOptions>(messageOrOptions) ? messageOrOptions : options)?.trim ?? true;
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      const value = unref(newValue);
      if (toLength(trim && isString(value) ? value.trim() : value) === 0) {
        return [
          new ValidationErrorRenderContent(
            this.messageFor(message, 'Required', { newValue, oldValue, field }),
            '',
            'required',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
