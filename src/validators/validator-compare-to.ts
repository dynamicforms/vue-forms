import { unref } from 'vue';

import { ValueChangedAction } from '../actions';
import { IField } from '../field.interface';

import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator } from './validator';

export default class CompareTo<T = any> extends Validator {
  private unregistered = false;

  constructor(
    private otherField: IField,
    private isValidComparison: (myValue: T, otherValue: T) => boolean,
    message: RenderContentRef,
  ) {
    let listenerSet = false;
    let nVal: T;
    let oVal: T;

    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: IField) => {
      nVal = newValue;
      oVal = oldValue;
      if (!listenerSet) {
        listenerSet = true;
        this.otherField.registerAction(new ValueChangedAction(async (oField, supr, oNewValue, oOldValue) => {
          await supr(oField, oNewValue, oOldValue);
          // somewhat hackish: we just need to execute this one validator, not anything before, not anything after...
          if (!this.unregistered) await this.execute(field, async () => null, nVal, oVal);
        }));
      }
      if (!this.isValidComparison(unref(newValue), unref(this.otherField.value))) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(message, { newValue, oldValue, field, otherField: this.otherField }),
          ),
        ];
      }
      return null;
    };

    super(validationFn);
  }

  unregister() {
    this.unregistered = true;
  }
}
