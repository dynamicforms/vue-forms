import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ValueChangedActionClassIdentifier = Symbol('ValueChangedAction');

// eslint-disable-next-line import/prefer-default-export
export class ValueChangedAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (
      field: IField, supr: FieldActionExecute, newValue: any, oldValue: any,
    ) => Promise<void>,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  get classIdentifier() { return ValueChangedActionClassIdentifier; }

  async execute(
    field: IField,
    supr: FieldActionExecute,
    newValue: any,
    oldValue: any,
  ): Promise<void> {
    return super.execute(field, supr, newValue, oldValue);
  }
}
