import type FieldActionBase from './actions/field-action-base';
import type { FieldBase } from './field-base';

/**
 * A transaction is the unit an observer sees a change in. Every mutating operation runs inside one: where the
 * caller opens none, the operation is the transaction, so a single write is atomic without anything having to be
 * remembered at the call site.
 *
 * Writes land in the element straight away and only the announcement waits. At commit the net transitions are
 * measured against the state the elements last announced and each is announced once, so a value that goes A -> B
 * -> A within one transaction says nothing. Validators run while the transaction is open, because the verdict
 * they reach is what the commit announces; every other action fires at commit.
 *
 * A transaction may not cross an await: transaction() throws when the callback returns a thenable. Two
 * overlapping transactions therefore cannot exist, and an asynchronous validator settling later opens one of its
 * own at that moment.
 */

/** the slots of one element as they stood when the transaction first modified it */
export type TxSnapshot = Record<string, any>;

/** a ListItemAddedAction or ListItemRemovedAction waiting for the commit that will emit it */
export interface TxStructuralEvent {
  actionClass: (abstract new (...args: any[]) => FieldActionBase) & { classIdentifier: symbol };
  item: any;
  index: number;
}

/**
 * The protocol a transaction drives its participants through. The four members are symbol-keyed so that they
 * carry no name a consumer could reach or collide with, and they live on the prototype, so no walker over an
 * element's own keys sees them either.
 */
export const TxCapture = Symbol('Transaction.capture');
export const TxRestore = Symbol('Transaction.restore');
export const TxAnnounceValue = Symbol('Transaction.announceValue');
export const TxSettleValidity = Symbol('Transaction.settleValidity');

interface TxParticipantElement {
  readonly parent: FieldBase | undefined;
  [TxCapture](): TxSnapshot;
  [TxRestore](snapshot: TxSnapshot): void;
  [TxAnnounceValue](tx: Transaction, dirty: boolean, force: boolean, structural?: TxStructuralEvent[]): void;
  [TxSettleValidity](tx: Transaction): void;
}

/** FieldBase declares the four members above as protected, which is what keeps them off the documented surface */
function hooks(element: FieldBase): TxParticipantElement {
  return element as unknown as TxParticipantElement;
}

interface Participant {
  element: FieldBase;
  /** the element's state as the transaction found it, taken the first time the transaction modified the element */
  snapshot?: TxSnapshot;
  /** the commit has to work out whether this element's value changed and announce it where it did */
  valueDirty: boolean;
  /** the caller already knows the value changed, so the commit announces it without comparing */
  forceValue: boolean;
  /** the commit has to re-form this element's verdict and announce a transition of it */
  validityDirty: boolean;
  structural?: TxStructuralEvent[];
}

/** how many containers stand above an element; the commit announces the deepest first */
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

  /** what a rollback has to put back beyond the state slots, newest last */
  private readonly undo: (() => void)[] = [];

  /** what the commit has to do once the change stands, in the order it was handed in */
  private readonly settled: (() => void)[] = [];

  /** true once the transaction has been unwound, which is what tells a run started inside it to say nothing */
  private unwound = false;

  /** the depth the announcement in progress is working at, -1 while none is */
  private passDepth = -1;

  /** set while a pass is running and an element it has already passed the depth of gets enrolled */
  private restartPass = false;

  /** true for a transaction that was rolled back rather than committed */
  get rolledBack(): boolean {
    return this.unwound;
  }

  private participant(element: FieldBase): Participant {
    let entry = this.participants.get(element);
    if (!entry) {
      entry = { element, valueDirty: false, forceValue: false, validityDirty: false };
      this.participants.set(element, entry);
    }
    return entry;
  }

  /**
   * Records the state of an element the first time the transaction modifies it. The whole of the mutable state
   * goes into the snapshot rather than the part being written: a rollback that restored some of it would leave
   * the element in a state the form never held.
   */
  touch(element: FieldBase): void {
    const entry = this.participant(element);
    if (!entry.snapshot) entry.snapshot = hooks(element)[TxCapture]();
  }

  /** Enrols an element as one whose value the commit has to announce. `force` skips the comparison. */
  markValueChanged(element: FieldBase, force: boolean): void {
    const entry = this.participant(element);
    entry.valueDirty = true;
    if (force) entry.forceValue = true;
    this.noteDepth(element);
  }

  /** Enrols an element as one whose verdict the commit has to re-form. */
  markValidityDirty(element: FieldBase): void {
    this.participant(element).validityDirty = true;
    this.noteDepth(element);
  }

  /**
   * Queues an event that states an operation rather than a state. Added and removed items have no net over a
   * transaction, so they are neither compared nor coalesced: the commit emits them in the order they happened.
   */
  recordStructural(element: FieldBase, event: TxStructuralEvent): void {
    const entry = this.participant(element);
    (entry.structural ??= []).push(event);
    this.noteDepth(element);
  }

  /** True where the commit still owes this element a value announcement. */
  willAnnounceValue(element: FieldBase): boolean {
    return this.participants.get(element)?.valueDirty ?? false;
  }

  /**
   * Registers what a rollback has to put back beyond the element's state slots. The snapshot covers the slots,
   * which is everything an ordinary write touches; an operation that replaces something else the element carries
   * hands its own undo in here rather than making every snapshot carry the thing.
   */
  whenRolledBack(work: () => void): void {
    this.undo.push(work);
  }

  /**
   * Registers work that runs once the transaction has committed, and not at all where it is rolled back. It is
   * how an operation defers a step that cannot be taken back - cancelling work in flight, for one - until the
   * change it belongs to actually stands.
   */
  whenCommitted(work: () => void): void {
    this.settled.push(work);
  }

  /**
   * Notes that an element at or below the depth the pass in progress is working at has been enrolled. The pass
   * then gives up the rest of its batch and is started again over what is now owed, so the newcomer is reached
   * before the containers above it: an element a handler writes must still be announced before the container
   * whose composed value carries that write. The depth is only measured while a pass is running - outside one
   * there is nothing the answer would change.
   */
  private noteDepth(element: FieldBase): void {
    if (this.passDepth < 0) return;
    if (depthOf(element) >= this.passDepth) this.restartPass = true;
  }

  /**
   * Puts every element the transaction modified back as it found it. Nothing is announced: from an observer's
   * point of view the transaction never happened. What a rollback cannot take back are side effects - a handler
   * that called a server during the transaction already did.
   */
  rollback(): void {
    this.unwound = true;
    const entries = [...this.participants.values()].reverse();
    entries.forEach((entry) => {
      if (entry.snapshot) hooks(entry.element)[TxRestore](entry.snapshot);
    });
    this.participants.clear();
    // newest first, so an element written twice ends up as the earlier of the two writes found it
    for (let index = this.undo.length - 1; index >= 0; index--) this.undo[index]();
    this.undo.length = 0;
    // the change never stood, so what was waiting for it never runs
    this.settled.length = 0;
  }

  /**
   * Announces what the transaction did. Values first and verdicts after, because a container's validators run
   * with its value announcement and the verdict they reach is what the validity pass then reports. Both passes
   * run deepest first - field, then row, then list - which is the order the change travelled in.
   *
   * A handler may write while the commit runs; its writes join this transaction, so both passes repeat until
   * nothing is left dirty.
   */
  commit(): void {
    for (;;) {
      if (this.announceValues()) continue;
      if (this.settleValidity()) continue;
      break;
    }
    // everything is announced and the change stands, so the steps that were waiting for it run here
    for (let index = 0; index < this.settled.length; index++) this.settled[index]();
    this.settled.length = 0;
  }

  /**
   * The dirty participants a pass has to visit, one bucket per nesting depth; ties keep the order they were
   * enrolled in. A nesting depth is a small integer, so the elements go into buckets rather than through a
   * comparison sort: a whole-list assignment enrols one participant per field, and ordering those by comparison
   * would cost more than the announcement it orders.
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
   * Runs one pass over the dirty participants, deepest bucket first; the caller repeats it until it answers
   * false. The buckets are taken once, and the pass gives up as soon as a handler enrols an element at or below
   * the depth being drained: that element is not in the bucket being walked, and going on would reach the
   * containers above it first. The caller's next pass takes fresh buckets and finds it at its own depth.
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
          // a handler that ran earlier in this pass may have taken the entry off the list of what is owed
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

/** the transaction every mutating operation currently joins, absent while none is open */
let current: Transaction | undefined;

/** the handle of the open transaction, which a nested call joining it receives too */
let currentHandle: TransactionHandle | undefined;

/** The open transaction, for the bookkeeping an element does only where one is running. */
export function currentTransaction(): Transaction | undefined {
  return current;
}

/**
 * Unwinds the transaction from wherever it is called. It is a signal rather than an error: transaction()
 * catches it, rolls back and returns undefined, and nothing is reported as a failure.
 */
class RollbackSignal {}

export interface TransactionControl {
  /**
   * Undoes everything the transaction has done and ends it, announcing nothing. It unwinds from the point of
   * the call, so nothing after it runs. There are no savepoints: a nested call rolls back the whole transaction
   * it joined, not its own part of it.
   *
   * @throws TypeError where the transaction the handle belongs to has already closed.
   */
  rollback(): never;
}

/**
 * The handle one transaction hands the callbacks that take part in it. It is spent the moment the transaction
 * closes: a handle kept beyond that call names a transaction that no longer exists, and letting it unwind
 * whatever transaction happened to be open instead would roll back an unrelated operation.
 */
class TransactionHandle implements TransactionControl {
  private open = true;

  rollback(): never {
    if (!this.open) {
      throw new TypeError(
        'this transaction handle is spent: the transaction that handed it out has closed. A handle is only ' +
          'usable inside the call that received it.',
      );
    }
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
 * Runs `fn` as one atomic change. The writes it makes land in the elements as they are made and the events they
 * produce are announced once, at the end, over the net result.
 *
 * A call made while a transaction is already open joins it: nothing is committed until the outermost call
 * returns. A throw out of `fn` rolls the whole transaction back and rethrows, and `tx.rollback()` rolls it back
 * without an error, in which case the call answers undefined.
 *
 * The handle `fn` receives is usable only for the duration of that call; calling it afterwards throws a TypeError.
 *
 * @throws TypeError immediately if `fn` returns a thenable - a transaction cannot cross an await.
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
    tx.commit();
    return result;
  } catch (error) {
    // the commit may have announced part of the change before the throw; the state goes back all the same, and
    // what a handler did with the events it already received is a side effect no snapshot reaches
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
 * Runs a mutating operation inside the open transaction, opening one for the operation where none is. It is how
 * an element reaches the transaction it takes part in: everything the library mutates goes through here.
 */
export function transactional<R>(fn: (tx: Transaction) => R): R {
  if (current) return fn(current);
  return transaction(() => fn(current!)) as R;
}
