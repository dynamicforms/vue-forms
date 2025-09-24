import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ExecuteActionClassIdentifier = Symbol('ExecuteAction');

export class ExecuteAction extends FieldActionBase {
  constructor(executorFn: (field: IField, supr: FieldActionExecute, params: any) => any) {
    super(executorFn);
  }

  static get classIdentifier() {
    return ExecuteActionClassIdentifier;
  }

  execute(field: IField, supr: FieldActionExecute, params: any): any {
    return super.execute(field, supr, params);
  }
}
