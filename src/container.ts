import { computed, type ComputedRef } from 'vue';

import { Action } from './action';
import { RejectAction } from './actions/reject-action';
import { SubmitAction } from './actions/submit-action';
import { ExecuteHandlers } from './element-state';
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

  /**
   * Executes the action that confirms this container, with `params`, and returns what its `execute()` returns.
   * The action is looked up in three steps; the first step that finds a candidate decides:
   *
   * 1. an action at or below this container with a `SubmitAction` whose target is this container;
   * 2. an action with `defaultConfirm` among the direct members;
   * 3. an action with `defaultConfirm` at a lower level.
   *
   * Only actions whose `visibility` is `'full'` are candidates. One candidate is executed if it is `executable`;
   * where it is not, nothing is executed. Two or more candidates in one step are ambiguous: nothing is executed and
   * a warning is logged. Returns undefined where nothing is executed. A rendering layer calls it for a confirm
   * gesture, such as Enter in a dialog.
   */
  confirm(params?: any): Promise<any> | undefined {
    return this.command('confirm')?.execute(params);
  }

  /**
   * Executes the action that rejects this container, looked up as in `confirm()` with `RejectAction` and
   * `defaultReject`. A rendering layer calls it for a reject gesture, such as Escape in a dialog.
   */
  reject(params?: any): Promise<any> | undefined {
    return this.command('reject')?.execute(params);
  }

  /**
   * A container whose members are all actions, such as a bar of buttons, holds no data and sends nothing, like an
   * action. A container without members, or with at least one member that is not an action, sends as its access
   * determines.
   */
  protected serializesAs(purpose: 'value' | 'fullValue'): 'value' | 'null' | 'omit' {
    const children = this.children;
    if (children.length > 0 && children.every((child) => this.childSerializesAs(child, 'fullValue') === 'omit')) {
      return 'omit';
    }
    return super.serializesAs(purpose);
  }

  /** The action `confirm()` or `reject()` executes, or undefined. */
  private command(kind: 'confirm' | 'reject'): Action | undefined {
    const Handler = kind === 'confirm' ? SubmitAction : RejectAction;
    const flag = kind === 'confirm' ? 'defaultConfirm' : 'defaultReject';
    const shown = this.actionsBelow().filter((entry) => entry.action.visibility === 'full');
    const steps = [
      shown.filter(({ action }) =>
        action[ExecuteHandlers]().some((h) => h instanceof Handler && h.targetFor(action) === this),
      ),
      shown.filter(({ action, depth }) => depth === 0 && action[flag]),
      shown.filter(({ action, depth }) => depth > 0 && action[flag]),
    ];
    for (const candidates of steps) {
      if (candidates.length === 0) continue;
      if (candidates.length > 1) {
        console.warn(`${kind}(): ${candidates.length} actions qualify, so none is executed`);
        return undefined;
      }
      const { action } = candidates[0];
      return action.executable ? action : undefined;
    }
    return undefined;
  }

  /** Every action at or below this container, depth-first in member order, with its depth below this container. */
  private actionsBelow(depth = 0): { action: Action; depth: number }[] {
    return this.children.flatMap((child) => {
      if (child instanceof Action) return [{ action: child, depth }];
      if (child instanceof Container) return child.actionsBelow(depth + 1);
      return [];
    });
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
