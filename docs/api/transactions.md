# Transactions

A transaction is the unit an observer sees a change in. Every mutating operation runs inside one, so nothing has
to be opted into: where you open no transaction, the operation *is* the transaction — a single atomic change.

Writes land in the elements as they are made; only the **announcement** waits. At the end of a transaction the
net transitions are measured against what the elements last announced, and each is announced once.

```typescript
import { transaction } from '@dynamicforms/vue-forms';

// two writes, one ValueChangedAction on the group, one ValidChangedAction on each level
transaction(() => {
  form.fields.firstName.value = 'Janez';
  form.fields.lastName.value = 'Novak';
});
```

## `transaction(fn)`

```typescript
function transaction<R>(fn: (tx: TransactionControl) => R): R | undefined;
```

Runs `fn` as one atomic change and returns what `fn` returned. A call made while a transaction is already open
**joins** it: nothing is committed until the outermost call returns, and the handle it passes `fn` is the handle
of the transaction that was joined.

The handle is usable only for the duration of the call that received it. Keeping it and calling `rollback()`
afterwards throws a `TypeError`: the transaction it names has closed, and the transaction open at that later
moment is somebody else's.

`fn` must be synchronous. `transaction()` throws a `TypeError` the moment `fn` returns a thenable, so a
transaction structurally cannot cross an `await`. Do the awaiting outside and open a transaction for each
synchronous part; an asynchronous validator settling later opens one of its own at that moment and needs no
coordination.

## What is announced, and when

| what | when |
|---|---|
| validators | while the transaction is open, at the write that triggers them |
| `ValueChangedAction` | at commit, over the value the element ends the transaction holding |
| `ValidChangedAction` | at commit, over the verdict the element ends the transaction with |
| `ListItemAddedAction` / `ListItemRemovedAction` | at commit, in the order the operations happened |
| `VisibilityChanging`/`Changed`, `EnabledChanging`/`Changed` | at the write; a *Changing* action may alter or refuse the value, so it cannot wait |

Validators run during the transaction because the verdict they reach is what the commit announces. The
consequence is that inside a transaction a validator reads the **working** state: a validator on one field that
reads a sibling sees the sibling's new value, which is what makes cross-field rules work. Vue effects are
scheduled after the turn, so a render sees the committed state.

The announcement runs **deepest first** — field, then row, then list — which is the order the change travelled
in. Values are announced first and verdicts after, because a container's own validators run with its value
announcement and the verdict they reach is what the validity pass then reports.

**Value transitions coalesce; structural ones do not.** A value that goes `A → B → A` within one transaction
announces nothing, because the element ends where it started. `ListItemAddedAction` and `ListItemRemovedAction`
state operations rather than states, so they have no net and are emitted in order.

```typescript
const seen: string[] = [];
list.registerAction(new ListItemAddedAction((f, supr, item, index) => seen.push(`added@${index}`)));
list.registerAction(new ValueChangedAction(() => seen.push('value')));

transaction(() => {
  list.push({ name: 'Janez' });
  list.push({ name: 'Micka' });
});
// seen === ['added@0', 'added@1', 'value'] — two additions, one value change
```

## Rollback

The first time a transaction modifies an element it records the whole of that element's mutable state —
`value`, `originalValue`, `touched`, `errors`, `enabled`, `visibility`, and for a `List` its row array. A
rollback puts all of it back, together with the validators a `clearValidators()` dropped, and **announces
nothing**: from an observer's point of view the transaction never happened.

**A throw rolls back and rethrows.** This is what makes atomicity real: a handler that fails halfway through a
whole-group assignment leaves the group exactly as it was rather than half-applied.

```typescript
try {
  transaction(() => {
    form.value = { a: 'x', b: 'y' };   // a handler on b throws
  });
} catch (error) {
  // form.value is what it was before the assignment
}
```

`tx.rollback()` unwinds without an error. It unwinds from the point of the call, so nothing after it runs, and
the `transaction()` call answers `undefined`.

```typescript
const answer = transaction((tx) => {
  row.value = edited;
  if (!row.valid) tx.rollback();
  return row.value;
});
// answer is undefined where the edit was rolled back
```

**There are no savepoints.** A nested call joins the transaction it found and rolls the whole of it back, not
its own part: partial unwinding of a subtree would leave the ancestors' derived state computed over data that no
longer exists.

**A rollback restores state, never side effects.** A handler that called a server during the transaction already
did, and no snapshot reaches that. The same holds for a throw during the announcement: events already emitted
have been received, and only the state goes back.

Two more things a rollback does not undo:

- **an action registered while it was open stays registered.** Registrations are chained closures, and one of
  them cannot be taken out again.
- **an asynchronous validation it started runs to the end.** Nothing can recall the request, so instead its
  verdict is discarded: the field is never left invalid over a value it was rolled back out of. `validating`
  stays `true` until the run settles, because a run in flight is a fact rather than a state.

## Cost

Recording an element's state costs one small object per element the transaction actually modifies, taken the
first time it is written. A whole-list assignment over 1000 rows of 8 fields records about 9000 of them, and the
whole assignment measures at 24 ms against 19 ms for the same fixture without transactions — most of that
difference being the commit's own bookkeeping rather than the record. There is no way to switch the record off,
and none is needed at that ratio.
