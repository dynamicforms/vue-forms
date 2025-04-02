import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const ValidChangedActionClassIdentifier = Symbol('ValidChangedAction');

// eslint-disable-next-line import/prefer-default-export
export class ValidChangedAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (
      field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean,
    ) => Promise<void>,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return ValidChangedActionClassIdentifier; }

  async execute(
    field: IField,
    supr: FieldActionExecute,
    newValue: boolean,
    oldValue: boolean,
  ): Promise<void> {
    return super.execute(field, supr, newValue, oldValue);
  }
}
