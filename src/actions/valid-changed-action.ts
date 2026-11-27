import { type ChangeArgs, TypedFieldAction } from './field-action-base';

const ValidChangedActionClassIdentifier = Symbol('ValidChangedAction');

export class ValidChangedAction extends TypedFieldAction<ChangeArgs<boolean>, void> {
  static get classIdentifier() {
    return ValidChangedActionClassIdentifier;
  }
}
