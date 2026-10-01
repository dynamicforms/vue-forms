import FieldActionBase from './field-action-base';

import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';
import type { Visibility } from '@/visibility';

const VisibilityChangingActionClassIdentifier = Symbol('VisibilityChangingAction');

export class VisibilityChangingAction extends FieldActionBase {
  constructor(
    executorFn: (field: FieldBase, supr: FieldActionExecute, newValue: Visibility, oldValue: Visibility) => Visibility,
  ) {
    super(executorFn);
  }

  static get classIdentifier() {
    return VisibilityChangingActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, newValue: Visibility, oldValue: Visibility): Visibility {
    return super.execute(field, supr, newValue, oldValue);
  }
}

const VisibilityChangedActionClassIdentifier = Symbol('VisibilityChangedAction');

export class VisibilityChangedAction extends FieldActionBase {
  constructor(
    executorFn: (field: FieldBase, supr: FieldActionExecute, newValue: Visibility, oldValue: Visibility) => void,
  ) {
    super(executorFn);
  }

  static get classIdentifier() {
    return VisibilityChangedActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, newValue: Visibility, oldValue: Visibility): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
