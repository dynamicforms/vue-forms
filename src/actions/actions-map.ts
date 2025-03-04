import { type FieldActionExecute, type IField, AbortEventHandlingException } from '../field.interface';

import FieldActionBase from './field-action-base';

export default class ActionsMap extends Map<symbol, FieldActionExecute> {
  register(action: FieldActionBase) {
    if (!(action instanceof FieldActionBase)) {
      throw new Error('Invalid action type');
    }

    const actionType = action.classIdentifier;
    const existingExecute = this.get(actionType) || (() => null);

    function ex(field: IField, ...params: any[]) {
      return action.execute(field, existingExecute, ...params);
    }
    this.set(actionType, ex);
  }

  trigger<T extends FieldActionBase>(
    ActionClass: new (...args: any[]) => T,
    field: IField,
    ...params: any[]
  ): any {
    const identifier = new ActionClass(() => {}).classIdentifier;
    const execute = this.get(identifier);
    try {
      if (execute) return execute(field, ...params);
    } catch (error) {
      if (!(error instanceof AbortEventHandlingException)) throw error;
    }
    return null;
  }
}
