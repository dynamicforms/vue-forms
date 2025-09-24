import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ListItemAddedActionClassIdentifier = Symbol('ListItemAddedAction');

export class ListItemAddedAction extends FieldActionBase {
  constructor(executorFn: (field: IField, supr: FieldActionExecute, item: any, index: number) => void) {
    super(executorFn);
  }

  static get classIdentifier() {
    return ListItemAddedActionClassIdentifier;
  }

  execute(field: IField, supr: FieldActionExecute, item: any, index: number): void {
    return super.execute(field, supr, item, index);
  }
}
