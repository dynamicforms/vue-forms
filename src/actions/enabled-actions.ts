import FieldActionBase from './field-action-base';

import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

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
