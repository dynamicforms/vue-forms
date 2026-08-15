import FieldActionBase from './field-action-base';

import DisplayMode from '@/display-mode';
import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

const VisibilityChangingActionClassIdentifier = Symbol('VisibilityChangingAction');

export class VisibilityChangingAction extends FieldActionBase {
  constructor(
    executorFn: (
      field: FieldBase,
      supr: FieldActionExecute,
      newValue: DisplayMode,
      oldValue: DisplayMode,
    ) => DisplayMode,
  ) {
    super(executorFn);
  }

  static get classIdentifier() {
    return VisibilityChangingActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, newValue: DisplayMode, oldValue: DisplayMode): DisplayMode {
    return super.execute(field, supr, newValue, oldValue);
  }
}

const VisibilityChangedActionClassIdentifier = Symbol('VisibilityChangedAction');

export class VisibilityChangedAction extends FieldActionBase {
  constructor(
    executorFn: (field: FieldBase, supr: FieldActionExecute, newValue: DisplayMode, oldValue: DisplayMode) => void,
  ) {
    super(executorFn);
  }

  static get classIdentifier() {
    return VisibilityChangedActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, newValue: DisplayMode, oldValue: DisplayMode): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
