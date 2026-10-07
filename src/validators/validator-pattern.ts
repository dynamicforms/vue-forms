import { unref } from 'vue';

import type { FieldBase } from '../field-base';
import { RenderContentRef } from '../render-content';

import { ValidationFunction, Validator } from './validator';

export default class Pattern extends Validator {
  constructor(pattern: RegExp, message?: RenderContentRef) {
    const validationFn: ValidationFunction = (newValue, oldValue, field: FieldBase) => {
      if (!pattern.test(String(unref(newValue)))) {
        return [
          this.errorFor(field, message, 'pattern', 'Value must match pattern "{pattern}"', {
            newValue,
            oldValue,
            pattern,
          }),
        ];
      }
      return null;
    };

    super(validationFn);
  }
}
