import { computed, type ComputedRef } from 'vue';

import { FieldBase } from './field-base';
import { type Extras } from './field.interface';
import { transactional } from './transaction';

/**
 * The computed behind a container's `valid`, held outside the element it belongs to. A computed refers back to
 * itself through its dependency record, and JSON.stringify and lodash isEqual both walk own enumerable
 * properties, so an element carrying one as a property would be a cycle to either of them.
 */
const validReads = new WeakMap<object, ComputedRef<boolean>>();

/** The computed behind a container's `busy`, held outside the element for the same reason `validReads` is. */
const busyReads = new WeakMap<object, ComputedRef<boolean>>();

/**
 * A form element that holds other elements and composes its state out of theirs: `Group`, which holds named
 * members, and `List`, which holds rows. Every element's `parent` is a `Container`.
 *
 * What a container answers for over its children is the same whatever holds them: `valid` and `busy` are composed
 * of theirs, `touched` is true where any child is touched and propagates an assignment down, `validate(true)`
 * revalidates every child before the container forms its own verdict, and a child's change of value or verdict
 * reaches the container through `notifyValueChanged()` and the tallies below. How the children are reached - by
 * name or by position - is the subclass's.
 */
export abstract class Container<T = any, X extends object = Extras> extends FieldBase<T, X> {
  get [Symbol.toStringTag](): string {
    return 'Container';
  }

  /**
   * The children this container holds, read through the tracked view of its state: a verdict or a flag composed
   * over them is formed again when a child is added or removed.
   */
  protected abstract get children(): readonly FieldBase[];

  get touched(): boolean {
    return this.children.some((child) => child.touched);
  }

  set touched(touched: boolean) {
    transactional(() => {
      this.members.forEach((child) => {
        child.touched = touched;
      });
    });
  }

  get valid(): boolean {
    return this.validRead;
  }

  get busy(): boolean {
    return this.busyRead;
  }

  validate(revalidate: boolean = false) {
    transactional(() => {
      // the children are revalidated first and the container forms its own verdict afterwards, over the finished
      // set: a child that turns valid while a later one is still to be checked announces nothing until the
      // transaction closes, so the container never reports a verdict over a half-revalidated set
      if (revalidate) this.members.forEach((child) => child.validate(true));
      super.validate(revalidate);
    });
  }

  /**
   * Records that a child changed its value, so that the transaction in progress works out at commit what this
   * container's own value became and announces it once. The mutation methods call it themselves; you rarely need
   * to.
   */
  notifyValueChanged() {
    this.propagateValueChanged();
  }

  protected get composesValue(): boolean {
    return true;
  }

  /**
   * A container with nothing listening for what it holds does not compose it at all, so the copy it keeps is from
   * before the changes nobody received. A registration that adds a listener brings it up to date here, and what
   * the listener is then told about is the change that follows it.
   */
  protected refreshPreviousValue(): void {
    super.refreshPreviousValue();
    this.raw.announcedValue = this.holding;
  }

  /** A container holds every member's value whatever the member sends: its `fullValue`. */
  protected get holding(): any {
    return this.fullValue;
  }

  /**
   * The composed verdict `valid` answers with, memoised by Vue. The walk over the children is what makes an error
   * pushed into one of them visible without a validate() call, and the computed keeps that walk from repeating
   * while nothing it read has moved.
   */
  private get validRead(): boolean {
    let read = validReads.get(this);
    if (!read) {
      read = computed(() => this.state.errors.length === 0 && this.children.every((child) => child.valid));
      validReads.set(this, read);
    }
    return read.value;
  }

  /**
   * The composed answer `busy` gives, memoised by Vue. An `Action` counts its executions in a counter of its own,
   * which no container is told about, so the answer is composed over the children instead of tallied; the computed
   * keeps the walk from repeating while nothing it read has moved, and a child that is itself a container answers
   * from its own computed.
   */
  private get busyRead(): boolean {
    let read = busyReads.get(this);
    if (!read) {
      read = computed(() => this.children.some((child) => child.busy));
      busyReads.set(this, read);
    }
    return read.value;
  }

  /**
   * Records that a child started or stopped answering `validating` with true, and carries the transition further
   * up where it changes this container's own answer.
   */
  protected childValidatingChanged(started: boolean): void {
    const wasValidating = this.validating;
    this.state.validatingChildren += started ? 1 : -1;
    if (this.validating !== wasValidating) this.parent?.childValidatingChanged(started);
  }

  /**
   * Records a child's new verdict in this container's tally. The child reports it as it settles, and the commit
   * settles the deepest element first, so the tally a container reads when its own turn comes is finished. The
   * delta is applied here rather than recomputed by walking the children at commit, which would cost
   * `O(children)` per container and turn a list fill back into the quadratic walk this tally exists to avoid.
   */
  protected childValidityChanged(nowValid: boolean): void {
    this.raw.invalidChildren += nowValid ? -1 : 1;
  }
}
