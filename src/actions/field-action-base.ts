import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

type ActionExecutor = (field: FieldBase, supr: FieldActionExecute, ...params: any[]) => any;

export default abstract class FieldActionBase {
  public static get classIdentifier(): symbol {
    throw new Error('classIdentifier must be declared');
  }

  public get classIdentifier(): symbol {
    return (<any>this.constructor).classIdentifier;
  }

  private readonly executorFn: ActionExecutor;

  constructor(executorFn: ActionExecutor) {
    this.executorFn = executorFn;
  }

  execute(field: FieldBase, supr: FieldActionExecute, ...params: any[]): any {
    return this.executorFn(field, supr, ...params);
  }

  get eager() {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  boundToField(field: FieldBase) {}

  unregister() {}
}
