// eslint-disable-next-line max-classes-per-file
import {
  FieldActionExecute,
  type IField,
  type IFieldAction,
} from '@/field.interface';

type ActionExecutor = (field: IField, supr: FieldActionExecute, ...params: any[]) => Promise<any>;

export default abstract class FieldActionBase implements IFieldAction {
  public abstract get classIdentifier(): symbol;
  private readonly executorFn: ActionExecutor;

  constructor(executorFn: ActionExecutor) {
    this.executorFn = executorFn;
  }

  async execute(field: IField, supr: IFieldAction['execute'], ...params: any[]): Promise<any> {
    return this.executorFn(field, supr, ...params);
  }
}
