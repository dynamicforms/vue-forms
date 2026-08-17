import { type FieldBase } from '../field-base';
import { type FieldActionExecute, AbortEventHandlingException } from '../field.interface';
import { Validator } from '../validators/validator';

import FieldActionBase from './field-action-base';
import { ValueChangedActionClassIdentifier } from './value-changed-action';

export default class ActionsMap extends Map<symbol, FieldActionExecute> {
  private readonly eagerActions = new Set<symbol>();

  private readonly registeredActions: FieldActionBase[] = [];

  register(action: FieldActionBase) {
    if (!(action instanceof FieldActionBase)) throw new Error('Invalid action type');
    this.registeredActions.push(action);

    const actionType = action.classIdentifier;
    const existingExecute = this.get(actionType) || (() => null);

    function ex(field: FieldBase, ...params: any[]) {
      return action.execute(field, existingExecute, ...params);
    }
    this.set(actionType, ex);
    if (action.eager) this.eagerActions.add(action.classIdentifier);
  }

  /**
   * True when triggering this action would run something: a handler registered under the identifier, or - on the
   * value change identifier, which trigger() answers with an eager pass as well - any eager action at all. A
   * caller that has to build the parameters before it can trigger asks this first and skips building them when
   * there is nothing to receive them.
   */
  willTrigger(identifier: symbol): boolean {
    if (this.has(identifier)) return true;
    return identifier === ValueChangedActionClassIdentifier && this.eagerActions.size > 0;
  }

  trigger<T extends FieldActionBase>(
    ActionClass: (abstract new (...args: any[]) => T) & { classIdentifier: symbol },
    field: FieldBase,
    ...params: any[]
  ): any {
    const identifier = ActionClass.classIdentifier;
    if (identifier === ValueChangedActionClassIdentifier) this.triggerEager(field, ...params);
    return this.triggerChain(identifier, field, ...params);
  }

  /**
   * Runs the chain registered under one identifier and nothing else. A caller that has already run the eager
   * pass - a transaction runs it at the write, so that the validators have decided before it commits - reaches
   * the handlers through here, so the eager actions are not run a second time at the announcement.
   */
  triggerChain(identifier: symbol, field: FieldBase, ...params: any[]): any {
    const execute = this.get(identifier);
    try {
      if (execute) return execute(field, ...params);
    } catch (error) {
      if (!(error instanceof AbortEventHandlingException)) throw error;
    }
    return null;
  }

  triggerEager(field: FieldBase, ...params: any[]): any {
    for (const identifier of this.eagerActions) {
      const execute = this.get(identifier);
      try {
        if (execute) execute(field, ...params);
      } catch (error) {
        if (!(error instanceof AbortEventHandlingException)) throw error;
      }
    }
  }

  /** the validators registered in this map, in registration order */
  get validators(): Validator[] {
    return this.registeredActions.filter((action): action is Validator => action instanceof Validator);
  }

  clone(): ActionsMap {
    const newActions = new ActionsMap();
    this.registeredActions.forEach((action) => newActions.register(action));
    return newActions;
  }

  /**
   * A copy of this map carrying everything but the validators. It only leaves them out: releasing what a
   * validator installed elsewhere is the caller's to do, and only once the transaction that dropped them has
   * committed, because a rollback puts this map back with its validators in it.
   */
  cloneWithoutValidators(): ActionsMap {
    const newActions = new ActionsMap();
    this.registeredActions.forEach((action) => {
      if (!(action instanceof Validator)) newActions.register(action);
    });
    return newActions;
  }
}
