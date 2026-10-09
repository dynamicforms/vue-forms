import { ref, type Ref } from 'vue';

import { ExecuteAction } from './actions';
import { ExecuteHandlers } from './element-state';
import { Field } from './field';
import { type Extras, IFieldParams } from './field.interface';
import { SentNowhere, transactional } from './transaction';

/**
 * The value an `Action` holds. Both members are `unknown` because `Action` defines the concept and a UI library
 * defines what it renders: a subclass declares its value type with `label` and `icon` in the shape it renders them
 * (a string, a markdown string, a per-breakpoint object), and the accessors below return that type, because they
 * read it from `T`.
 *
 * For an `Action` built without a type argument, both members are `unknown` and the reader casts them. An
 * application that renders actions uses the subclass its UI library provides.
 */
export interface ActionValue {
  label?: unknown;
  icon?: unknown;
  /** The action a container's `confirm()` executes: the one a confirm gesture, such as Enter, triggers. */
  defaultConfirm?: boolean;
  /** The action a container's `reject()` executes: the one a reject gesture, such as Escape, triggers. */
  defaultReject?: boolean;
}

/**
 * The number of unsettled executions of an action, held outside the action and created on first access. An action
 * that is never executed and whose `busy` is never read has no counter; the others have a Vue ref, so a button
 * that reads `busy` re-renders when the count leaves zero and when it returns to zero.
 */
const busyCounters = new WeakMap<object, Ref<number>>();

/**
 * Returns the value object if any of its members is set, and undefined otherwise. A member holding `null` or
 * `undefined` is not set, so `{}` and the initial pair of `undefined` members return undefined.
 *
 * `T` may be a wider type a subclass declares, so an object with a render style, a name or per-breakpoint options
 * and no label is returned.
 */
function stated<T extends ActionValue>(val: T | undefined): T | undefined {
  if (val == null) return undefined;
  return Object.values(val).some((member) => member != null) ? val : undefined;
}

export class Action<
  T extends ActionValue = ActionValue,
  X extends object = Omit<Extras, keyof ActionValue>,
> extends Field<T, X> {
  get [Symbol.toStringTag](): string {
    return 'Action';
  }

  protected init(params?: IFieldParams<T, X>) {
    transactional(() => {
      // an Action's value is always an object, so an action constructed without a value holds an object with two
      // undefined members, not undefined
      this._value = { label: undefined, icon: undefined } as T;
      if (params) {
        const { value: paramValue, originalValue, validators, actions, ...otherParams } = params;
        // actions are registered before the remaining parameters are assigned, so a *Changing* action supplied here
        // also applies to those assignments
        this.registerInitialActions([...(validators || []), ...(actions || [])]);
        this.assignParams(otherParams);
        const val = stated(paramValue);
        const org = stated(originalValue);
        // a supplied value is kept by identity, so a reactive object passed in stays linked to the action; without
        // one, the action holds a copy of the baseline, not the frozen baseline itself
        if (val) this._value = val;
        else if (org) this._value = { ...org };
        // the baseline has exactly the members it was declared with: isChanged is a structural comparison of
        // own-key sets, so the action is unchanged after construction, and so is every container above it
        if (org) this.originalValue = Object.freeze({ ...org }) as T;
      }
      this.constructed(params);
      // without a declared baseline, the baseline is the value the construction ends with (the same object, so
      // both have the same members), which is the value the hook above leaves
      if (this.originalValue === undefined) this.originalValue = this._value;
      // the value a construction ends with is the action's initial state, not a change
      this.recordAnnounced();
      this.boundActions?.triggerEager(this, this.contribution, this.originalValue);
      this.validate();
    });
  }

  /**
   * Returns a copy of the value this action holds with one member replaced. A member set to undefined is deleted
   * from the copy: an own key holding undefined is invisible to a reader and to JSON, but lodash isEqual compares
   * own-key sets, so the action would remain changed against a baseline without that key.
   */
  private valueWith<K extends 'label' | 'icon'>(member: K, newValue: T[K]): T {
    const res: ActionValue = { ...this.value };
    if (newValue === undefined) delete res[member];
    else res[member] = newValue;
    return res as T;
  }

  get icon(): T['icon'] {
    return this.value.icon;
  }

  set icon(newValue: T['icon']) {
    if (this.value.icon === newValue) return;
    this.value = this.valueWith('icon', newValue);
  }

  get label(): T['label'] {
    return this.value.label;
  }

  /**
   * The two setters pass a new object to the value setter instead of modifying the one the action holds, so each
   * is a regular value change: the handlers fire and isChanged reflects it.
   * The new object is built only if the member differs from the current one: the value setter compares by identity
   * and every copy is a new object, so without this check a write of the current value would announce a change and
   * invalidate the value cache of every container above.
   */
  set label(newValue: T['label']) {
    if (this.value.label === newValue) return;
    this.value = this.valueWith('label', newValue);
  }

  /** `value.defaultConfirm`: whether a container's `confirm()` executes this action. */
  get defaultConfirm(): boolean {
    return this.value.defaultConfirm ?? false;
  }

  /** `value.defaultReject`: whether a container's `reject()` executes this action. */
  get defaultReject(): boolean {
    return this.value.defaultReject ?? false;
  }

  /**
   * An action is a command, not data: it sends nothing to its container's `value` or `fullValue`, so it is not in
   * the payload, does not affect the container's `isChanged`, and is not counted in its validity. Its validators do
   * not run, as on any element that sends nothing.
   */
  protected serializesAs(): 'value' | 'null' | 'omit' {
    return 'omit';
  }

  /** An action is sent nowhere, so a validator registered on it reaches no result and adds no error. */
  [SentNowhere](): boolean {
    return true;
  }

  /**
   * Whether the action can run now: it accepts input (`effectiveEnabled`), is shown (`visibility` is `'full'`), is
   * not running (`busy` is false), and every `ExecuteAction` handler registered on it returns true from
   * `canExecute()`. Reactive, so a button binds `:disabled="!action.executable"`. A container's `confirm()` and
   * `reject()` execute only an executable action. `execute()` does not check it.
   */
  get executable(): boolean {
    if (!this.effectiveEnabled || this.visibility !== 'full' || this.busy) return false;
    return this[ExecuteHandlers]().every((handler) => handler.canExecute(this));
  }

  /** The `ExecuteAction` handlers registered on this action, in registration order. */
  [ExecuteHandlers](): ExecuteAction[] {
    return (this.boundActions?.ofClass(ExecuteAction.classIdentifier) ?? []) as ExecuteAction[];
  }

  /** the counter behind `busy`, created on first access */
  private get busyRuns(): Ref<number> {
    let runs = busyCounters.get(this);
    if (!runs) {
      runs = ref(0);
      busyCounters.set(this, runs);
    }
    return runs;
  }

  /** true from the call to execute() until the handler it ran has settled, resolved or rejected */
  get busy(): boolean {
    return this.busyRuns.value > 0;
  }

  /**
   * Runs the ExecuteAction chain registered on this action and returns the chain's result. `busy` is true for the
   * duration of the run: the chain starts synchronously, and the flag is cleared when its result has settled; a
   * handler that returns a promise keeps it set until that promise settles, and a rejection clears it.
   *
   * The return value is a promise whatever the handler returns, so a handler that throws rejects the promise; this
   * call does not throw. A caller that neither awaits it nor attaches a catch handler leaves the rejection
   * unhandled. An `AbortEventHandlingException` does not reject: the promise resolves with it, for a synchronous
   * and an asynchronous chain alike.
   */
  async execute(params?: any): Promise<any> {
    const runs = this.busyRuns;
    runs.value++;
    try {
      return await this.triggerAction(ExecuteAction, params);
    } finally {
      runs.value--;
    }
  }
}

export type NullableAction = Action | null;
