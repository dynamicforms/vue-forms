import { ValueChangedAction } from '../actions/value-changed-action';
import { BeginValidating, ValidationEpoch } from '../element-state';
import { type FieldBase } from '../field-base';
import { FieldActionExecute } from '../field.interface';
import { currentTransaction, SentNowhere, transaction, transactional } from '../transaction';

import { ValidationError } from './validation-error';

export type ValidationFunctionResult = ValidationError[] | null;
/**
 * The validation of a value. `signal` aborts when the result of this call will no longer be applied: a newer run
 * over the same field, the validator's removal from the field once that removal is committed, a rolled-back
 * transaction. An asynchronous check passes it to the work it starts, so that work is cancelled. A function with
 * nothing to cancel ignores it.
 */
export type ValidationFunction<T = any> = (
  newValue: T,
  oldValue: T,
  field: FieldBase<T>,
  signal: AbortSignal,
) => ValidationFunctionResult | Promise<ValidationFunctionResult>;

interface SourceProp {
  source: symbol;
}

/** The validator's state for one field it is registered on; a subclass extends it. */
export interface ValidatorBindingState {
  run: number;
  /** cancels the asynchronous run in flight over the field; undefined while no run is pending */
  abandon?: () => void;
}

/**
 * The `code` and `detail` a built-in validator uses on its error in place of its own. A `detail` requires a `code`:
 * a renderer chooses the text by the code, so a detail under the validator's own code is not shown where the
 * renderer has a text for that code.
 */
export type ValidationErrorOptions =
  | {
      /** The error's `code`. Defaults to the validator's own, such as `required`. */
      code?: string;
      detail?: never;
    }
  | {
      /** The error's `code`. */
      code: string;
      /** The error's English `detail`, plain text. `{name}` placeholders are replaced with the error's `params`. */
      detail?: string;
    };

const ValidatorClassIdentifier = Symbol('Validator');

/** Replaces each `{name}` placeholder in `template` with `params[name]`; one without a matching param stays. */
function interpolate(template: string, params: Record<string, unknown>): string {
  // one pass over the template, so a substituted value that contains a placeholder is not substituted again
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

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
    const executor = (field: FieldBase<T>, supr: FieldActionExecute<T>, newValue: T, oldValue: T) => {
      const runs = this.bindingState(field);
      // the pending run over this field, which this run replaces
      const superseded = runs.abandon;
      const run = ++runs.run;
      const epoch = field[ValidationEpoch];
      // the transaction this run started in: if it is rolled back, the run's result is not applied, because the
      // value it examined was rolled back
      const startedIn = currentTransaction();
      // a result is applied only if no newer run has started for this field, the field still has the validators it
      // had when the run started, the change that started it was not rolled back, and the run was not cancelled.
      // Cancellation is the only condition that does not read the field: the run's work has been aborted, so its
      // result is discarded
      let abandoned = false;
      const isCurrent = () =>
        !abandoned && runs.run === run && field[ValidationEpoch] === epoch && !startedIn?.rolledBack;

      // the work a validation function starts is cancelled when isCurrent becomes false; a run for which isCurrent
      // is still true is not cancelled
      const controller = new AbortController();
      const abandon = () => {
        if (isCurrent()) return;
        abandoned = true;
        if (runs.abandon === abandon) runs.abandon = undefined;
        controller.abort();
      };
      // this run now has the newest number, so the run it replaces is no longer current and its signal aborts
      superseded?.();

      // an element that is not sent is not validated: the run produces no errors and removes this validator's
      // errors
      const errors = field[SentNowhere]() ? [] : validationFn(newValue, oldValue, field, controller.signal) || [];

      // replacing this validator's errors and recomputing validity are one change: a run that settles after the
      // operation that started it opens its own transaction here, and one that settles during it joins the open
      // transaction
      const processErrors = (err: ValidationFunctionResult) =>
        transaction(() => {
          const mine = err?.map((e) => this.claim(e)) ?? [];
          for (let i = field.errors.length - 1; i >= 0; i--) {
            const error = field.errors[i] as ValidationError & SourceProp;
            if (error.source === this.source) {
              const idx = mine.findIndex((e) => e.sameAs(error));
              if (idx >= 0) mine.splice(idx, 1);
              else field.errors.splice(i, 1);
            }
          }

          if (mine.length > 0) field.errors.push(...mine);
          field.validate(); // recompute the field's validity
        });

      if (errors instanceof Promise) {
        // only a pending run can be cancelled; a rollback of the transaction reverts the change this run examines,
        // so it cancels the run
        runs.abandon = abandon;
        startedIn?.whenRolledBack(abandon);
        const endValidating = field[BeginValidating]();
        errors
          .then(
            (err) => {
              if (isCurrent()) processErrors(err);
            },
            (reason) => {
              // a rejection replaces this validator's errors with one `validation_failed` error, so the field is
              // invalid and the form cannot be submitted until a later run of the validator succeeds. The error has
              // this validator's source stamp, so the next successful run removes it like any other error of its
              // own. The error message says only that the check did not complete, so the reason is logged.
              if (isCurrent()) {
                processErrors([new ValidationError('validation_failed', {}, 'Validation could not be completed')]);
                console.error('Validation failed', reason);
              }
            },
          )
          .finally(() => {
            if (runs.abandon === abandon) runs.abandon = undefined;
            endValidating();
          })
          // applying a result fires ValidChangedAction; this catch logs an exception thrown by a handler, which
          // would otherwise be an unhandled rejection
          .catch((error) => console.error('Validation failed', error));
      } else processErrors(errors);
      return supr(field, newValue, oldValue); // Continue the action chain
    };

    super(executor);

    // a unique symbol for this validator instance
    this.source = Symbol(this.constructor.name);
  }

  /**
   * Returns the error instance this validator owns and may later remove: the argument itself if it has no
   * ownership stamp or already has this validator's, and a copy if it belongs to another validator. The stamp is
   * not configurable, so an instance owned by one validator cannot be reassigned to another; the copy allows one
   * error instance to be shared between validators, and keeps the prototype and every own property, including the
   * non-enumerable ones, so it renders like the original.
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

  /**
   * Removes this validator from `field`: the errors it put there are removed and validity is recomputed over the
   * remaining validators. Otherwise the field would stay invalid on an error no validator removes.
   *
   * A run in flight over the field is cancelled when the removal is committed, not earlier: a rollback restores the
   * validator and its epoch, and the run, still active, then applies its result. Cancelling at the removal would
   * leave the field valid over an unchecked value after a rollback.
   */
  unregisterFrom(field: FieldBase) {
    transactional((tx) => {
      tx.whenCommitted(() => this.abandonRun(field));
      for (let i = field.errors.length - 1; i >= 0; i--) {
        if ((field.errors[i] as ValidationError & SourceProp).source === this.source) field.errors.splice(i, 1);
      }
      field.validate();
    });
  }

  /**
   * Cancels the asynchronous run in flight over `field`, if any. It is called after the validator is removed from
   * the field: the field's validation epoch has changed, so the run's result is discarded and its signal aborts.
   */
  protected abandonRun(field: FieldBase): void {
    this.bindingState(field).abandon?.();
  }

  /**
   * The validator's state for one of the fields it validates. One instance may be registered on several fields
   * (every row of a list has the same instances as the item template), so each field has its own state. A subclass
   * extends it by overriding `newBindingState`.
   */
  protected bindingState(field: FieldBase<any>): ValidatorBindingState {
    return this.state(field, () => this.newBindingState());
  }

  /**
   * The initial state for a field. `run` is the sequence number of the newest run over that field: every execution
   * takes the next number and a result is applied only while its number is the newest, so a slow run cannot
   * overwrite the result of a faster one that started after it.
   */
  protected newBindingState(): ValidatorBindingState {
    return { run: 0 };
  }

  /**
   * Returns the error a built-in validator reports: `code` and `detail` from `options` if set, the validator's own
   * otherwise, with `params` substituted into the detail.
   */
  protected errorFor(
    options: ValidationErrorOptions | undefined,
    code: string,
    detail: string,
    params: Record<string, unknown>,
  ): ValidationError {
    return new ValidationError(options?.code ?? code, params, interpolate(options?.detail ?? detail, params));
  }
}
