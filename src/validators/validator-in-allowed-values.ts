import { truncate } from 'lodash-es';
import { type Ref, unref } from 'vue';

import { ValidationErrorOptions, ValidationFunction, Validator } from './validator';

/**
 * The values a field may hold: a fixed list, or a ref or a callback for a list that is filled or replaced after
 * the validator is built (options returned by a server, or the options another field's value allows).
 */
export type AllowedValues<T> = T[] | Ref<T[]> | (() => T[]);

export default class InAllowedValues<T = any> extends Validator {
  constructor(allowedValues: AllowedValues<T>, options?: ValidationErrorOptions) {
    // the list is read at each validation, not at construction, so a list set later is the one the value is
    // checked against and the one the error lists
    const resolve = (): T[] => {
      const values = unref(allowedValues);
      return typeof values === 'function' ? values() : values;
    };
    const asText = (values: T[]): string => {
      const text = values.join(', ');
      if (text.length <= 60) return text;
      return truncate(text, { length: 40, separator: ', ', omission: `... (${values.length} items total)` });
    };

    const validationFn: ValidationFunction = (newValue: T, oldValue: T) => {
      const values = resolve();
      if (!values.includes(unref(newValue))) {
        return [
          this.errorFor(options, 'in_allowed_values', 'Must be one of [{allowedAsText}]', {
            newValue,
            oldValue,
            allowedValues: values,
            allowedAsText: asText(values),
          }),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
