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

  /**
   * What this action remembers about one of the elements it serves. An action instance is shared - a `List` row
   * carries the instances the item template carries - so anything an action holds about the element it last ran
   * over belongs to that element rather than to the action: a verdict, a sequence number, a listener it installed.
   * The keys are weak, so what an action remembers about a row is released with the row.
   */
  private readonly states = new WeakMap<object, any>();

  constructor(executorFn: ActionExecutor) {
    this.executorFn = executorFn;
  }

  /**
   * This action's state for `key`, created by `init` the first time it is asked for. The key is the element the
   * action is running over, or the record that element belongs to where what is remembered is a fact about the
   * whole record.
   */
  protected state<S>(key: object, init: () => S): S {
    if (!this.states.has(key)) this.states.set(key, init());
    return this.states.get(key) as S;
  }

  execute(field: FieldBase, supr: FieldActionExecute, ...params: any[]): any {
    return this.executorFn(field, supr, ...params);
  }

  get eager() {
    return false;
  }

  /**
   * Announces that this action now serves `binding`. It runs once per element the action is registered on, the
   * copies of that element included: a copy takes on the instances it was copied from and each is told about the
   * copy as it does.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  boundToBinding(binding: FieldBase) {}

  /**
   * Announces that `binding` no longer holds this action, and takes back what running it left there. It names one
   * element rather than the action as a whole, because the instance goes on serving every other element it was
   * registered on. It runs inside the operation that drops the registration, so an operation that unwinds puts the
   * registration and what this took back both back.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unregisterFrom(binding: FieldBase) {}
}
