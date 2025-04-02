// eslint-disable-next-line max-classes-per-file
import FieldActionBase from './field-action-base';

import DisplayMode from '@/display-mode';
import { FieldActionExecute, type IField } from '@/field.interface';

const VisibilityChangingActionClassIdentifier = Symbol('VisibilityChangingAction');

export class VisibilityChangingAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (
      field: IField, supr: FieldActionExecute, newValue: DisplayMode, oldValue: DisplayMode
    ) => Promise<DisplayMode>,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return VisibilityChangingActionClassIdentifier; }

  async execute(
    field: IField,
    supr: FieldActionExecute,
    newValue: DisplayMode,
    oldValue: DisplayMode,
  ): Promise<DisplayMode> {
    return super.execute(field, supr, newValue, oldValue);
  }
}

const VisibilityChangedActionClassIdentifier = Symbol('VisibilityChangedAction');

export class VisibilityChangedAction extends FieldActionBase {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(
    executorFn: (
      field: IField, supr: FieldActionExecute, newValue: DisplayMode, oldValue: DisplayMode,
    ) => Promise<void>,
  ) {
    super(executorFn);
  }

  // eslint-disable-next-line class-methods-use-this
  static get classIdentifier() { return VisibilityChangedActionClassIdentifier; }

  async execute(
    field: IField,
    supr: FieldActionExecute,
    newValue: DisplayMode,
    oldValue: DisplayMode,
  ): Promise<void> {
    return super.execute(field, supr, newValue, oldValue);
  }
}
