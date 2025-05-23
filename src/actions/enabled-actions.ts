// eslint-disable-next-line max-classes-per-file
import FieldActionBase from './field-action-base';

import { FieldActionExecute, type IField } from '@/field.interface';

const EnabledChangingActionClassIdentifier = Symbol('EnabledChangingAction');

export class EnabledChangingAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (
      field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean
    ) => boolean,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return EnabledChangingActionClassIdentifier; }

  execute(field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean): boolean {
    return super.execute(field, supr, newValue, oldValue);
  }
}

const EnabledChangedActionClassIdentifier = Symbol('EnabledChangedAction');

export class EnabledChangedAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (
      field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean
    ) => void,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return EnabledChangedActionClassIdentifier; }

  execute(field: IField, supr: FieldActionExecute, newValue: boolean, oldValue: boolean): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
