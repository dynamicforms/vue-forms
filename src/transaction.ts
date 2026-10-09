import type FieldActionBase from './actions/field-action-base';
import type { FieldBase } from './field-base';
import { committed } from './plugins';

/**
 * A transaction is the unit in which an observer sees a change. Every mutating operation runs inside one: if the
 * caller has not opened one, the operation is its own transaction, so a single write is atomic without any action
 * at the call site.
 *
 * Writes are applied to the element immediately; only the announcement is deferred. At commit the net changes are
 * compared against the state the elements last announced and each is announced once, so a value that goes
 * A -> B -> A within one transaction is not announced. Validators run while the transaction is open, because the
 * commit announces their result; every other action fires at commit.
 *
 * A transaction cannot span an await: transaction() throws when the callback returns a thenable. Two overlapping
 * transactions therefore cannot exist, and an asynchronous validator that settles later opens its own transaction.
 */

/** the slots of one element as they were when the transaction first modified it */
export type TxSnapshot = Record<string, any>;

/** a ListItemAddedAction or ListItemRemovedAction waiting for the commit that will emit it */
export interface TxStructuralEvent {
  actionClass: (abstract new (...args: any[]) => FieldActionBase) & { classIdentifier: symbol };
  item: any;
  index: number;
}

/**
 * The protocol a transaction uses to call its participants. The members are symbol-keyed, so a consumer cannot
 * reach them by name or collide with them, and they are on the prototype, so a walk over an element's own keys
 * does not find them.
 */
export const TxCapture = Symbol('Transaction.capture');
/** read by a validator before it runs: whether the element is not sent at all, read without tracking */
export const SentNowhere = Symbol('FieldBase.sentNowhere');
export const TxRestore = Symbol('Transaction.restore');
export const TxAnnounceValue = Symbol('Transaction.announceValue');
export const TxSettleValidity = Symbol('Transaction.settleValidity');
export const TxAnnounceFlags = Symbol('Transaction.announceFlags');

interface TxParticipantElement {
  readonly parent: FieldBase | undefined;
  [TxCapture](): TxSnapshot;
  [TxRestore](snapshot: TxSnapshot): void;
  [TxAnnounceValue](tx: Transaction, dirty: boolean, force: boolean, structural?: TxStructuralEvent[]): void;
  [TxSettleValidity](tx: Transaction): void;
  [TxAnnounceFlags](): void;
}

/** FieldBase declares the four members above as protected, which keeps them out of the documented API */
function hooks(element: FieldBase): TxParticipantElement {
  return element as unknown as TxParticipantElement;
}

interface Participant {
  element: FieldBase;
  /** the element's state before the transaction, captured the first time the transaction modified the element */
  snapshot?: TxSnapshot;
  /** the commit determines whether this element's value changed and announces it if it did */
  valueDirty: boolean;
  /** the caller has established that the value changed, so the commit announces it without comparing */
  forceValue: boolean;
  /** the commit recomputes this element's validity and announces a change of it */
  validityDirty: boolean;
  /** the commit announces the net change of this element's access, enabled and visibility */
  flagsDirty: boolean;
  structural?: TxStructuralEvent[];
}

/** the number of containers above an element; the commit announces the deepest first */
function depthOf(element: FieldBase): number {
  let depth = 0;
  let ancestor = element.parent;
  while (ancestor) {
    depth++;
    ancestor = ancestor.parent;
  }
  return depth;
}

export class Transaction {
  private readonly participants = new Map<FieldBase, Participant>();

  /** what a rollback restores beyond the state slots, newest last */
  private readonly undo: (() => void)[] = [];

  /** work the commit runs after the change is complete, in registration order */
  private readonly settled: (() => void)[] = [];

  /** true once the transaction has been rolled back; a run started inside it then announces nothing */
  private unwound = false;

  /** the depth the current announcement pass is processing, -1 while no pass runs */
  private passDepth = -1;

  /** set when, during a pass, an element is enrolled at or below the depth being processed */
  private restartPass = false;

  /** true for a transaction that was rolled back */
  get rolledBack(): boolean {
    return this.unwound;
  }

  private participant(element: FieldBase): Participant {
    let entry = this.participants.get(element);
    if (!entry) {
      entry = { element, valueDirty: false, forceValue: false, validityDirty: false, flagsDirty: false };
      this.participants.set(element, entry);
    }
    return entry;
  }

  /**
   * Records the state of an element the first time the transaction modifies it. The snapshot contains all of the
   * mutable state, not only the part being written: a partial restore would leave the element in a state the form
   * never had.
   */
  touch(element: FieldBase): void {
    const entry = this.participant(element);
    if (!entry.snapshot) entry.snapshot = hooks(element)[TxCapture]();
  }

  /** Enrols an element whose value the commit announces. `force` skips the comparison. */
  markValueChanged(element: FieldBase, force: boolean): void {
    const entry = this.participant(element);
    entry.valueDirty = true;
    if (force) entry.forceValue = true;
    this.noteDepth(element);
  }

  /** Enrols an element whose access or visibility changed; the commit announces the net change. */
  markFlagsDirty(element: FieldBase): void {
    this.participant(element).flagsDirty = true;
    this.noteDepth(element);
  }

  /** Enrols an element whose validity the commit recomputes. */
  markValidityDirty(element: FieldBase): void {
    this.participant(element).validityDirty = true;
    this.noteDepth(element);
  }

  /**
   * Queues an event that describes an operation, not a state. Added and removed items have no net result over a
   * transaction, so they are neither compared nor merged: the commit emits them in the order they happened.
   */
  recordStructural(element: FieldBase, event: TxStructuralEvent): void {
    const entry = this.participant(element);
    (entry.structural ??= []).push(event);
    this.noteDepth(element);
  }

  /** True if the commit has a pending value announcement for this element. */
  willAnnounceValue(element: FieldBase): boolean {
    return this.participants.get(element)?.valueDirty ?? false;
  }

  /**
   * Registers an undo step for state outside the element's state slots. The snapshot covers the slots, which is
   * everything a regular write modifies; an operation that replaces anything else registers its own undo here, so
   * the snapshot does not have to include it.
   */
  whenRolledBack(work: () => void): void {
    this.undo.push(work);
  }

  /**
   * Registers work that runs after the transaction commits, and not at all if it is rolled back. An operation uses
   * it to defer a step that cannot be undone (for example, cancelling work in flight) until its change is
   * committed.
   */
  whenCommitted(work: () => void): void {
    this.settled.push(work);
  }

  /**
   * Records that an element at or below the depth of the running pass has been enrolled. The pass then stops and
   * restarts over the pending entries, so the new element is processed before the containers above it: an element
   * a handler writes is announced before the container whose composed value includes that write. The depth is
   * computed only while a pass runs; outside a pass it has no effect.
   */
  private noteDepth(element: FieldBase): void {
    if (this.passDepth < 0) return;
    if (depthOf(element) >= this.passDepth) this.restartPass = true;
  }

  /**
   * Restores every element the transaction modified to its state before the transaction. Nothing is announced, so
   * an observer sees no change. A rollback does not undo side effects, such as a server call a handler made during
   * the transaction.
   */
  rollback(): void {
    this.unwound = true;
    const entries = [...this.participants.values()].reverse();
    entries.forEach((entry) => {
      if (entry.snapshot) hooks(entry.element)[TxRestore](entry.snapshot);
    });
    this.participants.clear();
    // newest first, so an element written twice ends in the state before the earlier write
    for (let index = this.undo.length - 1; index >= 0; index--) this.undo[index]();
    this.undo.length = 0;
    // the change was not committed, so the work registered with whenCommitted does not run
    this.settled.length = 0;
  }

  /**
   * Announces the transaction's changes: access, enabled and visibility first, then values, then validity, because
   * a container's validators run with its value announcement and the validity pass reports their result. Every pass
   * runs deepest first (field, then row, then list), the order in which the change propagates.
   *
   * A handler may write while the commit runs; its writes join this transaction, so the passes repeat until nothing
   * is dirty.
   */
  commit(): void {
    for (;;) {
      if (this.announceFlags()) continue;
      if (this.announceValues()) continue;
      if (this.settleValidity()) continue;
      break;
    }
    // everything is announced and the change is committed, so the work registered with whenCommitted runs here
    for (let index = 0; index < this.settled.length; index++) this.settled[index]();
    this.settled.length = 0;
    committed();
  }

  /**
   * The dirty participants a pass visits, one bucket per nesting depth; within a depth they keep enrolment order.
   * A nesting depth is a small integer, so bucketing replaces a comparison sort: a whole-list assignment enrols one
   * participant per field, and a comparison sort of those would cost more than the announcement itself.
   */
  private buckets(pick: (entry: Participant) => boolean): (Participant[] | undefined)[] {
    const buckets: (Participant[] | undefined)[] = [];
    this.participants.forEach((entry) => {
      if (!pick(entry)) return;
      const depth = depthOf(entry.element);
      (buckets[depth] ??= []).push(entry);
    });
    return buckets;
  }

  /**
   * Runs one pass over the dirty participants, deepest bucket first; the caller repeats it until it returns false.
   * The buckets are built once, and the pass stops as soon as a handler enrols an element at or below the depth
   * being processed: that element is not in the current bucket, and continuing would process the containers above
   * it first. The caller's next pass builds new buckets that include it at its depth.
   */
  private pass(pick: (entry: Participant) => boolean, visit: (entry: Participant) => void): boolean {
    const buckets = this.buckets(pick);
    if (!buckets.length) return false;
    for (let depth = buckets.length - 1; depth >= 0; depth--) {
      const bucket = buckets[depth];
      if (!bucket) continue;
      this.passDepth = depth;
      this.restartPass = false;
      try {
        for (let index = 0; index < bucket.length; index++) {
          if (this.restartPass) return true;
          const entry = bucket[index];
          // a handler that ran earlier in this pass may have cleared the entry's pending flags
          if (pick(entry)) visit(entry);
        }
      } finally {
        this.passDepth = -1;
      }
      if (this.restartPass) return true;
    }
    return true;
  }

  private announceValues(): boolean {
    return this.pass(
      (entry) => entry.valueDirty || entry.structural !== undefined,
      (entry) => {
        const { structural } = entry;
        const dirty = entry.valueDirty;
        const force = entry.forceValue;
        entry.structural = undefined;
        entry.valueDirty = false;
        entry.forceValue = false;
        hooks(entry.element)[TxAnnounceValue](this, dirty, force, structural);
      },
    );
  }

  private announceFlags(): boolean {
    return this.pass(
      (entry) => entry.flagsDirty,
      (entry) => {
        entry.flagsDirty = false;
        hooks(entry.element)[TxAnnounceFlags]();
      },
    );
  }

  private settleValidity(): boolean {
    return this.pass(
      (entry) => entry.validityDirty,
      (entry) => {
        entry.validityDirty = false;
        hooks(entry.element)[TxSettleValidity](this);
      },
    );
  }
}

/** the transaction every mutating operation currently joins; undefined while none is open */
let current: Transaction | undefined;

/** the handle of the open transaction, which a nested call that joins it also receives */
let currentHandle: TransactionHandle | undefined;

/** The open transaction, for the bookkeeping an element does only while one is open. */
export function currentTransaction(): Transaction | undefined {
  return current;
}

/**
 * Thrown to unwind the transaction from the point of the call. It is a signal, not an error: transaction() catches
 * it, rolls back and returns undefined, and no failure is reported.
 */
class RollbackSignal {}

export interface TransactionControl {
  /**
   * Undoes everything the transaction has done and ends it, announcing nothing. It unwinds from the point of the
   * call, so no code after it runs. There are no savepoints: a nested call rolls back the whole transaction it
   * joined, not only its own part.
   *
   * @throws TypeError if the transaction the handle belongs to has already closed.
   */
  rollback(): never;
}

/**
 * The handle a transaction passes to the callbacks that take part in it. It becomes invalid when the transaction
 * closes: a handle kept after that refers to a transaction that no longer exists, and using it to roll back the
 * transaction open at that time would roll back an unrelated operation.
 */
class TransactionHandle implements TransactionControl {
  private open = true;

  /**
   * Set by `rollback()`. The signal it throws can be caught by a `try`/`catch` in the application's code; the
   * transaction reads this flag when the callback returns and rolls back all the same.
   */
  rollbackRequested = false;

  rollback(): never {
    if (!this.open) {
      throw new TypeError(
        'this transaction handle is spent: the transaction that handed it out has closed. A handle is only ' +
          'usable inside the call that received it.',
      );
    }
    this.rollbackRequested = true;
    throw new RollbackSignal();
  }

  close(): void {
    this.open = false;
  }
}

function rejectThenable(result: unknown): void {
  if (result != null && typeof (result as PromiseLike<unknown>).then === 'function') {
    throw new TypeError(
      'a transaction may not be asynchronous: the callback returned a thenable. Do the awaiting outside and open ' +
        'a transaction for each synchronous part.',
    );
  }
}

/**
 * Runs `fn` as one atomic change. Its writes are applied to the elements immediately, and the resulting events are
 * announced once, at the end, for the net result.
 *
 * A call made while a transaction is open joins it: nothing is committed until the outermost call returns. An
 * exception thrown from `fn` rolls back the whole transaction and is rethrown; `tx.rollback()` rolls it back
 * without an error, and the call returns undefined.
 *
 * The handle `fn` receives is usable only for the duration of that call; calling it afterwards throws a TypeError.
 *
 * @throws TypeError immediately if `fn` returns a thenable: a transaction cannot span an await.
 */
export function transaction<R>(fn: (tx: TransactionControl) => R): R | undefined {
  if (current) {
    const joined = fn(currentHandle!);
    rejectThenable(joined);
    return joined;
  }

  const tx = new Transaction();
  const handle = new TransactionHandle();
  current = tx;
  currentHandle = handle;
  try {
    const result = fn(handle);
    rejectThenable(result);
    if (handle.rollbackRequested) throw new RollbackSignal();
    tx.commit();
    return result;
  } catch (error) {
    // the commit may have announced part of the change before the throw; the state is restored regardless, and
    // what a handler did with the events it already received is a side effect no snapshot covers
    tx.rollback();
    if (error instanceof RollbackSignal) return undefined;
    throw error;
  } finally {
    current = undefined;
    currentHandle = undefined;
    handle.close();
  }
}

/**
 * Runs a mutating operation inside the open transaction, or opens one for the operation if none is open. Every
 * mutation in the library goes through this function.
 */
export function transactional<R>(fn: (tx: Transaction) => R): R {
  if (current) return fn(current);
  return transaction(() => fn(current!)) as R;
}
