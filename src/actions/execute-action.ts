import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ExecuteActionClassIdentifier = Symbol('ExecuteAction');

// eslint-disable-next-line import/prefer-default-export
export class ExecuteAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (field: IField, supr: FieldActionExecute, params: any) => any,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return ExecuteActionClassIdentifier; }

  execute(field: IField, supr: FieldActionExecute, params: any): any {
    return super.execute(field, supr, params);
  }
}
