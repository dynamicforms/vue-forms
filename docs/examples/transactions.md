# Transactions Example

Every mutating operation is a transaction. Where you do not open one, the operation is its own — so a single write
announces once and cannot be observed half-applied. `transaction()` is how several writes become one.

## Several writes, one announcement

Without a transaction each write announces on its own, and a handler watching the form runs once per write. Inside
one, the writes land as they are made and the announcement happens once, over the net change.

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
announcements.length;  // 1, over the finished address
```

A value that goes back to where it started announces nothing at all — the pair a commit carries is the value now
against the value at the last announcement, not every step in between:

```typescript
announcements.length = 0;
transaction(() => {
  form.fields.city.value = 'Koper';
  form.fields.city.value = 'Maribor';   // back to what it held
});
announcements.length;  // 0
```

## Filling a form from a server response

This is what the shape is for. A payload arrives, several fields are written from it, and the form has to be
consistent by the time anything reads it — including the cross-field validators.

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

booking.valid;  // true — both dates were in place before the verdict was announced
```

## Undoing an edit

`tx.rollback()` withdraws everything the transaction did and announces **nothing**: from a reader's point of view
it never happened. It is what a cancel button on an editing dialog needs.

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

The handle is spent when the call returns: keeping it and calling `rollback()` later throws a `TypeError` rather
than unwinding whatever transaction happens to be open at that moment.

## A throw puts everything back

A handler that fails halfway through leaves the form as it was, and the error reaches you:

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
  form.fields.a.value;  // 'first' — the whole transaction went back, not just the failing write
}
```

What a rollback cannot take back is a side effect: a handler that called a server during the transaction already
did. Rollback restores the form, not the world.

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
people.get(0)!.value.name;  // 'Ada' — back at the position it held
```

## Nesting

A `transaction()` called while one is open **joins** it. Nothing commits until the outermost call returns, and a
rollback anywhere unwinds the whole thing — there are no savepoints.

```typescript
transaction(() => {
  form.fields.a.value = 'outer';

  transaction(() => {
    form.fields.b.value = 'inner';   // joins the transaction above
  });
  // nothing has been announced yet

});  // one announcement, over both writes
```

This is what lets a library call be composed: `list.value = rows` is a transaction of its own, and putting it
inside yours makes it part of one operation rather than two.

## What a transaction may not do

It may not cross an `await`. The call refuses a callback that returns a promise, immediately and with a
`TypeError`, rather than committing at a moment nobody can name:

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

An asynchronous validator started inside a transaction is unaffected: it opens a transaction of its own when it
settles, and if the transaction that started it was rolled back, its verdict is discarded.

## See also

- [`transaction()` API reference](/api/transactions) — the full contract, including what a snapshot covers
- [The model](/guide/model) — where transactions sit among the other pieces
