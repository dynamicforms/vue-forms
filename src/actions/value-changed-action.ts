import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

export const ValueChangedActionClassIdentifier = Symbol('ValueChangedAction');

// eslint-disable-next-line import/prefer-default-export
export class ValueChangedAction<T = any> extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (
      field: IField<T>, supr: FieldActionExecute<T>, newValue: T, oldValue: T,
    ) => void,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return ValueChangedActionClassIdentifier; }

  execute(
    field: IField<T>,
    supr: FieldActionExecute<T>,
    newValue: T,
    oldValue: T,
  ): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
