# Transactions Example

Every mutating operation is a transaction. Where no transaction is open, the operation opens its own, so a single
write announces once and cannot be observed half-applied. `transaction()` groups several writes into one
transaction.

## Several writes, one announcement

Without a transaction each write announces separately, and a handler on the form runs once per write. Inside a
transaction, the writes are applied as they are made and the announcement happens once, for the net change.

```typescript
import { Field, Group, ValueChangedAction, transaction } from '@dynamicforms/vue-forms';

const form = new Group({
  street: new Field({ value: '' }),
  city: new Field({ value: '' }),
  postCode: new Field({ value: '' }),
});

const announcements: any[] = [];
form.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  announcements.push(newValue);
  return supr(field, newValue, oldValue);
}));

// three writes, three announcements
form.fields.street.value = 'Slovenska cesta 1';
form.fields.city.value = 'Ljubljana';
form.fields.postCode.value = '1000';
announcements.length;  // 3

announcements.length = 0;

// the same three writes as one operation
transaction(() => {
  form.fields.street.value = 'Trg svobode 5';
  form.fields.city.value = 'Maribor';
  form.fields.postCode.value = '2000';
});
announcements.length;  // 1, for the complete address
```

A value that returns to its starting value announces nothing. A commit announces the current value against the
value at the last announcement; intermediate steps are not announced:

```typescript
announcements.length = 0;
transaction(() => {
  form.fields.city.value = 'Koper';
  form.fields.city.value = 'Maribor';   // back to what it held
});
announcements.length;  // 0
```

## Filling a form from a server response

A payload arrives, several fields are written from it, and the form must be consistent when anything reads it,
including the cross-field validators.

```typescript
import { Field, Group, Validators, transaction } from '@dynamicforms/vue-forms';

const booking = new Group({
  from: new Field<string>({ value: '' }),
  to: new Field<string>({
    value: '',
    validators: [
      new Validators.CompareTo<string>('from', (to, from) => !from || !to || to >= from, 'must not precede the start'),
    ],
  }),
});

// written one at a time, `to` is validated against a `from` that is not there yet
transaction(() => {
  booking.fields.from.value = '2026-08-20';
  booking.fields.to.value = '2026-08-24';
});

booking.valid;  // true: both dates were written before validity was announced
```

## Undoing an edit

`tx.rollback()` undoes everything the transaction did and announces **nothing**. Use it for a cancel button on an
editing dialog.

```typescript
const row = new Group({
  name: new Field({ value: 'Ada Lovelace' }),
  role: new Field({ value: 'author' }),
});

transaction((tx) => {
  row.fields.name.value = 'Grace Hopper';
  row.fields.role.value = 'admiral';

  if (!userConfirmedTheEdit()) tx.rollback();
});

row.value;  // { name: 'Ada Lovelace', role: 'author' } where the edit was cancelled
```

The handle is valid only until the call returns. Calling `rollback()` on it later throws a `TypeError`; it does
not roll back a transaction that is open at that time.

## A throw puts everything back

When a handler throws, the form is restored to its state before the transaction, and the error is rethrown:

```typescript
const form = new Group({ a: new Field({ value: 'first' }), b: new Field({ value: 'second' }) });

form.fields.b.registerAction(new ValueChangedAction(() => {
  throw new Error('the server rejected it');
}));

try {
  transaction(() => {
    form.fields.a.value = 'changed';
    form.fields.b.value = 'changed';   // the handler throws here
  });
} catch (error) {
  form.fields.a.value;  // 'first': the whole transaction is rolled back, not only the failing write
}
```

A rollback does not undo side effects: a server call a handler made during the transaction has already happened.
Rollback restores only the form's state.

## Rows, and what a rollback does with them

A `List` is restored structurally: rows the transaction created are dropped, and rows it removed are put back at
the positions they held.

```typescript
import { List } from '@dynamicforms/vue-forms';

const people = new List(new Group({ name: new Field({ value: '' }) }));
people.push({ name: 'Ada' });
people.push({ name: 'Grace' });

transaction((tx) => {
  people.push({ name: 'Katherine' });
  people.remove(0);
  people.length;   // 2 while the transaction runs
  tx.rollback();
});

people.length;              // 2
people.get(0)!.value.name;  // 'Ada', at its original position
```

## Nesting

A `transaction()` called while one is open **joins** it. Nothing commits until the outermost call returns, and a
rollback at any level rolls back the whole transaction (there are no savepoints).

```typescript
transaction(() => {
  form.fields.a.value = 'outer';

  transaction(() => {
    form.fields.b.value = 'inner';   // joins the transaction above
  });
  // nothing has been announced yet

});  // one announcement, over both writes
```

Library operations therefore compose: `list.value = rows` is a transaction of its own, and inside your
transaction it becomes part of your transaction.

## What a transaction may not do

A transaction cannot cross an `await`. A callback that returns a promise makes the call throw a `TypeError`
as soon as the callback returns, and the transaction is rolled back:

```typescript
transaction(async () => {          // TypeError
  await fetch('/api/thing');
});

// do the waiting outside, and open a transaction for each synchronous part
const data = await fetch('/api/thing').then((r) => r.json());
transaction(() => {
  form.value = data;
});
```

An asynchronous validator started inside a transaction is not affected by this: it opens its own transaction when
it settles, and if the transaction that started it was rolled back, its result is discarded.

## See also

- [`transaction()` API reference](/api/transactions): the full contract, including what a snapshot covers
- [The model](/guide/model): where transactions sit among the other pieces
