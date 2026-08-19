import { unref } from 'vue';

import { ValueChangedAction } from '../actions';
import { bindingsIn, resolveByName, resolveInScope, scopeOf } from '../binding/resolve';
import type { FieldBase } from '../field-base';

import { RenderContentRef, ValidationErrorRenderContent } from './validation-error';
import { ValidationFunction, Validator, ValidatorBindingState } from './validator';

/**
 * How the field to compare against is named. A field names it directly, a string names it by the name its
 * container holds it under, and a callback works it out from the field being validated. All three answer for the
 * record the validation is running over: handed the field of a `List`'s item template, a row compares against that
 * row's field.
 */
export type CompareToTarget = FieldBase | string | ((field: FieldBase) => FieldBase | null | undefined);

/** What the validator remembers about one field it validates. */
interface CompareToBindingState<T> extends ValidatorBindingState {
  oldValue: T;
}

export default class CompareTo<T = any> extends Validator {
  private readonly otherField: CompareToTarget;

  /**
   * The fields this validator is registered on. Registration reaches one element at a time - the rows of a list
   * take the validator on one by one, as they are built from the item template that carries it - so this is what
   * says which of the fields a declaration stands for actually carry the rule, and a field that never took it on
   * is left alone by a change of the compared field.
   */
  private readonly registrations = new WeakSet<FieldBase>();

  /**
   * The fields this validator has installed its listener on. A binding of such a field carries the listener too -
   * a binding takes on the actions of the field it was bound from - so the field it was bound from is what is
   * asked about as well, and a list of a thousand rows installs one listener rather than a thousand.
   */
  private readonly listening = new WeakSet<FieldBase>();

  /**
   * What the fields this validator was registered on were declared as. One entry stands for every binding of such a
   * field, so a change of a compared field finds the fields of the record that change happened in without a list
   * of a thousand rows being held here.
   */
  private readonly declarations = new Set<FieldBase>();

  constructor(
    otherField: CompareToTarget,
    private isValidComparison: (myValue: T, otherValue: T) => boolean,
    message: RenderContentRef,
  ) {
    const validationFn: ValidationFunction = (newValue: T, oldValue: T, field: FieldBase) => {
      this.comparisonState(field).oldValue = oldValue;

      const other = this.resolve(field);
      // a record that does not hold the compared field yet - a row still being built - reaches no verdict, and
      // the container that finishes the record runs this pass again over the field it then holds
      if (!other) {
        field.markRecordIncomplete();
        return null;
      }
      this.listenOn(other);

      if (!this.isValidComparison(unref(newValue), unref(other.value))) {
        return [
          new ValidationErrorRenderContent(
            this.replacePlaceholders(message, { newValue, oldValue, field, otherField: other }),
            '',
            'compare-to',
          ),
        ];
      }
      return null;
    };

    super(validationFn);
    this.otherField = otherField;
  }

  /** The field `field` is compared against, within the record `field` belongs to. */
  private resolve(field: FieldBase): FieldBase | undefined {
    const other = this.otherField;
    if (typeof other === 'function') return other(field) ?? undefined;
    if (typeof other === 'string') return resolveByName(other, field);
    return resolveInScope(other, scopeOf(field));
  }

  /**
   * Makes a change of `other` re-run this comparison. The listener re-runs it over the fields of the record the
   * change happened in rather than over the field that installed it, so the listener a row inherits with the field
   * it was bound from serves that row; and it re-runs this one validator, not the chain around it.
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
            // the fields a declaration stands for are the candidates; the ones that took the validator on are the
            // ones re-validated, so a rule written for one row of a list stays that row's rule
            if (!this.registrations.has(mine)) return;
            this.execute(mine, () => null, mine.value, this.comparisonState(mine).oldValue);
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
    // the errors this validator put on the binding go with the registration: the base method withdraws them, forms
    // the verdict over what is left and cancels the run in flight, and a binding that no longer carries the rule is
    // dropped from the set the compared field re-validates
    super.unregisterFrom(binding);
    this.registrations.delete(binding);
  }
}
