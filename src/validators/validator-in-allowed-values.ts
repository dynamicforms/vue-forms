import { truncate } from 'lodash-es';
import { type Ref, unref } from 'vue';

import type { FieldBase } from '../field-base';

import { translatedMessage } from './translations';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

/**
 * The values a field may hold: a fixed list, or a reference or a callback for a list that is filled in or replaced
 * after the validator is built - the options a server answers with, or the ones another field's value leaves open.
 */
export type AllowedValues<T> = T[] | Ref<T[]> | (() => T[]);

export default class InAllowedValues<T = any> extends Validator {
  constructor(allowedValues: AllowedValues<T>, message?: RenderContentRef) {
    const msg = message || translatedMessage('InAllowedValues');
    // the list is read at each validation rather than at construction, so a list that arrives later is the one the
    // value is measured against and the one the message names
    const resolve = (): T[] => {
      const values = unref(allowedValues);
      return typeof values === 'function' ? values() : values;
    };
    const asText = (values: T[]): string => {
      const text = values.join(', ');
      if (text.length <= 60) return text;
      return truncate(text, { length: 40, separator: ', ', omission: `... (${values.length} items total)` });
    };

    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      const values = resolve();
      if (!values.includes(unref(newValue))) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(msg, {
              newValue,
              oldValue,
              field,
              allowedValues: values,
              allowedAsText: asText(values),
            }),
            '',
            'in-allowed-values',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
