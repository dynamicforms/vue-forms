import FieldActionBase from './field-action-base';

import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

const ExecuteActionClassIdentifier = Symbol('ExecuteAction');

export class ExecuteAction extends FieldActionBase {
  constructor(executorFn: (field: FieldBase, supr: FieldActionExecute, params: any) => any) {
    super(executorFn);
  }

  static get classIdentifier() {
    return ExecuteActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, params: any): any {
    return super.execute(field, supr, params);
  }

  /**
   * Whether this handler can run now on `action`; true in the base class. The read is reactive where the condition
   * reads reactive state.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  canExecute(action: FieldBase): boolean {
    return true;
  }
}
