import { computed, type ComputedRef } from 'vue';

import { FieldBase } from './field-base';
import { type Extras } from './field.interface';
import { transactional } from './transaction';

/**
 * The computed behind a container's `valid`, held outside the element. A computed references itself through its
 * dependency record, and JSON.stringify and lodash isEqual both walk own enumerable properties, so an element with
 * a computed as a property would be a cycle for both.
 */
const validReads = new WeakMap<object, ComputedRef<boolean>>();

/** The computed behind a container's `busy`, held outside the element for the same reason as `validReads`. */
const busyReads = new WeakMap<object, ComputedRef<boolean>>();

/**
 * A form element that holds other elements and composes its state from theirs: `Group`, which holds named
 * members, and `List`, which holds rows. Every element's `parent` is a `Container`.
 *
 * The behaviour over children is the same in both subclasses: `valid` and `busy` are composed from the children's,
 * `touched` is true if any child is touched and an assignment propagates down to every child, `validate(true)`
 * revalidates every child before the container computes its own validity, and a child's change of value or
 * validity reaches the container through `notifyValueChanged()` and the counters below. The subclass defines how
 * children are addressed: by name or by position.
 */
export abstract class Container<T = any, X extends object = Extras> extends FieldBase<T, X> {
  get [Symbol.toStringTag](): string {
    return 'Container';
  }

  /**
   * The children this container holds, read through the tracked view of its state, so a validity or flag composed
   * over them is recomputed when a child is added or removed.
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
      // the children are revalidated first and the container computes its own validity afterwards, over all of
      // them: a child that becomes valid announces nothing until the transaction closes, so the container does not
      // report a validity computed over a partially revalidated set
      if (revalidate) this.members.forEach((child) => child.validate(true));
      super.validate(revalidate);
    });
  }

  /**
   * Records that a child changed its value, so that at commit the open transaction computes this container's new
   * value and announces it once. The mutation methods call it; a direct call is rarely needed.
   */
  notifyValueChanged() {
    this.propagateValueChanged();
  }

  protected get composesValue(): boolean {
    return true;
  }

  /**
   * A container with no listener for what it holds does not compose it, so its stored copy predates the
   * unannounced changes. A registration that adds a listener updates the copy here, so the listener receives the
   * changes made after the registration.
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
   * The composed validity `valid` returns, memoised by Vue. The walk over the children makes an error written into
   * one of them visible without a validate() call, and the computed skips the walk while nothing it read has
   * changed.
   */
  private get validRead(): boolean {
    let read = validReads.get(this);
    if (!read) {
      read = computed(
        () =>
          this.state.errors.length === 0 &&
          // a child that sends nothing does not affect the container's validity
          this.children.every((child) => child.valid || this.childSerializesAs(child, 'value') === 'omit'),
      );
      validReads.set(this, read);
    }
    return read.value;
  }

  /**
   * The composed value of `busy`, memoised by Vue. An `Action` counts its executions in its own counter, which does
   * not notify containers, so the value is composed over the children; the computed skips the walk while nothing
   * it read has changed, and a child that is a container reads its own computed.
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
   * Records that a child's `validating` became true or false, and passes the transition up if it changes this
   * container's own `validating`.
   */
  protected childValidatingChanged(started: boolean): void {
    const wasValidating = this.validating;
    this.state.validatingChildren += started ? 1 : -1;
    if (this.validating !== wasValidating) this.parent?.childValidatingChanged(started);
  }

  /**
   * Records a child's new validity in this container's invalid count. The child calls it as it settles, and the
   * commit settles the deepest element first, so the count is complete when the container settles. The delta is
   * applied here; recomputing by walking the children at commit would cost `O(children)` per container and make
   * filling a list quadratic.
   */
  protected childValidityChanged(nowValid: boolean): void {
    this.raw.invalidChildren += nowValid ? -1 : 1;
  }
}
