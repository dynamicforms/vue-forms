import FieldActionBase from './field-action-base';

import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

const ListItemAddedActionClassIdentifier = Symbol('ListItemAddedAction');

export class ListItemAddedAction extends FieldActionBase {
  constructor(executorFn: (field: FieldBase, supr: FieldActionExecute, item: any, index: number) => void) {
    super(executorFn);
  }

  static get classIdentifier() {
    return ListItemAddedActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, item: any, index: number): void {
    return super.execute(field, supr, item, index);
  }
}
