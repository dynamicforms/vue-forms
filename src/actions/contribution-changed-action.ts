import FieldActionBase from './field-action-base';

import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

export const ContributionChangedActionClassIdentifier = Symbol('ContributionChangedAction');

/**
 * Fires when what an element sends to its container's `value` changed over a transaction: the element's value if
 * its access sends it, `null` for `'disabled-null'`, and `undefined` for `'disabled'`, whose key or row is omitted.
 * The parameters are (contribution now, contribution at the last announcement).
 *
 * `ValueChangedAction` reports what the element holds; this action reports what it sends. A write into a
 * `'disabled'` field changes what the field holds and not what it sends, so it fires only `ValueChangedAction`;
 * changing a field's access changes what it sends and not what it holds, so it fires only this action. A container
 * holds its `fullValue` and sends its `value`, so a change of a member's access fires this action on the
 * containers above, and not `ValueChangedAction`.
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
