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
   * Whether this handler can run now on `action`. `Action.executable` is false while any of the action's
   * `ExecuteAction` handlers returns false. The base class returns true; a subclass overrides it with a condition
   * that a template can bind to, such as the validity of the form a `SubmitAction` sends. The read is reactive where
   * the condition reads reactive state.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  canExecute(action: FieldBase): boolean {
    return true;
  }
}
