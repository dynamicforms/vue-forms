import type { FieldBase } from '../field-base';

import { type CommandTarget, TargetedExecuteAction } from './submit-action';

/**
 * Puts `target` back to its baseline: on `execute()` it calls `target.rebind(target.originalValue)`, which sets the
 * value to `originalValue`, resets `touched` and revalidates, then calls the next handler in the chain and returns
 * its result.
 *
 * `canExecute()` is true while the target exists, whatever its validity.
 */
export class RejectAction extends TargetedExecuteAction {
  protected readonly target: CommandTarget;

  constructor(target: CommandTarget) {
    super((action, supr, params) => {
      const element = this.targetFor(action);
      if (!element) throw new Error('RejectAction: the target callback returned no element');
      element.rebind(element.originalValue);
      return supr(action, params);
    });
    this.target = target;
  }

  canExecute(action: FieldBase): boolean {
    return this.targetFor(action) !== undefined;
  }
}
