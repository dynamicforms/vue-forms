import FieldActionBase from './field-action-base';

import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

export const ContributionChangedActionClassIdentifier = Symbol('ContributionChangedAction');

/**
 * Told what an element contributes to its container's `value` once that changed over a transaction: the element's
 * value where its access sends it, `null` for `'disabled-null'`, and `undefined` for `'disabled'`, whose key or row
 * is left out. The pair carried is (contribution now, contribution at the last announcement).
 *
 * It answers a different question from `ValueChangedAction`, which reports what the element holds. A write into a
 * `'disabled'` field changes what the field holds and not what it sends, so it fires `ValueChangedAction` alone;
 * switching a field's access changes what it sends and not what it holds, so it fires this action alone. On a
 * container, what it holds is its `fullValue` and what it sends is its `value`, so a change of a member's access
 * reaches the containers above as a change of their contribution, never of their value.
 */
export class ContributionChangedAction<T = any> extends FieldActionBase {
  constructor(
    executorFn: (field: FieldBase<T>, supr: FieldActionExecute<T>, newValue: unknown, oldValue: unknown) => void,
  ) {
    super(executorFn);
  }

  static get classIdentifier() {
    return ContributionChangedActionClassIdentifier;
  }

  execute(field: FieldBase<T>, supr: FieldActionExecute<T>, newValue: unknown, oldValue: unknown): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
