import { TypedFieldAction } from './field-action-base';

const ListItemRemovedActionClassIdentifier = Symbol('ListItemRemovedAction');

export class ListItemRemovedAction extends TypedFieldAction<[item: any, index: number], void> {
  static get classIdentifier() {
    return ListItemRemovedActionClassIdentifier;
  }
}
