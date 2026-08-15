import FieldActionBase from './field-action-base';

import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

const ValidChangedActionClassIdentifier = Symbol('ValidChangedAction');

export class ValidChangedAction extends FieldActionBase {
  constructor(executorFn: (field: FieldBase, supr: FieldActionExecute, newValue: boolean, oldValue: boolean) => void) {
    super(executorFn);
  }

  static get classIdentifier() {
    return ValidChangedActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, newValue: boolean, oldValue: boolean): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
