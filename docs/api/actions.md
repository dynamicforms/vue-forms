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

### `AbortEventHandlingException`

Throwing `AbortEventHandlingException` from a handler aborts the rest of the chain. `ActionsMap` catches it, so it never escapes the setter and `triggerAction()` returns `null` for that trigger. All other exceptions propagate to the caller.

```typescript
import { AbortEventHandlingException, ValueChangedAction } from '@dynamicforms/vue-forms';

field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  if (newValue == null) throw new AbortEventHandlingException();
  return supr(field, newValue, oldValue);
}));
```

Note that `ValueChangedAction` fires *after* the new value has already been stored, so aborting stops further event handling — it does not roll the change back.

## Value events

### `ValueChangedAction`

Fires when `field.value` changes (after the new value is set). Also fires on `Group` and `List` when any descendant changes.

```typescript
new ValueChangedAction((field, supr, newValue, oldValue) => {
  // handle the change
  return supr(field, newValue, oldValue);
})
```

| Callback param | Type | Description |
|----------------|------|-------------|
| `field` | `IField` | The field that changed |
| `supr` | function | Next handler in the chain |
| `newValue` | `T` | The new value |
| `oldValue` | `T` | The previous value |

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

`triggerAction()` returns whatever the chain returns, or `null` when no action of that type is registered on the field. `Action.execute(params)` on the `Action` class triggers the same action, but discards the result — use `triggerAction(ExecuteAction, params)` when you need the returned value.

### The `Action` class

`Action` is a `Field` whose value is an `ActionValue` (`{ label?, icon? }`) — it represents a button or menu entry that runs an `ExecuteAction` chain. Like every field, it is created through the static factory; calling the constructor directly throws a `TypeError`.

```typescript
import { Action, ExecuteAction } from '@dynamicforms/vue-forms';

const save = Action.create({ value: { label: 'Save', icon: 'save' } });

save.registerAction(new ExecuteAction((field, supr, params) => {
  submitForm(params);
  return supr(field, params);
}));

save.execute({ reason: 'toolbar' }); // triggers ExecuteAction, returns undefined
```

| Member | Description |
|--------|-------------|
| `Action.create(params?)` | Creates a reactive `Action`. Same parameters as `Field.create()` |
| `label` | Getter/setter for `value.label` |
| `icon` | Getter/setter for `value.icon` |
| `execute(params)` | Triggers `ExecuteAction` on this action; returns `undefined` |

::: warning
Setting `label` or `icon` mutates the existing value object in place, so it does **not** fire `ValueChangedAction`.
:::

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

Conditional actions are eager: `registerAction()` evaluates the statement immediately and sets the field property right away. After that, the executor only runs when the result of the statement changes (`true` → `false` or `false` → `true`), not on every value change. The executor is applied to the fields the action is bound to, not to the fields appearing in the statement.

### `Statement`

A logical or comparison expression built from fields, constants, and an `Operator`.

```typescript
import { Statement, Operator } from '@dynamicforms/vue-forms';

const stmt = new Statement(activeField, Operator.EQUALS, true);
// Nested statements
const combined = new Statement(stmt, Operator.AND, new Statement(ageField, Operator.GE, 18));
```

`EQUALS` / `NOT_EQUALS` compare with loose `==`, so `'1'` and `1` are equal, and so are `null` and `undefined`.

`Statement` itself is passive: it computes its value only when you call `evaluate()`. Reactivity comes from the conditional action you pass it to: its constructor uses `collectFields()` to gather every field appearing in the statement and registers a `ValueChangedAction` on each of them, so the statement is re-evaluated whenever any of those fields changes. This happens when you write `new ConditionalVisibilityAction(stmt)`, before the action is registered on any field.

### `Operator`

Enum of supported operators:

| Group | Values |
|-------|--------|
| Logic | `NOT`, `OR`, `AND`, `XOR`, `NAND`, `NOR` |
| Comparison | `EQUALS`, `NOT_EQUALS`, `LT`, `LE`, `GE`, `GT` |
| Membership | `IN`, `NOT_IN` — evaluate `operand2.includes(operand1)` (array or string); `false` if `operand2` has no `includes` |
| Substring | `INCLUDES`, `NOT_INCLUDES` — `operand1` contains the substring `operand2`; both operands must be strings, otherwise `INCLUDES` is `false` |

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
| `field` | `IField` | The field this action is registered on |
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

Optional overrides:

| Member | Description |
|--------|-------------|
| `get eager()` | Return `true` to have the action executed immediately on `registerAction()`. Defaults to `false` |
| `boundToField(field)` | Called when the action is registered on a field; use it to keep track of the fields the action serves |

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
