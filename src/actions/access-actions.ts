import { type ChangeArgs, TypedFieldAction } from './field-action-base';

import type { Access } from '@/access';

const AccessChangingActionClassIdentifier = Symbol('AccessChangingAction');

/**
 * Fires before an element's `access` is written. A handler returns the access to write instead, or throws
 * `AbortEventHandlingException` to cancel the write.
 */
export class AccessChangingAction extends TypedFieldAction<ChangeArgs<Access>, Access> {
  static get classIdentifier() {
    return AccessChangingActionClassIdentifier;
  }
}

const AccessChangedActionClassIdentifier = Symbol('AccessChangedAction');

/** Fires after an element's `access` has been written. */
export class AccessChangedAction extends TypedFieldAction<ChangeArgs<Access>, void> {
  static get classIdentifier() {
    return AccessChangedActionClassIdentifier;
  }
}
