import { isEqual } from 'lodash-es';

import { ValueChangedAction } from '../actions/value-changed-action';
import { type FieldBase } from '../field-base';
import { FieldActionExecute, type IField } from '../field.interface';

import { isCustomModalContentComponentDef, MdString, RenderContentRef, ValidationError } from './validation-error';

export type ValidationFunctionResult = ValidationError[] | null;
export type ValidationFunction<T = any> = (newValue: T, oldValue: T, field: IField<T>) =>
  ValidationFunctionResult | Promise<ValidationFunctionResult>;

interface SourceProp { source: symbol }

const ValidatorClassIdentifier = Symbol('Validator');

/**
 * Validator is a specialized action that performs validation when a field's value changes.
 * It automatically adds/removes validation errors from the field's errors array.
 */
export class Validator<T = any> extends ValueChangedAction {
  private readonly source: symbol;

  /**
   * Creates a new validator
   * @param validationFn Function that validates the field value and returns errors or null
   */
  constructor(validationFn: ValidationFunction<T>) {
    const executor = (field: IField<T>, supr: FieldActionExecute<T>, newValue: T, oldValue: T) => {
      const errors = validationFn(newValue, oldValue, field) || [];

      const processErrors = (err: ValidationFunctionResult) => {
        err?.forEach(
          (e) => Object.defineProperty(e, 'source', { value: this.source, enumerable: false, configurable: false }),
        );
        for (let i = field.errors.length - 1; i >= 0; i--) {
          const error = field.errors[i] as ValidationError & SourceProp;
          if (error.source === this.source) {
            const idx = err?.findIndex((e) => isEqual(e, error)) ?? -1;
            if (idx >= 0) err?.splice(idx, 1);
            else field.errors.splice(i, 1);
          }
        }

        if (err && err.length > 0) field.errors.push(...err);
        field.validate(); // Update the field's valid state
      };

      if (errors instanceof Promise) {
        // @ts-ignore
        field.validating = (++(<FieldBase> field).validatingCount) > 0;
        errors
          .then((err) => processErrors(err))
          .finally(() => {
            // @ts-ignore
            (<FieldBase> field).validatingCount = Math.max(0, (<FieldBase> field).validatingCount - 1);
            // @ts-ignore
            field.validating = (<FieldBase>field).validatingCount > 0;
          });
      } else processErrors(errors);
      return supr(field, newValue, oldValue); // Continue the action chain
    };

    super(executor);

    // Create a unique symbol for this validator instance
    this.source = Symbol(this.constructor.name);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return ValidatorClassIdentifier; }

  // eslint-disable-next-line class-methods-use-this
  get eager() { return true; }

  // eslint-disable-next-line class-methods-use-this
  protected replacePlaceholders(text: RenderContentRef, replace: Record<string, any>) {
    if (isCustomModalContentComponentDef(text)) return text;
    let ret = (text as string | MdString);
    Object.keys(replace).forEach((key) => { ret = ret.replaceAll(`{${key}}`, replace[key]); });
    return (text instanceof MdString) ? new MdString(ret) : ret;
  }
}
