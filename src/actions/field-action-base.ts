import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';
import { currentTransaction } from '@/transaction';

/**
 * Marks an action that runs outermost in its chain: `ActionsMap` keeps it above every action registered without
 * the mark, so a handler that does not call `supr` cannot keep it from running. The package does not export it.
 */
export const Outermost = Symbol('FieldActionBase.outermost');

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
   * The per-element state of this action. An action instance is shared (a `List` row has the same instances as
   * the item template), so state about the element it runs over is stored per element: a validation result, a
   * sequence number, a listener it installed. The keys are weak, so the state for a row is released with the row.
   */
  private readonly states = new WeakMap<object, any>();

  constructor(executorFn: ActionExecutor) {
    this.executorFn = executorFn;
  }

  /**
   * Returns this action's state for `key`, created by `init` on first access. The key is the element the action
   * runs over, or the record that element belongs to if the state concerns the whole record.
   */
  protected state<S>(key: object, init: () => S): S {
    if (!this.states.has(key)) this.states.set(key, init());
    return this.states.get(key) as S;
  }

  /**
   * Drops this action's state for `key`, so the next `state()` call creates it again. A rollback of the operation
   * that dropped it puts it back.
   */
  protected forgetState(key: object): void {
    if (!this.states.has(key)) return;
    const state = this.states.get(key);
    this.states.delete(key);
    currentTransaction()?.whenRolledBack(() => this.states.set(key, state));
  }

  execute(field: FieldBase, supr: FieldActionExecute, ...params: any[]): any {
    return this.executorFn(field, supr, ...params);
  }

  get eager() {
    return false;
  }

  /**
   * Called when this action is bound to `binding`. It runs once per element the action is registered on, bindings
   * of that element included: a binding uses the action instances of its declaration, and each is called with the
   * binding.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  boundToBinding(binding: FieldBase) {}

  /**
   * Called when `binding` no longer has this action; an override removes what running the action left on it. It
   * receives one element because the same instance stays registered on other elements. It runs inside the
   * operation that removes the registration, so a rollback of that operation restores both the registration and
   * what this method removed.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unregisterFrom(binding: FieldBase) {}

  /**
   * Called when `binding` is reset to a new binding of its declaration: a member of a bound group, or a `List` row
   * reused for another record. An override drops what it keeps about the element's state before the reset; the
   * element's eager actions run again once its record is complete.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resetBinding(binding: FieldBase) {}
}
