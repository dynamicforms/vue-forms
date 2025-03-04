import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ListItemAddedActionClassIdentifier = Symbol('ListItemAddedAction');

// eslint-disable-next-line import/prefer-default-export
export class ListItemAddedAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (field: IField, supr: FieldActionExecute, item: any, index: number) => Promise<void>,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  get classIdentifier() { return ListItemAddedActionClassIdentifier; }

  async execute(field: IField, supr: FieldActionExecute, item: any, index: number): Promise<void> {
    return super.execute(field, supr, item, index);
  }
}
