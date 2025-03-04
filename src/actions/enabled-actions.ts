// eslint-disable-next-line max-classes-per-file
import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const EnabledChangingActionClassIdentifier = Symbol('EnabledChangingAction');

export class EnabledChangingAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (
      field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean
    ) => Promise<boolean>,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  get classIdentifier() { return EnabledChangingActionClassIdentifier; }

  async execute(field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean)
    : Promise<boolean> {
    return super.execute(field, supr, newValue, oldValue);
  }
}

const EnabledChangedActionClassIdentifier = Symbol('EnabledChangedAction');

export class EnabledChangedAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (
      field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean
    ) => Promise<void>,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  get classIdentifier() { return EnabledChangedActionClassIdentifier; }

  async execute(
    field: IField,
    supr: FieldActionExecute,
    newValue: boolean,
    oldValue: boolean,
  ): Promise<void> {
    return super.execute(field, supr, newValue, oldValue);
  }
}
