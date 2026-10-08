import FieldActionBase from './field-action-base';

import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

const EnabledChangingActionClassIdentifier = Symbol('EnabledChangingAction');

/**
 * Fires before a write of `access` that would change `enabled`: a change into or out of `'editable'`. It fires
 * after `AccessChangingAction`, for the access that would be written. `enabled` is read from `access`, so the
 * return value cannot set it: returning the current value of `enabled`, or throwing
 * `AbortEventHandlingException`, cancels the write of `access`; returning the new value, `null` or `undefined`
 * allows it.
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
 * Fires after a write of `access` changed `enabled`: a change into or out of `'editable'`. It fires after
 * `AccessChangedAction`; a change between two accesses that are not `'editable'` does not fire it.
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
