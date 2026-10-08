import { unref } from 'vue';

import { ValueChangedAction } from '../actions';
import { bindingsIn, resolveByName, resolveInScope, scopeOf } from '../binding/resolve';
import type { FieldBase } from '../field-base';

import { ValidationErrorOptions, ValidationFunction, Validator, ValidatorBindingState } from './validator';

/**
 * The element to compare against: the element itself, its name in its container, or a callback that returns it
 * for the field being validated. All three are resolved within the record the validation runs over: given an
 * element of a `List`'s item template, a row compares against that row's element.
 */
export type CompareToTarget = FieldBase | string | ((field: FieldBase) => FieldBase | null | undefined);

/** The validator's state for one field it validates. */
interface CompareToBindingState<T> extends ValidatorBindingState {
  oldValue: T;
}

export default class CompareTo<T = any> extends Validator {
  private readonly otherField: CompareToTarget;

  /**
   * The fields this validator is registered on. Registration happens one element at a time (the rows of a list
   * receive the validator one by one, as they are built from the item template), so this set determines which
   * elements of a declaration have the rule; a change of the compared element does not revalidate the others.
   */
  private readonly registrations = new WeakSet<FieldBase>();

  /**
   * The elements this validator has installed its listener on. A binding of such an element has the listener too
   * (a binding uses the actions of its declaration), so the declaration is checked as well, and a list of N rows
   * installs one listener, not N.
   */
  private readonly listening = new WeakSet<FieldBase>();

  /**
   * The declarations of the fields this validator was registered on. One entry covers every binding of such a
   * field, so a change of a compared element finds the fields of its record without this set holding every row.
   */
  private readonly declarations = new Set<FieldBase>();

  constructor(
    otherField: CompareToTarget,
    private isValidComparison: (myValue: T, otherValue: T) => boolean,
    options?: ValidationErrorOptions,
  ) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      this.comparisonState(field).oldValue = oldValue;

      const other = this.resolve(field);
      // a record that does not hold the compared element yet (a row still being built) produces no result, and the
      // container that completes the record runs this pass again
      if (!other) {
        field.markRecordIncomplete();
        return null;
      }
      this.listenOn(other);

      const otherValue = unref(other.value);
      if (!this.isValidComparison(unref(newValue), otherValue)) {
        return [
          this.errorFor(options, 'compare_to', 'Value does not match the comparison with {otherValue}', {
            newValue,
            oldValue,
            otherValue,
          }),
        ];
      }
      return null;
    };

    super(validationFn);
    this.otherField = otherField;
  }

  /** The element `field` is compared against, within the record `field` belongs to. */
  private resolve(field: FieldBase): FieldBase | undefined {
    const other = this.otherField;
    if (typeof other === 'function') return other(field) ?? undefined;
    if (typeof other === 'string') return resolveByName(other, field);
    return resolveInScope(other, scopeOf(field));
  }

  /**
   * Registers a listener so a change of `other` re-runs this comparison. The listener re-runs it over the fields of
   * the record the change happened in, not over the field that installed it, so a listener a row inherits from its
   * declaration applies to that row; it re-runs only this validator, not the whole chain.
   */
  private listenOn(other: FieldBase): void {
    if (this.listening.has(other) || this.listening.has(other.declaration)) return;
    this.listening.add(other);
    other.registerAction(
      new ValueChangedAction((oField, supr, oNewValue, oOldValue) => {
        supr(oField, oNewValue, oOldValue);
        const scope = scopeOf(oField);
        this.declarations.forEach((declaration) =>
          bindingsIn(declaration, scope).forEach((mine) => {
            // of the declaration's elements, only those the validator is registered on are revalidated, so a rule
            // registered on one row of a list applies only to that row
            if (!this.registrations.has(mine)) return;
            this.execute(mine, () => null, mine.contribution, this.comparisonState(mine).oldValue);
          }),
        );
      }),
    );
  }

  boundToBinding(binding: FieldBase) {
    this.declarations.add(binding.declaration);
    this.registrations.add(binding);
  }

  private comparisonState(field: FieldBase): CompareToBindingState<T> {
    return this.bindingState(field) as CompareToBindingState<T>;
  }

  protected newBindingState(): CompareToBindingState<T> {
    return { ...super.newBindingState(), oldValue: undefined as T };
  }

  unregisterFrom(binding: FieldBase) {
    // the errors this validator put on the binding are removed with the registration: the base method removes
    // them, recomputes validity and cancels the run in flight, and the binding is removed from the set the
    // compared element revalidates
    super.unregisterFrom(binding);
    this.registrations.delete(binding);
  }
}
