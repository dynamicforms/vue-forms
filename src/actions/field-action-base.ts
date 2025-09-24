import { FieldActionExecute, type IField, type IFieldAction } from '@/field.interface';

type ActionExecutor = (field: IField, supr: FieldActionExecute, ...params: any[]) => any;

export default abstract class FieldActionBase implements IFieldAction {
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

  execute(field: IField, supr: IFieldAction['execute'], ...params: any[]): any {
    return this.executorFn(field, supr, ...params);
  }

  get eager() {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  boundToField(field: IField) {}

  unregister() {}
}
