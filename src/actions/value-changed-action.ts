import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

export const ValueChangedActionClassIdentifier = Symbol('ValueChangedAction');

export class ValueChangedAction<T = any> extends FieldActionBase {
  constructor(executorFn: (field: IField<T>, supr: FieldActionExecute<T>, newValue: T, oldValue: T) => void) {
    super(executorFn);
  }

  static get classIdentifier() {
    return ValueChangedActionClassIdentifier;
  }

  execute(field: IField<T>, supr: FieldActionExecute<T>, newValue: T, oldValue: T): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
