import { TypedFieldAction } from './field-action-base';

import type { FieldBase } from '@/field-base';

const ExecuteActionClassIdentifier = Symbol('ExecuteAction');

export class ExecuteAction extends TypedFieldAction<[params: any], any> {
  static get classIdentifier() {
    return ExecuteActionClassIdentifier;
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
