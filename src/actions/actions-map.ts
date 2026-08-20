import { type FieldBase } from '../field-base';
import { AbortEventHandlingException } from '../field.interface';
import { Validator } from '../validators/validator';

import FieldActionBase from './field-action-base';

/**
 * The actions one element has registered, grouped by the identifier they are triggered under. Within a group the
 * actions stand in registration order and are run from the end backwards, so the newest registration is the
 * outermost handler and reaches the ones before it through the `supr` it is handed. A handler that does not call
 * `supr` ends the run there, and one that calls it may transform what it answers with.
 */
export default class ActionsMap {
  /** every action registered here, in registration order across all identifiers */
  private readonly registeredActions: FieldActionBase[] = [];

  /** the actions of one identifier, in registration order */
  private readonly chains = new Map<symbol, FieldActionBase[]>();

  /** the eager actions of one identifier, in registration order; a subsequence of the chain under that identifier */
  private readonly eagerChains = new Map<symbol, FieldActionBase[]>();

  /**
   * Registers `action`. It becomes the outermost handler of its identifier, or - where `before` is given and is
   * registered here under the same identifier - takes that action's place in the order, so `before` wraps it and
   * reaches it through `supr`. That is what lets an action be added to a chain someone else built and still sit
   * inside a handler already there.
   */
  register(action: FieldActionBase, before?: FieldActionBase): void {
    if (!(action instanceof FieldActionBase)) throw new Error('Invalid action type');
    const identifier = action.classIdentifier;
    if (before && (before.classIdentifier !== identifier || !this.registeredActions.includes(before))) {
      throw new Error('Action to register before is not registered under the same identifier');
    }

    this.registeredActions.push(action);
    this.insert(this.chains, identifier, action, before);
    if (action.eager) this.insert(this.eagerChains, identifier, action, before);
  }

  /**
   * Drops `action` from this map and answers whether it was in it. The lists it stood in are replaced rather than
   * written, so a run already walking one finishes on the list it started with and the removal takes effect from
   * the next trigger.
   */
  unregister(action: FieldActionBase): boolean {
    const at = this.registeredActions.indexOf(action);
    if (at < 0) return false;
    this.registeredActions.splice(at, 1);
    const identifier = action.classIdentifier;
    this.remove(this.chains, identifier, action);
    this.remove(this.eagerChains, identifier, action);
    return true;
  }

  /** True where something is registered under `identifier`. */
  willTrigger(identifier: symbol): boolean {
    return this.chains.has(identifier);
  }

  /** True where any eager action is registered, whatever identifier it stands under. */
  get hasEager(): boolean {
    return this.eagerChains.size > 0;
  }

  /** Runs the actions registered under `ActionClass` and answers with what the outermost of them returned. */
  trigger<T extends FieldActionBase>(
    ActionClass: (abstract new (...args: any[]) => T) & { classIdentifier: symbol },
    field: FieldBase,
    ...params: any[]
  ): any {
    return this.run(this.chains.get(ActionClass.classIdentifier), field, params);
  }

  /** Runs the eager actions of every identifier, each group on its own. */
  triggerEager(field: FieldBase, ...params: any[]): void {
    this.eagerChains.forEach((chain) => this.run(chain, field, params));
  }

  /** Runs the eager actions registered under `identifier` and nothing else. */
  triggerEagerFor(identifier: symbol, field: FieldBase, ...params: any[]): any {
    return this.run(this.eagerChains.get(identifier), field, params);
  }

  /** the validators registered in this map, in registration order */
  get validators(): Validator[] {
    return this.registeredActions.filter((action): action is Validator => action instanceof Validator);
  }

  /**
   * Tells every action in this map that it serves `owner`. A binding reads the map its declaration holds, so this
   * is what announces the new element to the actions already in it - the way registering an action announces the
   * elements it comes to serve.
   */
  bindTo(owner: FieldBase): void {
    this.registeredActions.forEach((action) => action.boundToBinding(owner));
  }

  /**
   * Walks `chain` from the end backwards, handing each action a `supr` that continues at the one before it. The
   * closures exist for the length of the run and only as deep as the run actually goes, so a chain nobody walks to
   * the bottom costs nothing for the part left unreached.
   */
  private step(chain: FieldActionBase[], index: number, field: FieldBase, params: any[]): any {
    if (index < 0) return null;
    const supr = (next: FieldBase, ...rest: any[]) => this.step(chain, index - 1, next, rest);
    return chain[index].execute(field, supr, ...params);
  }

  /** Walks a chain, answering null where there is none. An abort ends the run and is not an error to the caller. */
  private run(chain: FieldActionBase[] | undefined, field: FieldBase, params: any[]): any {
    if (!chain) return null;
    try {
      return this.step(chain, chain.length - 1, field, params);
    } catch (error) {
      if (!(error instanceof AbortEventHandlingException)) throw error;
    }
    return null;
  }

  private insert(
    groups: Map<symbol, FieldActionBase[]>,
    identifier: symbol,
    action: FieldActionBase,
    before?: FieldActionBase,
  ): void {
    const chain = groups.get(identifier) ?? [];
    const at = before ? chain.indexOf(before) : -1;
    // a `before` the group does not hold - registering an eager action before a lazy one - places nothing: the
    // eager group has no position that corresponds to it, and the end of the group is where it belongs
    if (at < 0) chain.push(action);
    else chain.splice(at, 0, action);
    groups.set(identifier, chain);
  }

  private remove(groups: Map<symbol, FieldActionBase[]>, identifier: symbol, action: FieldActionBase): void {
    const chain = groups.get(identifier);
    if (!chain?.includes(action)) return;
    const left = chain.filter((registered) => registered !== action);
    if (left.length) groups.set(identifier, left);
    else groups.delete(identifier);
  }
}
