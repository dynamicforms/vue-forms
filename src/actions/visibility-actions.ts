import { type ChangeArgs, TypedFieldAction } from './field-action-base';

import type { Visibility } from '@/visibility';

const VisibilityChangingActionClassIdentifier = Symbol('VisibilityChangingAction');

export class VisibilityChangingAction extends TypedFieldAction<ChangeArgs<Visibility>, Visibility> {
  static get classIdentifier() {
    return VisibilityChangingActionClassIdentifier;
  }
}

const VisibilityChangedActionClassIdentifier = Symbol('VisibilityChangedAction');

export class VisibilityChangedAction extends TypedFieldAction<ChangeArgs<Visibility>, void> {
  static get classIdentifier() {
    return VisibilityChangedActionClassIdentifier;
  }
}
