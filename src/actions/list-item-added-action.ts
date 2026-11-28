import { TypedFieldAction } from './field-action-base';

const ListItemAddedActionClassIdentifier = Symbol('ListItemAddedAction');

export class ListItemAddedAction extends TypedFieldAction<[item: any, index: number], void> {
  static get classIdentifier() {
    return ListItemAddedActionClassIdentifier;
  }
}
