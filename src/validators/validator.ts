import { isEqual } from 'lodash-es';

import { ValueChangedAction } from '../actions/value-changed-action';
import { FieldActionExecute, type IField } from '../field.interface';

import { isCustomModalContentComponentDef, MdString, RenderContentRef, ValidationError } from './validation-error';

export type ValidationFunction<T = any> = (newValue: T, oldValue: T, field: IField<T>) => ValidationError[] | null;

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
    const executor = async (field: IField<T>, supr: FieldActionExecute<T>, newValue: T, oldValue: T) => {
      const errors = validationFn(newValue, oldValue, field) || [];
      errors.forEach(
        (err) => Object.defineProperty(err, 'source', { value: this.source, enumerable: false, configurable: false }),
      );

      for (let i = field.errors.length - 1; i >= 0; i--) {
        const error = field.errors[i] as ValidationError & SourceProp;
        if (error.source === this.source) {
          const idx = errors.findIndex((e) => isEqual(e, error));
          if (idx >= 0) errors.splice(idx, 1);
          else field.errors.splice(i, 1);
        }
      }

      if (errors.length > 0) field.errors.push(...errors);
      field.validate(); // Update the field's valid state
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
