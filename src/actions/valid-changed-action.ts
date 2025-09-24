import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ValidChangedActionClassIdentifier = Symbol('ValidChangedAction');

export class ValidChangedAction extends FieldActionBase {
  constructor(executorFn: (field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean) => void) {
    super(executorFn);
  }

  static get classIdentifier() {
    return ValidChangedActionClassIdentifier;
  }

  execute(field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
