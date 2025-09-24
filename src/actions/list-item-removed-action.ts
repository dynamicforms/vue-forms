import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ListItemRemovedActionClassIdentifier = Symbol('ListItemRemovedAction');

export class ListItemRemovedAction extends FieldActionBase {
  constructor(executorFn: (field: IField, supr: FieldActionExecute, item: any, index: number) => void) {
    super(executorFn);
  }

  static get classIdentifier() {
    return ListItemRemovedActionClassIdentifier;
  }

  execute(field: IField, supr: FieldActionExecute, item: any, index: number): void {
    return super.execute(field, supr, item, index);
  }
}
