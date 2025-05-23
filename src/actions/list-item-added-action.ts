import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ListItemAddedActionClassIdentifier = Symbol('ListItemAddedAction');

// eslint-disable-next-line import/prefer-default-export
export class ListItemAddedAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (field: IField, supr: FieldActionExecute, item: any, index: number) => void,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return ListItemAddedActionClassIdentifier; }

  execute(field: IField, supr: FieldActionExecute, item: any, index: number): void {
    return super.execute(field, supr, item, index);
  }
}
