import { isEqual } from 'lodash-es';
import { isRef, unref } from 'vue';

import { ValueChangedAction } from '../actions/value-changed-action';
import { type FieldBase } from '../field-base';
import { FieldActionExecute } from '../field.interface';

import {
  isCallableFunction,
  isSimpleComponentDef,
  MdString,
  RenderContentNonCallable,
  RenderContentRef,
  ValidationError,
} from './validation-error';

export type ValidationFunctionResult = ValidationError[] | null;
export type ValidationFunction<T = any> = (
  newValue: T,
  oldValue: T,
  field: FieldBase<T>,
) => ValidationFunctionResult | Promise<ValidationFunctionResult>;

interface SourceProp {
  source: symbol;
}

const ValidatorClassIdentifier = Symbol('Validator');

/**
 * Validator is a specialized action that performs validation when a field's value changes.
 * It automatically adds/removes validation errors from the field's errors array.
 */
export class Validator<T = any> extends ValueChangedAction {
  private readonly source: symbol;

  /**
   * Sequence number of the newest run of this validator, per field. Every execution takes the next number, and a
   * result is applied only while its number is still the newest one, so a slow run cannot overwrite the verdict of
   * a faster one that started after it. The key is the field because one validator instance may be registered on
   * several fields, each with a sequence of its own.
   */
  private readonly runs = new WeakMap<FieldBase<any>, number>();

  /**
   * Creates a new validator
   * @param validationFn Function that validates the field value and returns errors or null
   */
  constructor(validationFn: ValidationFunction<T>) {
    const executor = (field: FieldBase<T>, supr: FieldActionExecute<T>, newValue: T, oldValue: T) => {
      const run = (this.runs.get(field) ?? 0) + 1;
      this.runs.set(field, run);
      const epoch = field.validationEpoch;
      // a result counts only while nothing newer has been decided for this field and the field still holds the
      // validators it held when the run started
      const isCurrent = () => this.runs.get(field) === run && field.validationEpoch === epoch;

      const errors = validationFn(newValue, oldValue, field) || [];

      const processErrors = (err: ValidationFunctionResult) => {
        const mine = err?.map((e) => this.claim(e)) ?? [];
        for (let i = field.errors.length - 1; i >= 0; i--) {
          const error = field.errors[i] as ValidationError & SourceProp;
          if (error.source === this.source) {
            const idx = mine.findIndex((e) => isEqual(e, error));
            if (idx >= 0) mine.splice(idx, 1);
            else field.errors.splice(i, 1);
          }
        }

        if (mine.length > 0) field.errors.push(...mine);
        field.validate(); // Update the field's valid state
      };

      if (errors instanceof Promise) {
        field.beginValidating();
        errors
          .then(
            (err) => {
              if (isCurrent()) processErrors(err);
            },
            (reason) => {
              // a rejection yields no verdict: the errors this validator had placed on the field are withdrawn
              // and the reason is reported, so a failed check never leaves a stale message behind
              if (isCurrent()) {
                processErrors(null);
                console.error('Validation failed', reason);
              }
            },
          )
          .finally(() => field.endValidating());
      } else processErrors(errors);
      return supr(field, newValue, oldValue); // Continue the action chain
    };

    super(executor);

    // Create a unique symbol for this validator instance
    this.source = Symbol(this.constructor.name);
  }

  /**
   * Returns the error instance this validator owns and may later withdraw: the argument itself when it carries no
   * ownership stamp or already carries this validator's, a copy of it when it belongs to another validator. The
   * stamp is not configurable, so an instance one validator owns can never be reassigned to another; the copy is
   * what makes an error instance shareable between validators, and it keeps the prototype and every own property,
   * including the non-enumerable ones, so it renders exactly like the instance it was made from.
   */
  private claim(error: ValidationError): ValidationError {
    const owner = (error as ValidationError & Partial<SourceProp>).source;
    if (owner === this.source) return error;

    const stamp: PropertyDescriptor = { value: this.source, enumerable: false, configurable: false };
    if (owner === undefined) {
      Object.defineProperty(error, 'source', stamp);
      return error;
    }
    const descriptors = Object.getOwnPropertyDescriptors(error) as Record<string, PropertyDescriptor>;
    return Object.create(Object.getPrototypeOf(error), { ...descriptors, source: stamp });
  }

  static get classIdentifier() {
    return ValidatorClassIdentifier;
  }

  get eager() {
    return true;
  }

  protected replacePlaceholdersFunction(text: RenderContentRef, replace: Record<string, any>): RenderContentRef {
    return () => {
      let ret = unref(text);
      while (isCallableFunction(ret)) {
        ret = unref(this.replacePlaceholders(ret(), replace));
      }
      return ret;
    };
  }

  protected replacePlaceholders(text: RenderContentRef, replace: Record<string, any>): RenderContentRef {
    if (isCallableFunction(text)) return this.replacePlaceholdersFunction(text, replace);

    if (isSimpleComponentDef(text)) return text;
    // a Ref is resolved on read, not here: substituting once would freeze the message at the value the reference
    // held during validation, and a translated message would stay in the language that was active back then
    if (isRef(text)) {
      return this.replacePlaceholdersFunction(() => unref(text) as RenderContentNonCallable, replace);
    }
    let ret = unref(text) as string | MdString;
    Object.keys(replace).forEach((key) => {
      ret = ret.replaceAll(`{${key}}`, replace[key]);
    });
    return text instanceof MdString ? new MdString(ret.toString(), text.options, text.plugins) : ret;
  }
}
