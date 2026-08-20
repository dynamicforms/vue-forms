import { ref, type Ref } from 'vue';

import { ExecuteAction } from './actions';
import { Field } from './field';
import { IFieldParams } from './field.interface';
import { transactional } from './transaction';

export interface ActionValue {
  label?: string;
  icon?: string;
}

/**
 * How many executions of an action have yet to settle, held outside the action it belongs to and allocated for
 * an action the first time one is asked of it. An action nobody executes and nobody reads `busy` on carries no
 * counter at all, and the ones that do carry a Vue ref: a button rendering off `busy` re-renders when the count
 * moves away from zero and back.
 */
const busyCounters = new WeakMap<object, Ref<number>>();

/**
 * Whether a value object says nothing, in which case the default stands in for it.
 *
 * The question is asked over every member the object carries rather than over `label` and `icon` alone: `T` is
 * whatever a subclass widened the value to, and an action that states a name, a render style or a set of
 * per-breakpoint options and no label is a value that says something. A member holding `null` or `undefined`
 * states nothing, so the pair of `undefined`s an action starts from is empty, as is `{}`.
 */
function isValEmpty<T extends ActionValue>(val: T | undefined, defaultIfTrue: T): T {
  if (val == null) return defaultIfTrue;
  const states = Object.values(val).some((member) => member != null);
  return states ? val : defaultIfTrue;
}

export class Action<T extends ActionValue = ActionValue, X extends object = {}> extends Field<T, X> {
  get [Symbol.toStringTag](): string {
    return 'Action';
  }

  protected init(params?: IFieldParams<T, X>) {
    transactional(() => {
      // an Action's value is always a shaped object, so the empty value is the pair of undefined members and not
      // undefined itself - both this hook and isValEmpty below rely on that
      this._value = { label: undefined, icon: undefined } as T;
      if (params) {
        const { value: paramValue, originalValue, validators, actions, ...otherParams } = params;
        // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
        // guards them too
        this.registerInitialActions([...(validators || []), ...(actions || [])]);
        this.assignParams(otherParams);
        const val = isValEmpty(paramValue, this._value);
        // the baseline is a copy of the whole value it was declared with, over the empty shape: a subclass widens
        // the value, and a baseline carrying two of its members would report every such action changed from
        // construction, its containers with it
        const orgVal = Object.freeze({ ...this._value, ...originalValue }) as T;
        // the fallback is a copy of the baseline, never the frozen baseline itself: label and icon stay
        // assignable on an action constructed without a value. A value that was given is kept by identity,
        // so a reactive object passed in stays linked to the action.
        this._value = isValEmpty(val, { ...orgVal });
        this.originalValue = isValEmpty(orgVal, val);
      }
      // the value a construction ends on is the action's first statement about itself rather than a change of one
      this.raw.announcedValue = this._value;
      this.boundActions?.triggerEager(this, this.value, this.originalValue);
      this.validate();
    });
  }

  /**
   * A copy of the value this action holds, carrying one member rewritten. A member handed undefined is dropped
   * from the copy rather than written into it: an own key holding undefined is invisible to a reader and to
   * JSON, but lodash isEqual compares own-key sets, so writing one would leave the action permanently changed
   * against a baseline that never carried the key.
   */
  private valueWith(member: keyof ActionValue, newValue: string | undefined): T {
    const res: ActionValue = { ...this.value };
    if (newValue === undefined) delete res[member];
    else res[member] = newValue;
    return res as T;
  }

  get icon(): string | undefined {
    return this.value.icon;
  }

  set icon(newValue: string | undefined) {
    if (this.value.icon === newValue) return;
    this.value = this.valueWith('icon', newValue);
  }

  get label(): string | undefined {
    return this.value.label;
  }

  /**
   * The two setters hand the value setter a new object rather than writing into the one the action holds, so each
   * is an ordinary value change: the handlers fire, isChanged answers over it, and a disabled action refuses it.
   * The new object is built only for a member that differs from the one held - the value setter compares by
   * identity and every copy is a new object, so without the comparison here a write of the value already held
   * would announce a change and invalidate the value cache of every container above.
   */
  set label(newValue: string | undefined) {
    if (this.value.label === newValue) return;
    this.value = this.valueWith('label', newValue);
  }

  /** the counter behind `busy`, allocated for this action the first time it is asked for */
  private get busyRuns(): Ref<number> {
    let runs = busyCounters.get(this);
    if (!runs) {
      runs = ref(0);
      busyCounters.set(this, runs);
    }
    return runs;
  }

  /** true from the moment execute() is called until the handler it ran has settled, however it settles */
  get busy(): boolean {
    return this.busyRuns.value > 0;
  }

  /**
   * Runs the ExecuteAction chain registered on this action and answers what the chain returned. `busy` stands for
   * the length of the run: the chain is entered synchronously, and the flag is cleared once the value it produced
   * has settled - a handler that returns a promise holds it for as long as that promise takes, and one that
   * rejects clears it as it rejects.
   *
   * The answer is a promise whatever the handler returns, so a handler that throws rejects it rather than throwing
   * out of this call: a caller that does not await the answer and does not attach a catch handler leaves that
   * rejection unhandled.
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
