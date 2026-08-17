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

`supr` has the exported type `FieldActionExecute<T>`:

```typescript
type FieldActionExecute<T = any> = (field: FieldBase<T>, ...params: any[]) => any;
```

At the end of every chain sits a handler that returns `null`, so `supr` is always a function.

### `AbortEventHandlingException`

Throwing `AbortEventHandlingException` from a handler aborts the rest of the chain. `ActionsMap` catches it, so it never escapes the setter and `triggerAction()` returns `null` for that trigger. All other exceptions propagate to the caller.

```typescript
import { AbortEventHandlingException, ValueChangedAction } from '@dynamicforms/vue-forms';

field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  if (newValue == null) throw new AbortEventHandlingException();
  return supr(field, newValue, oldValue);
}));
```

Note that `ValueChangedAction` fires *after* the new value has already been stored, so aborting stops further event handling — it does not roll the change back. To undo the change as well, throw an ordinary error instead: a throw out of a handler rolls the whole [transaction](/api/transactions) back and rethrows.

## Value events

### `ValueChangedAction`

Fires when `field.value` changes (after the new value is set). Also fires on `Group` and `List` when any descendant changes.

It fires when the [transaction](/api/transactions) carrying the change commits, over the value the element ends
that transaction holding: `oldValue` is what the element last announced, so a value that goes `A → B → A` within
one transaction announces nothing at all. An operation you open no transaction around is a transaction of its own,
so a single write announces exactly one change, as it always has.

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

On a `Group` or a `List` the two values are the container's own serialized value after and before the change, so
the very first change of a member reports the value the container was constructed with as `oldValue`.

---

## Enabled events

### `EnabledChangingAction`

Fires **before** `field.enabled` changes. The return value becomes the new value of `enabled` — return `true` to prevent disabling, or `false` to prevent enabling.

```typescript
new EnabledChangingAction((field, supr, newValue, oldValue) => {
  // return true to prevent disabling, false to prevent enabling
  return supr(field, newValue, oldValue);
})
```

If the action returns `null` or `undefined`, `newValue` is used instead. The default end of the chain returns `null`, so plainly returning `supr(...)` means "no change to `newValue`". If the resulting value is not a boolean, the setter throws `Error('Enabled value must be boolean')`.

### `EnabledChangedAction`

Fires **after** `field.enabled` has been updated.

```typescript
new EnabledChangedAction((field, supr, newValue, oldValue) => {
  console.log('enabled is now', newValue);
  return supr(field, newValue, oldValue);
})
```

---

## Visibility events

### `VisibilityChangingAction`

Fires **before** `field.visibility` changes. Return value replaces `newValue`.

```typescript
new VisibilityChangingAction((field, supr, newValue, oldValue) => {
  return supr(field, newValue, oldValue);
})
```

If the action returns `null` or `undefined`, `newValue` is used instead. A numeric result that is not one of the `DisplayMode` constants makes the setter throw `Error('visibility must be a DisplayMode constant')`. Strings never throw — they go through `DisplayMode.fromString()`, which silently resolves an unknown string to `DisplayMode.FULL`.

### `VisibilityChangedAction`

Fires **after** `field.visibility` has been updated.

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

A `Group` and a `List` compose their validity from their members, so the action fires on the container whenever a
member's verdict flips it — including when no value changed, as with an asynchronous validator settling or a
`clearValidators()` that leaves a previously invalid member valid. Writing to `member.errors` from the outside
announces nothing on its own: the array is a plain property, and it is the member's `validate()` that recomputes
the verdict, fires the member's own `ValidChangedAction` and makes the container re-evaluate. The notification
climbs no further than the first ancestor whose own validity stays the same.

Verdicts are announced when the [transaction](/api/transactions) carrying the change commits, and after the value
changes of that same transaction: the deepest element first, so a container is heard from only once the member
that caused the change has spoken. One assignment to a container's `value` therefore produces at most one
notification on that container — the members are written first and the container evaluates afterwards, so it
announces the net transition and never the verdict of a half-applied value. The same holds for an assignment to a
single member, and for `validate(true)` on a container, which revalidates the members first and forms its own
verdict once over the finished set.

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

`triggerAction()` returns whatever the chain returns, or `null` when no action of that type is registered on the field. `Action.execute(params)` on the `Action` class triggers the same action and answers the same value, wrapped in a promise.

### The `Action` class

`Action` is a `Field` whose value is an `ActionValue` (`{ label?, icon? }`) — it represents a button or menu entry that runs an `ExecuteAction` chain.

```typescript
import { Action, ExecuteAction } from '@dynamicforms/vue-forms';

const save = new Action({ value: { label: 'Save', icon: 'save' } });

save.registerAction(new ExecuteAction(async (field, supr, params) => {
  await submitForm(params);
  return supr(field, params);
}));

await save.execute({ reason: 'toolbar' }); // save.busy is true until this settles
```

| Member | Description |
|--------|-------------|
| `new Action(params?)` | Creates a reactive `Action`. Same parameters as `new Field()` — a `Partial<IFieldConstructorParams<T>>` — applied in the same order: `validators` and `actions` are registered first, so one guarding `enabled` or `visibility` is in place for the assignment the same object makes, and each eager action runs once over the finished value |
| `label` | Reads `value.label`; writing it assigns a new value object carrying the new label |
| `icon` | Reads `value.icon`; writing it assigns a new value object carrying the new icon |
| `execute(params?)` | Triggers `ExecuteAction` on this action and answers what the chain returned, as a promise |
| `busy` | `true` from the call to `execute()` until the run it started settles |

`ActionValue` is the exported shape of the value: `{ label?: string; icon?: string }`. `Action<T extends
ActionValue = ActionValue>` accepts a wider value type, so a subclass value carrying extra members is inferred from
`params.value` the same way `Field`'s is.

An `Action`'s value is always a shaped object, never `undefined`: `new Action()` starts out as
`{ label: undefined, icon: undefined }`. A `params.value` whose `label` and `icon` are both `null`/absent counts as
empty and is replaced — by `params.originalValue` if you passed one, otherwise by that pair of `undefined`s.
`params.originalValue` is copied into a frozen `{ label, icon }` object; passing only `value` makes `originalValue`
that same value object, so `isChanged` starts out `false`.

`label` and `icon` write through the value setter, so each is an ordinary value change: `ValueChangedAction` fires,
`isChanged` answers over it, and a disabled action refuses the write. The value object the action holds is replaced
rather than written into, so an object you passed as `params.value` and kept a reference to no longer follows the
action once either setter has run. Writing the value the action already holds is not a change: it announces
nothing and leaves the value of every container above untouched. Assigning `undefined` clears the member out of
the value object rather than leaving a key holding `undefined`, so an action whose icon was never set reads as
unchanged after `action.icon = undefined`.

`execute()` is asynchronous. The chain is entered synchronously — a handler has already run by the time `execute()`
returns — and the promise settles with what the chain produced, awaiting it where the handler returned a promise of
its own. `busy` stands for that whole span, on the action rather than in its value, and is cleared whether the run
resolves or rejects; overlapping runs are counted, so it stands until the last of them settles.

::: warning
A handler that throws rejects the promise instead of throwing out of the `execute()` call, so a caller that
neither awaits the answer nor attaches a `.catch()` leaves the rejection unhandled — which under node's default
settings ends the process. A template handler such as `@click="save.execute()"` is safe: Vue attaches its own
catch to the promise an event handler returns and routes the error to `app.config.errorHandler`.
:::

```vue
<button :disabled="!save.enabled || save.busy" @click="save.execute()">{{ save.label }}</button>
```

### `NullableAction`

Type alias for `Action | null`.

---

## List events

### `ListItemAddedAction`

Fires on a `List` when an item is inserted via `push()` or `insert()`.

```typescript
new ListItemAddedAction((field, supr, item, index) => {
  console.log('item added at', index, item);
  return supr(field, item, index);
})
```

`index` is the position `item` occupies in the list, which is also what `insert()` returns. A negative index handed
to `insert()` is resolved the way `Array.prototype.splice` resolves it and announced resolved, so it is never
negative here. `insert()` past the end of the list pads it first, and each padding item is announced with its own
index before the final trigger for the inserted item.

Additions and removals state operations rather than states, so they have no net over a
[transaction](/api/transactions) and are never compared away: every one of them is announced, in the order the
operations happened, before the value change they add up to. A handler reading `list.value` therefore sees the set
the transaction finished on, not the one that stood when its own item was added.

### `ListItemRemovedAction`

Fires on a `List` when an item is removed via `pop()` or `remove()`.

```typescript
new ListItemRemovedAction((field, supr, item, index) => {
  console.log('item removed from', index, item);
  return supr(field, item, index);
})
```

`item` is a clone of the removed group (without `parent`), not the original instance: `remove()` clones the element before triggering the action and returns that same clone to the caller. `pop()` delegates to `remove()`, so it behaves identically.

---

## Conditional actions

Conditional actions automatically toggle a field property when a `Statement` evaluates to a different boolean.

Conditional actions are eager: `registerAction()` evaluates the statement immediately and sets the field property right away. A conditional action handed to a constructor through `params.actions` does the same once the element is built, over its finished value. After that, the executor only runs when the result of the statement changes (`true` → `false` or `false` → `true`), not on every value change. The executor is applied to the fields the action is bound to, not to the fields appearing in the statement.

### `Statement`

A logical or comparison expression built from fields, constants, and an `Operator`.

```typescript
import { Statement, Operator } from '@dynamicforms/vue-forms';

const stmt = new Statement(activeField, Operator.EQUALS, true);
// Nested statements
const combined = new Statement(stmt, Operator.AND, new Statement(ageField, Operator.GE, 18));
```

`evaluate(): boolean` always hands back a real boolean: the logical operators coerce their operands, so
`new Statement(0, Operator.AND, true).evaluate()` is `false` and not `0`, and a conditional executor therefore
always receives a boolean `currentResult`.

`EQUALS` / `NOT_EQUALS` compare with loose `==`, so `'1'` and `1` are equal, and so are `null` and `undefined`.

Each operand has the exported type `OperandType` — a nested `Statement`, a `FieldBase` whose current `value` is
compared, or a literal of any type. Because the union includes `any`, the type checker accepts anything there; the
three cases are told apart at evaluation time by `instanceof`.

`Statement` itself is passive: it computes its value only when you call `evaluate()`. Reactivity comes from the conditional action you pass it to: its constructor uses `collectFields()` to gather every field appearing in the statement and registers a `ValueChangedAction` on each of them, so the statement is re-evaluated whenever any of those fields changes. This happens when you write `new ConditionalVisibilityAction(stmt)`, before the action is registered on any field.

`collectFields(): Set<FieldBase>` is public: it walks the statement and its nested statements and returns the field
instances themselves, which is useful when you want to attach your own handlers to the same set.

### `Operator`

Enum of supported operators:

| Group | Values |
|-------|--------|
| Logic | `NOT`, `OR`, `AND`, `XOR`, `NAND`, `NOR` |
| Comparison | `EQUALS`, `NOT_EQUALS`, `LT`, `LE`, `GE`, `GT` |
| Membership | `IN`, `NOT_IN` — evaluate `operand2.includes(operand1)` (array or string) and coerce its result to a boolean. `NOT_IN` is the negation of `IN`, so an `operand2` without a callable `includes` gives `IN` `false` and `NOT_IN` `true` |
| Substring | `INCLUDES`, `NOT_INCLUDES` — `operand1` contains the substring `operand2`; both operands must be strings, otherwise `INCLUDES` is `false` and `NOT_INCLUDES` `true` |

Use `Operator.fromString('and')` to parse a string at runtime. It is case insensitive and also accepts hyphen and space variants (`'not equals'`, `'not-in'`, `'not_includes'`); an unrecognised string throws an `Error`. Note that `DisplayMode.fromString` behaves differently — it silently returns `DisplayMode.FULL` for anything it does not recognise.

### `ConditionalVisibilityAction(statement)`

Sets `field.visibility` to `DisplayMode.FULL` when `statement` is `true`, `DisplayMode.SUPPRESS` when `false`.

```typescript
import { ConditionalVisibilityAction, Statement, Operator } from '@dynamicforms/vue-forms';

targetField.registerAction(new ConditionalVisibilityAction(
  new Statement(showField, Operator.EQUALS, true)
));
```

### `ConditionalEnabledAction(statement)`

Sets `field.enabled` to `true` when `statement` is `true`, `false` otherwise.

### `ConditionalValueAction(statement, trueValue)`

Sets `field.value = trueValue` when `statement` transitions to `true`. Does nothing on `false`.

The value is set only on the transition from `false`/`undefined` to `true`: if you later change the value manually, the action will not restore it until the statement goes back to `false` and becomes `true` again. On a disabled field (`enabled === false`) setting the value has no effect.

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

---

## Custom actions

For actions that are not conditional, derive from the exported `FieldActionBase`. Every action class must declare a static `classIdentifier` — it is the key under which `ActionsMap` stores the chain. Without it the base class throws `Error('classIdentifier must be declared')` on registration.

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

Deriving from `FieldActionBase` is the only way to write an action: `registerAction()` checks
`instanceof FieldActionBase` and rejects anything else with `Error('Invalid action type')`, so a hand-rolled object
with a matching `execute` method does not work.

Optional overrides:

| Member | Description |
|--------|-------------|
| `get eager()` | Return `true` to have the action executed immediately on `registerAction()`, and on every `ValueChangedAction` trigger and `validate(true)`. Defaults to `false` |
| `boundToField(field)` | Called when the action is registered on a field; use it to keep track of the fields the action serves |
| `unregister()` | Called by `clearValidators()` on each dropped action that is a `Validator`, once the operation that dropped it has finished. Override it to release listeners the validator installed on other fields — `CompareTo` does exactly that. A non-validator action is carried over to the new chain instead, so its `unregister()` never runs |

### `ActionsMap`

The chain container each field holds, keyed by `classIdentifier`. It is the type of `FieldBase`'s internal action
store and is exported so that type can be named; `registerAction()`, `triggerAction()` and `clearValidators()` on
the field are the supported way to drive it. Its own surface is `register()`, `trigger()`, `triggerEager()`,
`validators`, `clone()` and `cloneWithoutValidators()`.

`cloneWithoutValidators()` returns a copy carrying everything but the validators, and does nothing else: calling
`unregister()` on the validators it left out is the caller's to do, and `validators` lists them. `clearValidators()`
on a field does both, and releases them only once the operation it ran in has finished — a rollback puts the map
back with its validators still live.

---

## `DisplayMode`

Used by visibility properties.

| Constant | Value | Meaning |
|----------|-------|---------|
| `DisplayMode.FULL` | `10` | Render normally (default) |
| `DisplayMode.INVISIBLE` | `8` | Render but hide with `display: none` |
| `DisplayMode.HIDDEN` | `5` | Render as `<input type="hidden">` |
| `DisplayMode.SUPPRESS` | `1` | Do not render at all |

```typescript
import { DisplayMode } from '@dynamicforms/vue-forms';

field.visibility = DisplayMode.HIDDEN;
DisplayMode.fromString('suppress'); // → DisplayMode.SUPPRESS
DisplayMode.fromString('nonsense'); // → DisplayMode.FULL
```

`DisplayMode.fromString` never throws: anything it does not recognise silently becomes `DisplayMode.FULL`. This differs from `Operator.fromString`, which throws on an unrecognised string.

---

> See also: [Conditional statements example](/examples/conditional-statement), [Field API](/api/field)
