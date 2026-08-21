import { type FieldBase } from '../field-base';
import { AbortEventHandlingException } from '../field.interface';
import { Validator } from '../validators/validator';

import FieldActionBase from './field-action-base';

/**
 * The actions one declaration has registered, in registration order. A trigger walks them from the end backwards
 * and passes over the ones registered under another identifier, so the newest registration of an identifier is its
 * outermost handler and reaches the ones before it through the `supr` it is handed. A handler that does not call
 * `supr` ends the run there, and one that calls it may transform what it answers with.
 *
 * The order is the whole index. An element carries a handful of actions, and a walk over that many is cheaper than
 * a keyed lookup as well as smaller: measured over three actions, the walk is about twice as fast as `Map.get` and
 * the two maps it replaces cost about 500 bytes per declaration.
 */
export default class ActionsMap {
  /**
   * Every action registered here, in registration order. It is replaced rather than written when an action is
   * dropped, so a run already walking it finishes on the array it started with and the removal takes effect from
   * the next trigger.
   */
  private actions: FieldActionBase[] = [];

  /**
   * Registers `action`. It becomes the outermost handler of its identifier, or - where `before` is given and is
   * registered here under the same identifier - takes that action's place in the order, so `before` wraps it and
   * reaches it through `supr`. That is what lets an action be added to a chain someone else built and still sit
   * inside a handler already there.
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

  /** Drops `action` and answers whether it was registered here. */
  unregister(action: FieldActionBase): boolean {
    if (!this.actions.includes(action)) return false;
    this.actions = this.actions.filter((registered) => registered !== action);
    return true;
  }

  /** True where something is registered under `identifier`. */
  willTrigger(identifier: symbol): boolean {
    return this.actions.some((action) => action.classIdentifier === identifier);
  }

  /** True where any eager action is registered, whatever identifier it stands under. */
  get hasEager(): boolean {
    return this.actions.some((action) => action.eager);
  }

  /** Runs the actions registered under `ActionClass` and answers with what the outermost of them returned. */
  trigger<T extends FieldActionBase>(
    ActionClass: (abstract new (...args: any[]) => T) & { classIdentifier: symbol },
    field: FieldBase,
    ...params: any[]
  ): any {
    return this.run(ActionClass.classIdentifier, false, field, params);
  }

  /**
   * Runs the eager actions of every identifier, each group on its own. A group is entered at its outermost eager
   * action, which is the last one registered under that identifier.
   */
  triggerEager(field: FieldBase, ...params: any[]): void {
    const actions = this.actions;
    for (let index = actions.length - 1; index >= 0; index--) {
      const action = actions[index];
      if (!action.eager) continue;
      // the group is entered once, at the outermost of its eager actions; the ones below are reached through supr
      if (ActionsMap.outermostEager(actions, index)) {
        try {
          const result = this.walk(actions, index, action.classIdentifier, true, field, params);
          // an abort out of an asynchronous handler arrives as a rejection, which the catch below never sees; ending
          // it here is what keeps it from being reported as unhandled. Any other rejection stays the runtime's.
          if (ActionsMap.isPromise(result)) {
            result.then(undefined, (error: unknown) => {
              if (!(error instanceof AbortEventHandlingException)) throw error;
            });
          }
        } catch (error) {
          // one eager group ending its run says nothing about the others, which are separate rules
          if (!(error instanceof AbortEventHandlingException)) throw error;
        }
      }
    }
  }

  /** Runs the eager actions registered under `identifier` and nothing else. */
  triggerEagerFor(identifier: symbol, field: FieldBase, ...params: any[]): any {
    return this.run(identifier, true, field, params);
  }

  /** the validators registered here, in registration order */
  get validators(): Validator[] {
    return this.actions.filter((action): action is Validator => action instanceof Validator);
  }

  /**
   * Tells every action here that it serves `owner`. A binding reads the map its declaration holds, so this is what
   * announces the new element to the actions already in it - the way registering an action announces the elements
   * it comes to serve.
   */
  bindTo(owner: FieldBase): void {
    this.actions.forEach((action) => action.boundToBinding(owner));
  }

  /** True where no eager action of `identifier` stands after `index`, which makes `index` the group's entry. */
  private static outermostEager(actions: FieldActionBase[], index: number): boolean {
    const identifier = actions[index].classIdentifier;
    for (let above = actions.length - 1; above > index; above--) {
      if (actions[above].eager && actions[above].classIdentifier === identifier) return false;
    }
    return true;
  }

  /**
   * True where `value` is a promise, which is what a walk through an asynchronous handler answers with. The test is
   * the type rather than a `then` member: a handler may answer with a value object that carries one, and calling
   * `then` on such an object replaces the answer with whatever that call returns.
   */
  private static isPromise(value: any): value is Promise<any> {
    return value instanceof Promise;
  }

  /**
   * Answers an abort with itself on the asynchronous path as well. Where a handler in the chain is asynchronous, the
   * walk answers with a promise and the abort raised under it arrives as that promise's rejection; this turns it back
   * into the value the caller receives, so a promise the trigger answers with resolves to the exception instead of
   * rejecting with it. Anything else keeps rejecting.
   */
  private static answerAbort(value: any): any {
    if (!ActionsMap.isPromise(value)) return value;
    return value.then(undefined, (error: unknown) => {
      if (error instanceof AbortEventHandlingException) return error;
      throw error;
    });
  }

  /**
   * Enters a group at its outermost action. An abort ends the run and is answered with rather than raised: the
   * exception is what the caller receives - directly where the chain ran synchronously, as what the answered promise
   * resolves to where it did not - so a run a handler ended is told apart from one that reached no handler and from
   * one whose handler answered null.
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
   * Walks from `index` backwards to the first action of `identifier`, handing it a `supr` that continues at the one
   * before it. The actions registered under other identifiers are passed over, so the array needs no grouping of
   * its own; the closures exist for the length of the run and only as deep as the run actually goes.
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
