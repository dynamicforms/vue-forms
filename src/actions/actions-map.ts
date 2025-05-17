import { type FieldActionExecute, type IField, AbortEventHandlingException } from '../field.interface';
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

    function ex(field: IField, ...params: any[]) {
      return action.execute(field, existingExecute, ...params);
    }
    this.set(actionType, ex);
    if (action.eager) this.eagerActions.add(action.classIdentifier);
  }

  async trigger<T extends FieldActionBase>(
    ActionClass: { new (...args: any[]): T, classIdentifier: symbol },
    field: IField,
    ...params: any[]
  ): Promise<any> {
    const identifier = ActionClass.classIdentifier;
    if (identifier === ValueChangedActionClassIdentifier) await this.triggerEager(field, ...params);
    const execute = this.get(identifier);
    try {
      if (execute) return await execute(field, ...params);
    } catch (error) {
      if (!(error instanceof AbortEventHandlingException)) throw error;
    }
    return null;
  }

  async triggerEager(field: IField, ...params: any[]): Promise<any> {
    for (const identifier of this.eagerActions) {
      const execute = this.get(identifier);
      try {
        // eslint-disable-next-line no-await-in-loop
        if (execute) await execute(field, ...params);
      } catch (error) {
        if (!(error instanceof AbortEventHandlingException)) throw error;
      }
    }
  }

  cloneWithoutValidators(): ActionsMap {
    const newActions = new ActionsMap();
    this.registeredActions.forEach((action) => {
      if (action instanceof Validator) action.unregister();
      else newActions.register(action);
    });
    return newActions;
  }
}
