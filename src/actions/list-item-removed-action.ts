import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ListItemRemovedActionClassIdentifier = Symbol('ListItemRemovedAction');

// eslint-disable-next-line import/prefer-default-export
export class ListItemRemovedAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (field: IField, supr: FieldActionExecute, item: any, index: number) => Promise<void>,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return ListItemRemovedActionClassIdentifier; }

  async execute(field: IField, supr: FieldActionExecute, item: any, index: number): Promise<void> {
    return super.execute(field, supr, item, index);
  }
}
