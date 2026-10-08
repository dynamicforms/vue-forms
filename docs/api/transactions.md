# Transactions

A transaction is the unit in which an observer sees a change. Every mutating operation runs inside one, with no
opt-in: where no transaction is open, the operation is its own transaction, a single atomic change.

Writes are applied to the elements immediately; only the **announcement** is deferred. At the end of a transaction
the net transitions are compared against what the elements last announced, and each transition is announced once.

```typescript
import { transaction } from '@dynamicforms/vue-forms';

// two writes, one ValueChangedAction on the group instead of two
transaction(() => {
  form.fields.firstName.value = 'Janez';
  form.fields.lastName.value = 'Novak';
});
```

## `transaction(fn)`

```typescript
function transaction<R>(fn: (tx: TransactionControl) => R): R | undefined;
```

Runs `fn` as one atomic change and returns the value `fn` returns. A call made while a transaction is already open
**joins** it: nothing is committed until the outermost call returns, and the handle passed to `fn` is the handle
of the joined transaction.

The handle is valid only during the call that received it. Calling `rollback()` on a stored handle afterwards
throws a `TypeError`: its transaction is closed, and any transaction open at that time is a different one.

`fn` must be synchronous. `transaction()` throws a `TypeError` when `fn` returns a thenable, so a transaction
cannot span an `await`. Await outside the transaction and open a transaction for each synchronous part. An
asynchronous validator that settles later opens its own transaction and needs no coordination.

## What is announced, and when

| what | when |
|---|---|
| validators | while the transaction is open, at the write that triggers them |
| `ValueChangedAction` | at commit, over what the element ends the transaction holding |
| `ValidChangedAction` | at commit, over the validity the element ends the transaction with |
| `ListItemAddedAction` / `ListItemRemovedAction` | at commit, in the order the operations happened |
| `VisibilityChangingAction`, `AccessChangingAction`, `EnabledChangingAction` | at the write: a *Changing* action may alter or refuse the value, so it cannot wait |
| `AccessChangedAction`, `EnabledChangedAction`, `VisibilityChangedAction` | at commit, before `ValueChangedAction`, over the access and visibility the element ends the transaction with |
| `ContributionChangedAction` | at commit, after `ValueChangedAction`, over what the element ends the transaction sending |

Validators run during the transaction because the commit announces their result. Consequently, inside a
transaction a validator reads the **working** state: a validator on one field that reads a sibling sees the
sibling's new value. Cross-field rules depend on this. Vue effects are scheduled after the current tick, so a
render sees the committed state.

The announcement runs **deepest first**: field, then row, then list, the order in which the change propagated.
Access, enabled and visibility are announced first, then values, then validity, because a container's own validators run with its value announcement and
their result is what the validity pass then announces.

**Value transitions coalesce; structural ones do not.** A value that goes `A → B → A` within one transaction
announces nothing, because the element ends where it started. `ListItemAddedAction` and `ListItemRemovedAction`
describe operations, not states, so they have no net result and are emitted in order.

```typescript
const seen: string[] = [];
list.registerAction(new ListItemAddedAction((f, supr, item, index) => seen.push(`added@${index}`)));
list.registerAction(new ValueChangedAction(() => seen.push('value')));

transaction(() => {
  list.push({ name: 'Janez' });
  list.push({ name: 'Micka' });
});
// seen === ['added@0', 'added@1', 'value'] (two additions, one value change)
```

## Rollback

The first time a transaction modifies an element, it records the element's entire mutable state: `value`,
`originalValue`, `touched`, `errors`, `access`, `visibility`, for a `Group` the names of its members and for a
`List` its row array. A rollback restores all of it, together with the actions the transaction registered or
unregistered (including the validators removed by `clearValidators()`), and **announces nothing**: to an observer,
the transaction did not happen. An asynchronous validation that the unregistration would have cancelled is
restored as well: the cancellation runs only at commit, so a run in flight when the transaction opened continues
and its result applies.

**A throw rolls back and rethrows.** A handler that fails partway through a whole-group assignment leaves the
group unchanged, not partially assigned.

```typescript
try {
  transaction(() => {
    form.value = { a: 'x', b: 'y' };   // a handler on b throws
  });
} catch (error) {
  // form.value is what it was before the assignment
}
```

`tx.rollback()` rolls back without an error. Execution stops at the call, so no code after it runs, and the
`transaction()` call returns `undefined`.

```typescript
const answer = transaction((tx) => {
  row.value = edited;
  if (!row.valid) tx.rollback();
  return row.value;
});
// answer is undefined where the edit was rolled back
```

**There are no savepoints.** A nested call joins the open transaction, and a rollback from it rolls back the whole
transaction, not only the nested part. Partially rolling back a subtree would leave the ancestors' derived state
computed over data that no longer exists.

**A rollback restores state, not side effects.** A server call made by a handler during the transaction is not
undone. The same applies to a throw during the announcement: events already emitted have been received, and only
the state is restored.

A rollback also does not undo an asynchronous validation it started; it cancels it. The `AbortSignal` passed to
the validation function is aborted, so work that checks the signal stops, and work that does not runs to
completion. In both cases the result is discarded, so the field is never left invalid for a value that was rolled
back. `validating` stays `true` until the run settles. The counters behind `validating` are the only state a
rollback does not restore, because restored counters would not match the number of runs still pending.

## Cost

Recording an element's state allocates one small object per element the transaction modifies, on the first write
to that element. The record cannot be switched off.

---

> See also: [The model](/guide/model) for where transactions sit among the rest of the library
