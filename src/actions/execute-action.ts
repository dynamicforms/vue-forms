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
}
