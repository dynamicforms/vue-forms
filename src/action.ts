import { ref, type Ref } from 'vue';

import { ExecuteAction } from './actions';
import { Field } from './field';
import { type Extras, IFieldParams } from './field.interface';
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
 * The value object where any member of it states something, and undefined where none does. A member holding
 * `null` or `undefined` states nothing, so `{}` and the pair of `undefined`s an action starts from state nothing.
 *
 * `T` is whatever a subclass widened the value to, so an object naming a render style, a name or a set of
 * per-breakpoint options and no label is an object that states something.
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
      // an Action's value is always a shaped object, so an action that is handed nothing holds the pair of
      // undefined members rather than undefined itself
      this._value = { label: undefined, icon: undefined } as T;
      if (params) {
        const { value: paramValue, originalValue, validators, actions, ...otherParams } = params;
        // registration precedes the assignment of the remaining parameters, so a *Changing* action supplied here
        // guards them too
        this.registerInitialActions([...(validators || []), ...(actions || [])]);
        this.assignParams(otherParams);
        const val = stated(paramValue);
        const org = stated(originalValue);
        // a value that was stated is kept by identity, so a reactive object passed in stays linked to the action;
        // where none was, the action holds a copy of the baseline, never the frozen baseline itself
        if (val) this._value = val;
        else if (org) this._value = { ...org };
        // the baseline carries exactly the members it was declared with: isChanged is a structural comparison,
        // which reads own-key sets, so an action reads as unchanged from construction, and so does every
        // container above it, where the baseline is shaped like the value it baselines
        if (org) this.originalValue = Object.freeze({ ...org }) as T;
      }
      this.constructed(params);
      // an action nothing declared a baseline for is baselined on the value its construction ends on - the value
      // itself, so the two carry the same members - and that value is what the hook above leaves
      if (this.originalValue === undefined) this.originalValue = this._value;
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
