# Actions

Actions are event handlers attached to fields, groups, or lists via `registerAction()`. They form a chain: each handler receives a `supr` function to call the next handler in the chain.

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

Fires **before** `field.enabled` changes. The return value replaces `newValue`, letting you veto or alter the change.

```typescript
new EnabledChangingAction((field, supr, newValue, oldValue) => {
  // return false to prevent disabling
  return supr(field, newValue, oldValue);
})
```

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

---

## Conditional actions

Conditional actions automatically toggle a field property when a `Statement` evaluates to a different boolean.

### `Statement`

A logical or comparison expression built from fields, constants, and an `Operator`.

```typescript
import { Statement, Operator } from '@dynamicforms/vue-forms';

const stmt = new Statement(activeField, Operator.EQUALS, true);
// Nested statements
const combined = new Statement(stmt, Operator.AND, new Statement(ageField, Operator.GE, 18));
```

`Statement` watches all referenced fields and re-evaluates when any of them changes.

### `Operator`

Enum of supported operators:

| Group | Values |
|-------|--------|
| Logic | `NOT`, `OR`, `AND`, `XOR`, `NAND`, `NOR` |
| Comparison | `EQUALS`, `NOT_EQUALS`, `LT`, `LE`, `GE`, `GT` |
| Membership | `IN`, `NOT_IN`, `INCLUDES`, `NOT_INCLUDES` |

Use `Operator.fromString('and')` to parse a string at runtime.

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
```

---

> See also: [Conditional statements example](/examples/conditional-statement), [Field API](/api/field)
