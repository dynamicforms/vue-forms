import { type FieldBase } from '../field-base';
import { AbortEventHandlingException } from '../field.interface';
import { Validator } from '../validators/validator';

import FieldActionBase from './field-action-base';

/**
 * The actions one declaration has registered, in registration order. A trigger walks them from the end backwards
 * and skips the ones registered under another identifier, so the newest registration of an identifier is its
 * outermost handler and calls the earlier ones through its `supr` argument. A handler that does not call `supr`
 * ends the run, and one that calls it may transform the result.
 *
 * The array is the only index. An element has few actions, and a linear walk over a few entries is faster and
 * smaller than a keyed lookup.
 */
export default class ActionsMap {
  /**
   * Every action registered here, in registration order. Unregistering replaces the array instead of modifying it,
   * so a run in progress finishes on the array it started with and the removal takes effect from the next trigger.
   */
  private actions: FieldActionBase[] = [];

  /**
   * Registers `action`. It becomes the outermost handler of its identifier, or, if `before` is given, is inserted
   * at the position of `before`, so `before` wraps it and calls it through `supr`. This adds an action to an
   * existing chain inside a handler that is already registered. Throws if `before` is not registered here under the
   * same identifier.
   */
  register(action: FieldActionBase, before?: FieldActionBase): void {
    if (!(action instanceof FieldActionBase)) throw new Error('Invalid action type');
    const at = before ? this.actions.indexOf(before) : -1;
    if (before && (before.classIdentifier !== action.classIdentifier || at < 0)) {
      throw new Error('Action to register before is not registered under the same identifier');
    }
    if (at < 0) this.actions.push(action);
    else this.actions.splice(at, 0, action);
  }

  /** Unregisters `action` and returns whether it was registered here. */
  unregister(action: FieldActionBase): boolean {
    if (!this.actions.includes(action)) return false;
    this.actions = this.actions.filter((registered) => registered !== action);
    return true;
  }

  /** True if any action is registered under `identifier`. */
  willTrigger(identifier: symbol): boolean {
    return this.actions.some((action) => action.classIdentifier === identifier);
  }

  /** True if any eager action is registered, under any identifier. */
  get hasEager(): boolean {
    return this.actions.some((action) => action.eager);
  }

  /** Runs the actions registered under `ActionClass` and returns the result of the outermost one. */
  trigger<T extends FieldActionBase>(
    ActionClass: (abstract new (...args: any[]) => T) & { classIdentifier: symbol },
    field: FieldBase,
    ...params: any[]
  ): any {
    return this.run(ActionClass.classIdentifier, false, field, params);
  }

  /**
   * Runs the eager actions of every identifier, each identifier's group separately. A group starts at its outermost
   * eager action, the last one registered under that identifier.
   */
  triggerEager(field: FieldBase, ...params: any[]): void {
    const actions = this.actions;
    for (let index = actions.length - 1; index >= 0; index--) {
      const action = actions[index];
      if (!action.eager) continue;
      // the group runs once, from its outermost eager action; the earlier ones are called through supr
      if (ActionsMap.outermostEager(actions, index)) {
        try {
          const result = this.walk(actions, index, action.classIdentifier, true, field, params);
          // an abort from an asynchronous handler arrives as a rejection, which the catch below does not receive; it
          // is handled here so it is not reported as unhandled. Any other rejection is rethrown.
          if (ActionsMap.isPromise(result)) {
            result.then(undefined, (error: unknown) => {
              if (!(error instanceof AbortEventHandlingException)) throw error;
            });
          }
        } catch (error) {
          // an abort ends only its own group; the other groups are separate rules and still run
          if (!(error instanceof AbortEventHandlingException)) throw error;
        }
      }
    }
  }

  /** Runs only the eager actions registered under `identifier`. */
  triggerEagerFor(identifier: symbol, field: FieldBase, ...params: any[]): any {
    return this.run(identifier, true, field, params);
  }

  /** the validators registered here, in registration order */
  /** The registered actions with `identifier`, in registration order. */
  ofClass(identifier: symbol): FieldActionBase[] {
    return this.actions.filter((action) => action.classIdentifier === identifier);
  }

  get validators(): Validator[] {
    return this.actions.filter((action): action is Validator => action instanceof Validator);
  }

  /**
   * Binds every action in this map to `owner`. A binding uses its declaration's map, so this notifies the actions
   * already in it of the new element, as registering an action binds it to the existing elements.
   */
  bindTo(owner: FieldBase): void {
    this.actions.forEach((action) => action.boundToBinding(owner));
  }

  /** True if no eager action of the same identifier follows `index`, so `index` is the group's entry point. */
  private static outermostEager(actions: FieldActionBase[], index: number): boolean {
    const identifier = actions[index].classIdentifier;
    for (let above = actions.length - 1; above > index; above--) {
      if (actions[above].eager && actions[above].classIdentifier === identifier) return false;
    }
    return true;
  }

  /**
   * True if `value` is a promise, which a walk through an asynchronous handler returns. The test checks the type,
   * not a `then` member: a handler may return a value object with a `then` member, and calling it would replace the
   * result with that call's return value.
   */
  private static isPromise(value: any): value is Promise<any> {
    return value instanceof Promise;
  }

  /**
   * Returns an abort as a value on the asynchronous path as well. If a handler in the chain is asynchronous, the
   * walk returns a promise and an abort arrives as its rejection; this converts it to a resolution, so the promise
   * the trigger returns resolves to the exception. Any other rejection is passed on.
   */
  private static answerAbort(value: any): any {
    if (!ActionsMap.isPromise(value)) return value;
    return value.then(undefined, (error: unknown) => {
      if (error instanceof AbortEventHandlingException) return error;
      throw error;
    });
  }

  /**
   * Runs a group from its outermost action. An abort ends the run and is returned, not thrown: the caller receives
   * the exception directly if the chain ran synchronously, and as the resolution of the returned promise otherwise.
   * This distinguishes an aborted run from one that reached no handler and from one whose handler returned null.
   */
  private run(identifier: symbol, eagerOnly: boolean, field: FieldBase, params: any[]): any {
    const actions = this.actions;
    try {
      return ActionsMap.answerAbort(this.walk(actions, actions.length - 1, identifier, eagerOnly, field, params));
    } catch (error) {
      if (error instanceof AbortEventHandlingException) return error;
      throw error;
    }
  }

  /**
   * Walks from `index` backwards to the first action of `identifier` and calls it with a `supr` that continues at
   * the action before it. Actions registered under other identifiers are skipped, so the array needs no grouping;
   * a closure is created only for each level the run reaches and lives only for the run.
   */
  private walk(
    actions: FieldActionBase[],
    index: number,
    identifier: symbol,
    eagerOnly: boolean,
    field: FieldBase,
    params: any[],
  ): any {
    let at = index;
    while (at >= 0 && (actions[at].classIdentifier !== identifier || (eagerOnly && !actions[at].eager))) at--;
    if (at < 0) return null;
    const supr = (next: FieldBase, ...rest: any[]) => this.walk(actions, at - 1, identifier, eagerOnly, next, rest);
    return actions[at].execute(field, supr, ...params);
  }
}
