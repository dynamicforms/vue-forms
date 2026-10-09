# Actions

Actions are event handlers attached to fields, groups, or lists via `registerAction()`. They form a chain: each handler receives a `supr` function to call the next handler in the chain.

The chain runs in reverse registration order: the action registered last executes first, and its `supr` calls the previously registered action of the same type. If that outermost handler does not call `supr`, none of the remaining handlers run.

```typescript
import { ValueChangedAction } from '@dynamicforms/vue-forms';

field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log(newValue);
  return supr(field, newValue, oldValue); // call the rest of the chain
}));
```

::: tip Calling supr
Always call `supr(field, newValue, oldValue)` unless you deliberately want to stop the action chain. Validators are also actions and sit in the same chain.
:::

## A handler is synchronous

A handler runs inside the write that triggered it (`field.value = x` returns once the chain has run), so a promise
returned by a handler is not awaited. The chain passes it along and the setter discards it. This has two
consequences, and the library reports neither as an error:

- **A rejection is unhandled.** It is reported by the runtime, not by the form: in the browser console, or through
  Node's `unhandledRejection`. The element gets no error and no handler further down the chain is called. The
  exception is [`AbortEventHandlingException`](#aborteventhandlingexception): the trigger returns it instead of
  rejecting, so the discarded promise does not reject.
- **Code after the first `await` runs outside the transaction.** The write has committed by then, so a rollback
  does not undo that code's effects, and a value written there opens a separate transaction.

```typescript
// the form does not see the rejection: the setter has returned before the fetch settles
field.registerAction(new ValueChangedAction(async (f, supr, newValue, oldValue) => {
  await fetch('/api/log', { method: 'POST', body: newValue });
  return supr(f, newValue, oldValue);
}));

// the handler stays synchronous and handles the rejection of the request it starts
field.registerAction(new ValueChangedAction((f, supr, newValue, oldValue) => {
  fetch('/api/log', { method: 'POST', body: newValue }).catch(reportToUser);
  return supr(f, newValue, oldValue);
}));
```

Where the work has to be part of the form's state, the library has two mechanisms that await it:
[an asynchronous `ValidationFunction`](/api/validators#asynchronous-validation), which sets `validating` while it
runs and reports a rejection as an error on the field, and [`Action.execute()`](#executeaction), which sets
`busy` and returns a promise the caller awaits.

`supr` has the exported type `FieldActionExecute<T>`:

```typescript
type FieldActionExecute<T = any> = (field: FieldBase<T>, ...params: any[]) => any;
```

The last handler of every chain returns `null`, so `supr` is always a function.

### One action, many elements

An action instance is registered on an element, and every binding of that element holds the same instance, so an
action registered on a `List`'s item template fires for **every row of the list**. The element the executor
receives as its first argument is the one it fired for; a handler that applies to a single row checks it. The same
holds for validators, which are actions: one `Required` instance validates every row's field.

Actions belong to the **declaration**, and a binding uses the declaration's actions. A row of a list is a binding
of the item template, so registering on a row registers on the item template, and the action applies to every row,
existing and added later, regardless of which element the call was made on:

```typescript
list.push({ amount: 1 });
// registered on an existing row; the validator applies to every row, this one included
list.get(0).fields.amount.registerAction(new Validators.Required());
```

`unregisterAction()` and `clearValidators()` also act on the declaration, so they affect every row. Per row are
the **data**: the value, the errors the action produces there, and the validity.

A handler that applies to one row checks the element it receives; a handler without such a check applies to all
rows:

```typescript
template.fields.amount.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  if (field.parent === list.get(0)) console.log('the first row changed');
  return supr(field, newValue, oldValue);
}));
```

A handler that does not call `supr` ends the run for **every** handler registered before it, on that declaration
and therefore on every row, because the handlers of one declaration form one chain.

An action that keeps data between runs stores it against the element it ran for, not on the action instance (see
[Writing custom actions](#custom-actions)). Data stored on the instance is shared by every row.

### `AbortEventHandlingException`

Throwing `AbortEventHandlingException` from a handler ends the current run. It is not thrown out of the setter:
the trigger catches it and **returns it**, so the caller can distinguish a run a handler ended from a run that
reached no handler. All other exceptions propagate to the caller.

```typescript
import { AbortEventHandlingException, ValueChangedAction } from '@dynamicforms/vue-forms';

field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  if (newValue == null) throw new AbortEventHandlingException('no value to report');
  return supr(field, newValue, oldValue);
}));

const answer = field.triggerAction(ExecuteAction, params);
if (answer instanceof AbortEventHandlingException) {
  // a handler ended the run; message holds the reason
  console.log(answer.message);
}
```

| what happened | the trigger returns |
|---|---|
| a handler threw `AbortEventHandlingException` | that exception, or a promise resolving to it where the chain ran through an asynchronous handler |
| a handler returned `null`, or none is registered | `null` |

**Inside the chain it remains an exception.** `supr` passes on what the handler below it raised: a throw where that
handler is synchronous, a rejected promise where it is asynchronous. A synchronous handler is therefore unwound and
does not run the code after its own `supr` call, and a handler that awaits `supr` receives the same exception from
the await. A handler that continues after it catches the exception and returns it, so the caller receives it as
the result:

```typescript
field.registerAction(new ExecuteAction(async (field, supr, params) => {
  try {
    return await supr(field, params);
  } catch (error) {
    if (!(error instanceof AbortEventHandlingException)) throw error;
    reportToUser(error.message);
    return error;
  }
}));
```

The conversion happens once, at the trigger, for synchronous and asynchronous chains alike: where the chain
returned a `Promise`, the trigger returns a promise that resolves with the exception, so `Action.execute()`
resolves with it and does not reject. The check is `instanceof Promise`, not the presence of a `then` member: a
value object with a `then` member is returned unchanged, and a promise from another realm or another library is
not converted.

**The eager pass does not return it.** `triggerEager()` runs each identifier's eager group separately, and an
exception thrown in one group ends only that group: the remaining groups run and nothing is returned to the
caller. The groups of the rules (every eager action other than a `Validator`) run before the validators. A rule can
change the element's access or value, so where one ran, the validators receive the element's `contribution` read
after it, in place of the value the caller passed. The eager pass runs in these places:

- `registerAction()` and `registerActionBefore()`: both call `triggerEagerFor()`, which returns the exception, and
  discard it, so the consumer does not receive it;
- the trigger at the end of a constructor;
- binding an element: `bind()`, and every `List` row built from an item template with it;
- a write to a leaf's `value`, where the validators run (the most frequent case);
- a change of access, on the element and on every element below it whose `effectiveAccess` changed;
- a container recomputing what it sends;
- `validate(true)`;
- a container completing a record: a `Group` that has written its members, a `List` that has added a row.
  `group.addField()` triggers it directly, as does a row added to a `List`: `list.value = [...]`, an insert, an
  append.

An eager action therefore reports a refusal by setting an error on the element, not by throwing.

**In a `*Changing*` handler it refuses the write.** `AccessChangingAction`, `EnabledChangingAction` and
`VisibilityChangingAction` run before the value is written, so ending the run there means the setter writes
nothing and announces nothing: no `*Changed*` event, no enrolment in an open transaction. Returning the old value
also refuses the write; the exception additionally carries a reason and prevents the handlers registered before it
from running. The two setters use the chain's return value as the value to write, so an asynchronous handler
returns a promise, which fails the type check of either setter.

```typescript
field.registerAction(new VisibilityChangingAction((f, supr, newValue, oldValue) => {
  if (newValue === 'suppress') throw new AbortEventHandlingException('this field is never suppressed');
  return supr(f, newValue, oldValue);
}));
```

**In a `*Changed*` handler it does not refuse the write.** `ValueChangedAction` and the other `*Changed*` actions
fire *after* the value is written, so ending the run only stops the handlers below it; the change remains. To undo
the change, throw an ordinary error: a throw out of a handler rolls the whole [transaction](/api/transactions)
back and rethrows.

## Actions and `watch()`

Every member of an element is a tracked read, so Vue's `watch()` and `watchEffect()` observe an element without an
action:

```typescript
// an action
form.fields.country.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  form.fields.vatId.visibility = newValue === 'SI' ? 'full' : 'suppress';
  return supr(field, newValue, oldValue);
}));

// a watcher
watch(() => form.fields.country.value, (country) => {
  form.fields.vatId.visibility = country === 'SI' ? 'full' : 'suppress';
});
```

Both set the visibility. The differences:

| | Action | `watch()` |
|---|---|---|
| Runs | inside the transaction of the change, at its commit | after the transaction, in Vue's scheduler (`flush: 'pre'` by default) |
| A throw | rolls the transaction back | is reported to `app.config.errorHandler`; the change stays |
| Refuses or changes a write | yes, with `*ChangingAction` | no |
| Order and chaining | handlers run in registration order through `supr`, and a handler can stop the chain | independent callbacks |
| `List` rows | an action on the item template applies to every row | a watcher observes the elements it reads; a new row needs its own watcher |
| Lifetime | the element's | the effect scope's (the component, or a `stop()` call) |
| Declared with the form | yes, the form definition carries it | no, it lives in the component or module that creates it |

The conditional actions (`ConditionalVisibilityAction`, `ConditionalAccessAction`, `ConditionalValueAction`,
`ConditionalStatementAction`) can be replaced by a `watchEffect()` that sets the same member, with the same
differences. On a `List` item template, the `watchEffect()` does not reach the rows.

---

## Value events

### `ValueChangedAction`

Fires when the element's value changes: a `Field`'s `value` (after the new value is set), and a `Group`'s or a `List`'s `fullValue` when any value below it changes. A change of access changes what is sent, not the value, so it fires [`ContributionChangedAction`](#contributionchangedaction) instead.

It fires when the [transaction](/api/transactions) containing the change commits, with the value the element holds
at the end of that transaction: `oldValue` is the value of the last announcement, so a value that goes
`A → B → A` within one transaction announces nothing. An operation without an explicit transaction is its own
transaction, so a single write announces exactly one change.

```typescript
new ValueChangedAction((field, supr, newValue, oldValue) => {
  // handle the change
  return supr(field, newValue, oldValue);
})
```

| Callback param | Type | Description |
|----------------|------|-------------|
| `field` | `FieldBase` | The field that changed |
| `supr` | function | Next handler in the chain |
| `newValue` | `T` | The new value |
| `oldValue` | `T` | The previous value |

On a `Group` or a `List` the two values are the container's `fullValue` after and before the change, so on the
first change of a member `oldValue` is the value the container was constructed with.

**With `watch()`:** `watch(() => field.value, cb)`, and `watch(() => container.fullValue, cb)` on a `Group` or a
`List`. The watcher runs after the transaction. See [Actions and `watch()`](#actions-and-watch).

### `ContributionChangedAction`

Fires when what the element sends to its container changes: its `value` where its access sends it, `null` for
`'disabled-null'`, and `undefined` for `'disabled'`, whose key or row is omitted. It covers the cases
`ValueChangedAction` does not: a change of access changes what is sent without changing the value, and a write to a
`'disabled'` field changes the value without changing what is sent.

```typescript
form.registerAction(new ContributionChangedAction((field, supr, newValue, oldValue) => {
  autosave(newValue);   // what the form sends, after the change
  return supr(field, newValue, oldValue);
}));
```

It fires when the [transaction](/api/transactions) containing the change commits, with the pair (what the element
sends now, what it sent at the last announcement), so a change that goes `'editable' → 'disabled' → 'editable'`
within one transaction announces nothing. On a container it fires when what the container sends changes: through a
member's value, a member's access, or the container's own access.

**With `watch()`:** `watch(() => element.contribution, cb)`. See [Actions and `watch()`](#actions-and-watch).

---

## Access events

### `AccessChangingAction`

Fires **before** `field.access` changes. The return value becomes the access written.

```typescript
new AccessChangingAction((field, supr, newValue, oldValue) => {
  // return the access to write instead, or throw AbortEventHandlingException to refuse
  return supr(field, newValue, oldValue);
})
```

If the action returns `null` or `undefined`, `newValue` is used instead. The default end of the chain returns `null`, so plainly returning `supr(...)` means "no change to `newValue`". Returning `oldValue` refuses the write: nothing is written and nothing is announced. If the resulting value is none of the four accesses, the setter throws `Error("'x' is not an access: …")` and leaves `field.access` as it was.

The setter runs the chain only when the write is a change. Assigning the access the element already has runs no handler and fires no event, so a handler that would return a different value is not called for such a write: `field.access = field.access` leaves the element unchanged. The same holds for `VisibilityChangingAction`.

**With `watch()`:** no equivalent. A watcher runs after the write and cannot refuse or change it.

### `AccessChangedAction`

Fires **after** `field.access` has been updated. It fires when the [transaction](/api/transactions) containing the change commits, once, with the net change: the
value before the transaction's first write and the value at its end. A change that a transaction undoes or rolls
back fires nothing.

```typescript
new AccessChangedAction((field, supr, newValue, oldValue) => {
  console.log('access is now', newValue);
  return supr(field, newValue, oldValue);
})
```

**With `watch()`:** `watch(() => element.access, cb)`. See [Actions and `watch()`](#actions-and-watch).

### `EnabledChangingAction`

Runs **before** a write of `access` that would change `enabled` (a change into or out of `'editable'`), after
`AccessChangingAction`, for the access that would be written, with the two booleans. A change between two accesses
other than `'editable'` does not run it.

`enabled` is derived from `access`, so the return value cannot set it; it allows or refuses the write of `access`.
Returning `newValue`, `null` or `undefined` allows the write. Returning `oldValue`, or throwing
`AbortEventHandlingException`, refuses it: `access` keeps its value and nothing is announced. Any other return value
throws.

```typescript
new EnabledChangingAction((field, supr, newValue, oldValue) => {
  // keep the field editable while it holds an unsaved draft
  if (!newValue && hasDraft(field)) return oldValue;
  return supr(field, newValue, oldValue);
})
```

**With `watch()`:** no equivalent. A watcher runs after the write and cannot refuse or change it.

### `EnabledChangedAction`

Fires **after** a write of `access` has changed `enabled` (a change into or out of `'editable'`), right after
`AccessChangedAction` at the commit, with the two booleans of the net change. A change between two accesses other than `'editable'` changes what
the element sends but not `enabled`, and does not fire it.

```typescript
new EnabledChangedAction((field, supr, newValue, oldValue) => {
  console.log(newValue ? 'accepts input' : 'accepts no input');
  return supr(field, newValue, oldValue);
})
```

**With `watch()`:** `watch(() => element.enabled, cb)`. See [Actions and `watch()`](#actions-and-watch).

---

## Visibility events

### `VisibilityChangingAction`

Fires **before** `field.visibility` changes. Return value replaces `newValue`.

```typescript
new VisibilityChangingAction((field, supr, newValue, oldValue) => {
  return supr(field, newValue, oldValue);
})
```

If the action returns `null` or `undefined`, `newValue` is used instead. Returning `oldValue` refuses the write: nothing is written and nothing is announced. A result that is none of the four [visibilities](/api/field-base#visibility) makes the setter throw `Error("'x' is not a visibility: …")` and leaves `field.visibility` as it was.

**With `watch()`:** no equivalent. A watcher runs after the write and cannot refuse or change it.

### `VisibilityChangedAction`

Fires **after** `field.visibility` has been updated. It fires when the [transaction](/api/transactions) containing the change commits, once, with the net change: the
value before the transaction's first write and the value at its end. A change that a transaction undoes or rolls
back fires nothing.

**With `watch()`:** `watch(() => element.visibility, cb)`. See [Actions and `watch()`](#actions-and-watch).

---

## Validation events

### `ValidChangedAction`

Fires when `field.valid` transitions between `true` and `false`.

```typescript
new ValidChangedAction((field, supr, newValue, oldValue) => {
  console.log('validity changed to', newValue);
  return supr(field, newValue, oldValue);
})
```

A `Group` and a `List` derive their validity from their members, so the action fires on the container whenever a
member's validity changes the container's, also when no value changed, for example when an asynchronous validator
settles or when `clearValidators()` makes a previously invalid member valid. Writing to `member.errors` directly
changes `valid` on the member and on every container above it, but announces nothing: the member's `validate()`
announces the transition and makes the container announce its own. The notification propagates up to the first
ancestor whose validity does not change.

Validity changes are announced when the [transaction](/api/transactions) containing the change commits, after the
value changes of that transaction, deepest element first, so a container announces only after the member that
caused the change. One assignment to a container's `value` therefore produces at most one notification on that
container: the members are written first and the container is evaluated afterwards, so it announces the net
transition and never the validity of a partially applied value. The same holds for an assignment to a single
member, and for `validate(true)` on a container, which revalidates the members first and computes its own validity
once over the complete set.

**With `watch()`:** `watch(() => element.valid, cb)`. `valid` follows `errors` at once, so the watcher also sees an error pushed by hand before `validate()` is called; `ValidChangedAction` fires only when `validate()` or a validator announces the change. See [Actions and `watch()`](#actions-and-watch).

---

## Manual trigger

### `ExecuteAction`

A generic action that does not fire automatically. Trigger it explicitly via `field.triggerAction(ExecuteAction, payload)`.

```typescript
import { ExecuteAction } from '@dynamicforms/vue-forms';

field.registerAction(new ExecuteAction((field, supr, params) => {
  console.log('manually triggered with', params);
  return supr(field, params);
}));

field.triggerAction(ExecuteAction, { reason: 'submit' });
```

`triggerAction()` returns whatever the chain returns, the `AbortEventHandlingException` a handler threw to end the run (a promise resolving to it where the chain went through an asynchronous handler), or `null` when no action of that type is registered on the field. `Action.execute(params)` on the `Action` class triggers the same action and returns the same value, wrapped in a promise.

`canExecute(action): boolean` returns whether the handler can run now on `action`. The base class returns `true`. A
subclass overrides it with a condition, and [`Action.executable`](/api/action) is `false` while any
`ExecuteAction` registered on the action returns `false`. The read is reactive where the condition reads reactive
state, so a button bound to `executable` follows it.

**With `watch()`:** no equivalent. `ExecuteAction` runs when `execute()` is called, not on a change of state.

[`Action`](/api/action) is the element that runs an `ExecuteAction` chain on `execute()`.
[`SubmitAction`](/api/action#submitaction-target-handler-options) and
[`RejectAction`](/api/action#rejectaction-target) are `ExecuteAction` handlers that submit and reset a form.

---

## List events

### `ListItemAddedAction`

Fires on a `List` for every row that enters it: through `push()` or `insert()`, and through a `value` assignment for
each row it builds (a row reused at its position does not enter the list).

```typescript
new ListItemAddedAction((field, supr, item, index) => {
  console.log('item added at', index, item);
  return supr(field, item, index);
})
```

`index` is the position of `item` in the list, which is also what `insert()` returns. A negative index passed to
`insert()` is resolved the way `Array.prototype.splice` resolves it and announced resolved, so it is never
negative here. `insert()` past the end of the list pads it first, and each padding item is announced with its own
index before the final trigger for the inserted item.

Additions and removals are operations, not states, so they have no net result over a
[transaction](/api/transactions) and are never cancelled out: every one of them is announced, in the order the
operations happened, before the resulting value change. A handler reading `list.value` therefore sees the rows at
the end of the transaction, not the rows at the time its own item was added.

**With `watch()`:** `watch(() => [...list.items], (rows, oldRows) => …)` observes additions and removals together; the callback compares the two arrays to find the added and removed rows. See [Actions and `watch()`](#actions-and-watch).

### `ListItemRemovedAction`

Fires on a `List` for every row that leaves it: through `pop()` or `remove()`, through a `value` assignment for each
row it does not reuse, and through `clear()`. Several rows leave from the last one, so every announced index is the
row's position at the moment it leaves.

```typescript
new ListItemRemovedAction((field, supr, item, index) => {
  console.log('item removed from', index, item);
  return supr(field, item, index);
})
```

`item` is the removed row itself, detached from the list (so without `parent`) and holding everything it held while it was in the list: its values, its errors and the change history behind `isChanged`. It is the instance `remove()` returns to the caller, and the one `list.get(index)` returned before the call. `pop()` delegates to `remove()`, so it behaves identically.

**With `watch()`:** see `ListItemAddedAction`.

---

## Conditional actions

Conditional actions automatically toggle a field property when a `Statement` evaluates to a different boolean.

Conditional actions are eager: `registerAction()` evaluates the statement immediately and sets the field property right away. A conditional action passed to a constructor through `params.actions` does the same once the element is built, over its final value. After that, the executor only runs when the result of the statement changes (`true` → `false` or `false` → `true`), not on every value change. The executor is applied to the fields the action is bound to, not to the fields appearing in the statement.

Registered on a `List`'s item template, a conditional action applies to every row, and **each row has its own
result**. A statement built from the item template's fields reads the fields of the row it is evaluated for, so
two rows with different values can have different results, and a change in one row affects only that row. A field
outside the rows (one that belongs to the whole form) is read as is, and a change to it re-evaluates every row.

A conditional action follows the fields its statement reads through a `ValueChangedAction` it registers on each of
them. That listener runs outermost in the field's chain, so a `ValueChangedAction` the application registers on the
same field runs after it and cannot keep it from running by not calling `supr`. The listener is removed when the
conditional action is taken off the last element it is registered on.

```typescript
const row = new Group({ kind: new Field({ value: 'standard' }), detail: new Field({ value: '' }) });
row.fields.detail.registerAction(
  new ConditionalVisibilityAction(new Statement(row.fields.kind, Operator.EQUALS, 'other')),
);

const lines = new List(row, { value: [{ kind: 'other' }, { kind: 'standard' }] });
lines.get(0).fields.detail.visibility; // 'full'
lines.get(1).fields.detail.visibility; // 'suppress'
```

### `Statement`

A logical or comparison expression built from fields, constants, and an `Operator`.

```typescript
import { Statement, Operator } from '@dynamicforms/vue-forms';

const stmt = new Statement(activeField, Operator.EQUALS, true);
// Nested statements
const combined = new Statement(stmt, Operator.AND, new Statement(ageField, Operator.GE, 18));
```

`evaluate(scope?): boolean` always returns a boolean: the logical operators coerce their operands, so
`new Statement(0, Operator.AND, true).evaluate()` is `false` and not `0`, and a conditional executor therefore
always receives a boolean `currentResult`.

`scope` is an element whose record the field operands are read from: a row of a `List`, or the form itself.
`statement.evaluate(list.get(1))` reads the second row's fields even where the statement was built from the item
template's fields, so one statement can serve every row. An operand belonging to another record is read as is, so
a form-level field compared against a row's field is the same field for every row, and an operand taken from an
*enclosing* item template is that item template's own field, not the field of the enclosing row a nested list is
in. Called without an argument, the statement reads exactly the fields it was built from.

`EQUALS` / `NOT_EQUALS` compare with loose `==`, so `'1'` and `1` are equal, and so are `null` and `undefined`.

Each operand has the exported type `OperandType`: a nested `Statement`, a `FieldBase` whose current `value` is
compared, or a literal of any type. Because the union includes `any`, the type checker accepts any operand; the
three cases are distinguished at evaluation time with `instanceof`.

The constructor rejects two values that are not operands, **throwing a `TypeError`** that names the operand's
position:

- `undefined`, which is what `group.fields.typoName` returns. Compare against `null` to test for an unset value;
  `group.field('typoName')` returns `null`, and `null` is a valid literal operand;
- a **function**, typically a field accessor passed without calling it. Pass the field it returns:
  `group.field('name')`.

All other values are accepted: a field, a nested statement, `null`, `NaN`, `0`, `''`, an array, an object with
`includes`.

`Operator.NOT` reads only its first operand and is written with one:

```typescript
new Statement(field, Operator.NOT);                   // NOT takes one operand
new Statement(field, Operator.EQUALS, 'admin');       // every other operator takes two
```

A second operand with `NOT` is accepted and ignored. An operator held in a variable (the return value of
`Operator.fromString()`, which is how a condition from a server is typically parsed) requires both operands,
because the compiler cannot distinguish it from `NOT`:

```typescript
const operator = Operator.fromString(fromServer);
new Statement(field, operator, other);   // pass both operands, whichever operator it is
```

```typescript
new Statement(form.fields.typo, Operator.EQUALS, 1);
// TypeError: Statement operand 1 is undefined: an operand is a field, a nested statement or a literal, …
```

`Statement` itself is passive: it computes its value only when you call `evaluate()`. Reactivity comes from the conditional action you pass it to: its constructor uses `collectFields()` to gather every field appearing in the statement and registers a `ValueChangedAction` on each of them, so the statement is re-evaluated whenever any of those fields changes. This happens when you write `new ConditionalVisibilityAction(stmt)`, before the action is registered on any field. One handler is registered per field regardless of how many rows read it, and the handler re-evaluates the record the change happened in.

`collectFields(): Set<FieldBase>` is public: it walks the statement and its nested statements and returns the field
instances themselves, which is useful when you want to attach your own handlers to the same set.

`operand1Value` and `operand2Value` read the two operands the way `evaluate()` does (a nested statement is
evaluated, a field gives its `value`, a literal is itself), over the fields the statement was built from. Neither
takes a record, so on a statement serving a `List` they return the item template's values.

### `Operator`

Enum of supported operators:

| Group | Values |
|-------|--------|
| Logic | `NOT`, `OR`, `AND`, `XOR`, `NAND`, `NOR` |
| Comparison | `EQUALS`, `NOT_EQUALS`, `LT`, `LE`, `GE`, `GT` |
| Membership | `IN`, `NOT_IN`: evaluate `operand2.includes(operand1)` (array or string) and coerce its result to a boolean. `NOT_IN` is the negation of `IN`, so an `operand2` without a callable `includes` gives `IN` `false` and `NOT_IN` `true` |
| Substring | `INCLUDES`, `NOT_INCLUDES`: `operand1` contains the substring `operand2`; both operands must be strings, otherwise `INCLUDES` is `false` and `NOT_INCLUDES` `true` |

Use `Operator.fromString('and')` to parse a string at runtime. It is case insensitive and also accepts hyphen and space variants (`'not equals'`, `'not-in'`, `'not_includes'`); an unrecognised string throws an `Error`. `Operator.isDefined(value)` returns whether a number or a string is an
operator, and returns `false` for an unrecognised string.

### `ConditionalVisibilityAction(statement, whenTrue?, whenFalse?)`

Sets `field.visibility` to `whenTrue` (default `'full'`) while `statement` is `true` and to `whenFalse` (default
`'suppress'`) otherwise. Visibility affects presentation only, so what the field sends is determined by its access;
a field that also has to be omitted from the payload needs a `ConditionalAccessAction` as well.

```typescript
import { ConditionalVisibilityAction, Statement, Operator } from '@dynamicforms/vue-forms';

targetField.registerAction(new ConditionalVisibilityAction(
  new Statement(showField, Operator.EQUALS, true)
));
```

### `ConditionalAccessAction(statement, whenTrue?, whenFalse?)`

Sets `field.access` to `whenTrue` (default `'editable'`) while `statement` is `true` and to `whenFalse` (default
`'disabled'`) otherwise.

```typescript
vatId.registerAction(
  new ConditionalAccessAction(new Statement(company, Operator.EQUALS, true), 'editable', 'disabled-null'),
);
```

### `ConditionalValueAction(statement, trueValue)`

Sets `field.value = trueValue` when `statement` transitions to `true`. Does nothing on `false`.

The value is set only on the transition from `false`/`undefined` to `true`: if you later change the value manually, the action will not restore it until the statement goes back to `false` and becomes `true` again. The value is set regardless of the field's access.

### `ConditionalStatementAction(statement, executorFn)`

Base class for all conditional actions. Use when the derived classes don't cover your case.

```typescript
import { ConditionalStatementAction, Statement, Operator } from '@dynamicforms/vue-forms';

targetField.registerAction(new ConditionalStatementAction(
  new Statement(sourceField, Operator.GT, 0),
  (field, currentResult, previousResult) => {
    field.touched = currentResult;
  }
));
```

| Callback param | Type | Description |
|----------------|------|-------------|
| `field` | `FieldBase` | The field this action is registered on |
| `currentResult` | `boolean` | Current evaluation of the statement |
| `previousResult` | `boolean \| undefined` | Previous result (`undefined` on first run) |

**With `watch()`:** a `watchEffect()` that reads the statement's fields and sets the member. It does not reach the rows of a `List` when the action would sit on the item template. See [Actions and `watch()`](#actions-and-watch).

---

## Custom actions

For actions that are not conditional, derive from the exported `FieldActionBase`. Every action class must declare a static `classIdentifier`: it is the key under which `ActionsMap` stores the chain. Without it the base class throws `Error('classIdentifier must be declared')` on registration.

```typescript
import { FieldActionBase } from '@dynamicforms/vue-forms';

const MyActionClassIdentifier = Symbol('MyAction');

class MyAction extends FieldActionBase {
  static get classIdentifier() {
    return MyActionClassIdentifier;
  }
}

field.registerAction(new MyAction((field, supr, ...params) => supr(field, ...params)));
field.triggerAction(MyAction, 'some param');
```

An action must derive from `FieldActionBase`: `registerAction()` checks `instanceof FieldActionBase` and rejects
anything else with `Error('Invalid action type')`, so a plain object with a matching `execute` method is rejected.

Optional overrides:

| Member | Description |
|--------|-------------|
| `boundToBinding(binding)` | Called once for every element this action applies to: the element it is registered on, and every binding of that element when the binding receives the action. Use it to record the elements the action applies to |
| `get eager()` | Return `true` to have the action run over what the element sends (its [`contribution`](/api/field-base#prop-contribution)) at every point the eager pass runs: registration, construction, `bind()`, `validate(true)`, a write to a leaf's `value` that changes what it sends (inside the write, before any `ValueChangedAction` fires), a change of access, and a container recomputing what it sends, which re-runs a group's eager action when a member changes. [The full list is under `AbortEventHandlingException`](#aborteventhandlingexception). Defaults to `false`, and it is read per instance: the eager pass does not run a non-eager action registered under the same `classIdentifier` as an eager one |
| `unregisterFrom(binding)` | Called by `unregisterAction()` and by `clearValidators()`, with the element the action was removed from. Override it to release what the action installed for that element: `CompareTo` stops validating it, and `Validator` removes the errors it set there. It runs inside the operation that removed the registration, so a rollback restores both the registration and what this method removed |

State an action keeps between runs belongs to the element it ran for, because the instance is shared by every
binding of the element it was registered on. `protected state<S>(key, init): S` stores it: the key is the element,
or the record the element belongs to where the state concerns the whole record, and the entry is released together
with the key.

```typescript
class CountingAction extends ValueChangedAction {
  constructor() {
    super((field, supr, newValue, oldValue) => {
      const counter = this.state(field, () => ({ writes: 0 }));
      counter.writes += 1;
      return supr(field, newValue, oldValue);
    });
  }
}
```

### Reading a second element of the record

An eager action that reads a second element (a validator comparing two fields, a statement over another field of
the row) can run before the record it reads exists: a `List` row is built by binding the item template member by
member, and a member's eager pass runs while the member is not yet in a record. Where the lookup finds nothing,
call `field.markRecordIncomplete()` and do not set a validation result. The container that completes the record
runs the pass again over the complete record (a `Group` after it has written the data it was given), and a pass
that still finds nothing marks the record incomplete again, so the container above (the `List` adding the row to
the form) runs it in turn. `CompareTo` and the conditional actions do this, so a row whose values equal the item
template's still has its own validation result.

`element.declaration` and `container.bindingsOf(declaration)` are the means for such an action to resolve
elements: the first returns, for a row's field, the item template's field it was declared as; the second returns
every element of a subtree declared as a given element.

### `ActionsMap`

The actions one element has registered, grouped by `classIdentifier`. It is the type of `FieldBase`'s internal
action store and is exported so that type can be named; `registerAction()`, `registerActionBefore()`,
`unregisterAction()`, `triggerAction()` and `clearValidators()` on the field are the supported way to use it. Its
own members are `register()`, `unregister()`, `trigger()`, `triggerEager()`, `triggerEagerFor()`, `willTrigger()`,
`hasEager`, `ofClass()`, `validators` and `bindTo()`.

Within a group the actions are stored in registration order and run from the last to the first, so the newest
registration is the outermost handler and calls the ones before it through its `supr`.

`register(action, before?)` appends `action` to its group, or, where `before` is given, inserts it at that action's
position, so `before` wraps it. `before` must be registered under the same identifier; anything else throws.
`unregister(action)` removes it and returns whether the map contained it. The group array is replaced, not
modified, so a run already in progress finishes on the array it started with and the removal takes effect from the
next trigger.

`trigger(ActionClass, field, ...params)` runs the group registered under that class and returns what its outermost
handler returned. `triggerEager(field, ...params)` runs the eager actions of every identifier, each group
separately, and `triggerEagerFor(identifier, field, ...params)` runs those of one identifier. `trigger` and
`triggerEagerFor` return an `AbortEventHandlingException` a handler threw, or a promise resolving to it where the
chain ran through an asynchronous handler; `triggerEager` returns nothing, and such an exception ends only the
group it was thrown in, on the asynchronous path as on the synchronous one.
`willTrigger(identifier)` returns whether any action is registered under that identifier and `hasEager` whether
any eager action is registered at all, so a caller can skip building the parameters when nothing would run.
`ofClass(identifier)` returns the actions registered under `identifier`, and `validators` the registered
validators, both in registration order.

Binding an element uses the declaration's map itself, not a copy, and `bindTo(owner)` notifies each action in it
that it now applies to `owner`. This is how an action registered on an item template applies to every row.

A handler calls the one before it through `supr`, so a chain runs on the call stack and its depth is limited by
the stack size: about 1300 handlers under one identifier on one element, beyond which firing it throws a
`RangeError`. Registrations spread over several identifiers or several elements do not add up.

---

> See also: [The model](/guide/model), [Action example](/examples/action),
> [Conditional statements example](/examples/conditional-statement), [Field API](/api/field)
