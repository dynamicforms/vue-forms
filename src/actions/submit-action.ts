import { watch } from 'vue';

import type { FieldBase } from '../field-base';
import { AbortEventHandlingException } from '../field.interface';

import { ExecuteAction } from './execute-action';

/**
 * The element a `SubmitAction` or a `RejectAction` works on: an element, or a callback that returns it for the
 * action the handler is registered on.
 */
export type CommandTarget = FieldBase | ((action: FieldBase) => FieldBase | null | undefined);

/** An `ExecuteAction` that works on a target element; `Container.confirm()` and `reject()` find it by its target. */
export abstract class TargetedExecuteAction extends ExecuteAction {
  protected abstract readonly target: CommandTarget;

  /** The element this handler works on when it runs on `action`, or undefined where the callback returns none. */
  targetFor(action: FieldBase): FieldBase | undefined {
    const target = this.target;
    return typeof target === 'function' ? (target(action) ?? undefined) : target;
  }
}

/** How a `SubmitAction` treats its target. */
export interface SubmitOptions {
  /**
   * Whether a result other than `undefined` is written back with `target.rebind(result)`, which makes it the new
   * baseline: `isChanged` is false, `touched` is false and the errors are revalidated. Defaults to true.
   */
  rebind?: boolean;
}

/** What `execute()` of an action with a `SubmitAction` resolves with after a successful submit. */
export interface SubmitResult<R = any> {
  /** The action that ran the submit. */
  action: FieldBase;
  /** The value passed to the handler: the target's `value`. */
  sent: unknown;
  /** The value the handler returned. */
  received: R;
}

/** Resolves when `element.validating` is false. */
function validated(element: FieldBase): Promise<void> {
  if (!element.validating) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = watch(
      () => element.validating,
      (validating) => {
        if (validating) return;
        stop();
        resolve();
      },
      { flush: 'sync' },
    );
  });
}

/** Why a `SubmitAction` refused to submit: the target is invalid, or a submit of the same action is running. */
export type SubmitRefusalReason = 'invalid' | 'running';

/**
 * The exception a `SubmitAction` ends with when it refuses to submit. `execute()` resolves with it; `reason` states
 * why.
 */
export class SubmitRefusedException extends AbortEventHandlingException {
  constructor(public readonly reason: SubmitRefusalReason) {
    super(reason === 'invalid' ? 'the submitted element is invalid' : 'a submit of this action is already running');
  }
}

/**
 * Sends the value of `target` to `handler`. On `execute()` it:
 *
 * 1. waits until `target.validating` is false, so a validation started in the same event is finished. It does not
 *    await `target.settled()`: the action is `busy` while it runs, so the target is `pending` until it returns;
 * 2. where `target.valid` is false, ends with a `SubmitRefusedException` with `reason` `'invalid'`, which
 *    `execute()` resolves with;
 * 3. calls `handler(target.value, target)` and awaits it;
 * 4. where the result is not `undefined` and `rebind` is not false, calls `target.rebind(result)`;
 * 5. calls the next handler in the chain and returns a `SubmitResult`: the action, the value sent and the value
 *    `handler` returned.
 *
 * A second `execute()` while a submit of the same action is running is refused with a `SubmitRefusedException`
 * with `reason` `'running'`.
 *
 * A `handler` that throws or rejects makes `execute()` reject with that error; the target is not changed. Mapping
 * a server's field errors to the fields is the handler's: it writes them to `field.errors` before it throws.
 *
 * `canExecute()` is true while the target is valid and not `pending`, so `Action.executable` disables a submit
 * button while the form is invalid or a validation is running.
 */
export class SubmitAction<R = any> extends TargetedExecuteAction {
  protected readonly target: CommandTarget;

  constructor(
    target: CommandTarget,
    handler: (value: any, target: FieldBase) => R | Promise<R>,
    options: SubmitOptions = {},
  ) {
    super(async (action, supr, params): Promise<SubmitResult<R>> => {
      const run = this.state(action, () => ({ running: false }));
      if (run.running) throw new SubmitRefusedException('running');
      run.running = true;
      try {
        const element = this.targetFor(action);
        if (!element) throw new Error('SubmitAction: the target callback returned no element');
        await validated(element);
        if (!element.valid) throw new SubmitRefusedException('invalid');
        const sent = element.value;
        const received = await handler(sent, element);
        if (received !== undefined && options.rebind !== false) element.rebind(received);
        await supr(action, params);
        return { action, sent, received };
      } finally {
        run.running = false;
      }
    });
    this.target = target;
  }

  canExecute(action: FieldBase): boolean {
    const element = this.targetFor(action);
    return element !== undefined && element.valid && !element.pending;
  }
}
