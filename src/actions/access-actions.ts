import FieldActionBase from './field-action-base';

import type { Access } from '@/access';
import type { FieldBase } from '@/field-base';
import { FieldActionExecute } from '@/field.interface';

const AccessChangingActionClassIdentifier = Symbol('AccessChangingAction');

/**
 * Asked before an element's `access` is written. A handler answers with the access to write instead, or throws
 * `AbortEventHandlingException` to refuse the write.
 */
export class AccessChangingAction extends FieldActionBase {
  constructor(executorFn: (field: FieldBase, supr: FieldActionExecute, newValue: Access, oldValue: Access) => Access) {
    super(executorFn);
  }

  static get classIdentifier() {
    return AccessChangingActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, newValue: Access, oldValue: Access): Access {
    return super.execute(field, supr, newValue, oldValue);
  }
}

const AccessChangedActionClassIdentifier = Symbol('AccessChangedAction');

/** Told once an element's `access` has been written. */
export class AccessChangedAction extends FieldActionBase {
  constructor(executorFn: (field: FieldBase, supr: FieldActionExecute, newValue: Access, oldValue: Access) => void) {
    super(executorFn);
  }

  static get classIdentifier() {
    return AccessChangedActionClassIdentifier;
  }

  execute(field: FieldBase, supr: FieldActionExecute, newValue: Access, oldValue: Access): void {
    return super.execute(field, supr, newValue, oldValue);
  }
}
