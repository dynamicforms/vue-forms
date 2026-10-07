import { truncate } from 'lodash-es';
import { type Ref, unref } from 'vue';

import type { FieldBase } from '../field-base';

import { isOptions } from './message-or-options';
import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

/**
 * The values a field may hold: a fixed list, or a reference or a callback for a list that is filled in or replaced
 * after the validator is built - the options a server answers with, or the ones another field's value leaves open.
 */
export type AllowedValues<T> = T[] | Ref<T[]> | (() => T[]);

/** How the message names the allowed values. */
export interface InAllowedValuesOptions<T> {
  /**
   * The text of an allowed value in `{allowedValues}` and `{allowedAsText}`, such as its translation. It is called
   * whenever the message is read, so a message on screen follows the locale it reads. Without it a value is named
   * as it prints.
   */
  text?: (value: T) => string;
}

export default class InAllowedValues<T = any> extends Validator {
  constructor(allowedValues: AllowedValues<T>, options?: InAllowedValuesOptions<T>);
  constructor(allowedValues: AllowedValues<T>, message?: RenderContentRef, options?: InAllowedValuesOptions<T>);
  constructor(
    allowedValues: AllowedValues<T>,
    messageOrOptions?: RenderContentRef | InAllowedValuesOptions<T>,
    options?: InAllowedValuesOptions<T>,
  ) {
    const message = isOptions<InAllowedValuesOptions<T>>(messageOrOptions) ? undefined : messageOrOptions;
    const text = (isOptions<InAllowedValuesOptions<T>>(messageOrOptions) ? messageOrOptions : options)?.text;
    // the list is read at each validation rather than at construction, so a list that arrives later is the one the
    // value is measured against and the one the message names
    const resolve = (): T[] => {
      const values = unref(allowedValues);
      return typeof values === 'function' ? values() : values;
    };
    const asText = (values: unknown[]): string => {
      const joined = values.join(', ');
      if (joined.length <= 60) return joined;
      return truncate(joined, { length: 40, separator: ', ', omission: `... (${values.length} items total)` });
    };
    // with text, the two placeholders are getters, so the texts are taken when the message is read rather than once
    // at validation
    const namesOf = (values: T[]) =>
      text
        ? {
            get allowedValues() {
              return values.map((value) => text(value));
            },
            get allowedAsText() {
              return asText(values.map((value) => text(value)));
            },
          }
        : { allowedValues: values, allowedAsText: asText(values) };

    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      const values = resolve();
      if (!values.includes(unref(newValue))) {
        const params = Object.defineProperties(
          { newValue, oldValue, field },
          Object.getOwnPropertyDescriptors(namesOf(values)),
        );
        return [
          new ValidationErrorRenderContent(
            this.messageFor(message, 'InAllowedValues', params),
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
