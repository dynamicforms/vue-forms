import FieldActionBase from './field-action-base';

import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

const EnabledChangingActionClassIdentifier = Symbol('EnabledChangingAction');

/**
 * Asked before a write of `access` that would change `enabled`: a switch into or out of `'editable'`. It is asked
 * after `AccessChangingAction`, over the access that would be written. `enabled` is read from `access`, so the
 * answer cannot set it: answering with the value `enabled` has now, or throwing `AbortEventHandlingException`,
 * refuses the write of `access`, and answering with the new value, `null` or `undefined` lets it through.
 */
export class EnabledChangingAction extends FieldActionBase {
  constructor(
    executorFn: (field: FieldBase, supr: FieldActionExecute, newValue: boolean, oldValue: boolean) => boolean,
  ) {
    super(executorFn);
  }

  static get classIdentifier() {
    return EnabledChangingActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, newValue: boolean, oldValue: boolean): boolean {
    return super.execute(field, supr, newValue, oldValue);
  }
}

const EnabledChangedActionClassIdentifier = Symbol('EnabledChangedAction');

/**
 * Told once a write of `access` changed `enabled`: a switch into or out of `'editable'`. It fires after
 * `AccessChangedAction`, and a switch between two accesses that are not `'editable'` does not fire it.
 */
export class EnabledChangedAction extends FieldActionBase {
  constructor(executorFn: (field: FieldBase, supr: FieldActionExecute, newValue: boolean, oldValue: boolean) => void) {
    super(executorFn);
  }

  static get classIdentifier() {
    return EnabledChangedActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, newValue: boolean, oldValue: boolean): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
