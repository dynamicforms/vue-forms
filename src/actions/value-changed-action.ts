import { type ChangeArgs, TypedFieldAction } from './field-action-base';

export const ValueChangedActionClassIdentifier = Symbol('ValueChangedAction');

export class ValueChangedAction<T = any> extends TypedFieldAction<ChangeArgs<T>, void, T> {
  static get classIdentifier() {
    return ValueChangedActionClassIdentifier;
  }
}
