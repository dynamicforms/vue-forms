# List

`List<T>` manages a dynamic array of `Group<T>` items. It supports adding, removing, and replacing items while triggering the same action/validation system as `Field` and `Group`.

## Creating a list

```typescript
import { Field, Group, List } from '@dynamicforms/vue-forms';

// Define the item template
const itemTemplate = new Group({
  name:  new Field({ value: '' }),
  score: new Field<number>({ value: 0 }),
});

// Empty list
const list = new List(itemTemplate);

// Pre-populated list
const list2 = new List(itemTemplate, {
  value: [
    { name: 'Alice', score: 95 },
    { name: 'Bob',   score: 80 },
  ],
});
```

## `new List(itemTemplate?, params?)`

`params` is a `Partial<IFieldConstructorParams<ListValue>>` — the same parameter type every form element takes,
with the list's value shape substituted.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `itemTemplate` | `Group<T>` | `undefined` | Template cloned for each new item. If omitted, `Group.createFromFormData` is used for plain objects. |
| `params.value` | `ListValue` (`Record<string, any>[] \| null`) | `null` | Initial array of item values |
| `params.originalValue` | `ListValue` | same as `value` (`null` when empty) | Baseline for `isChanged` |
| `params.enabled` | `boolean` | `true` | Rendering/serialization hint. Unlike `Field`, a disabled `List` still accepts value assignment and all mutations; `enabled` only causes a parent `Group` to omit the list from its value |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.touched` | `boolean` | `false` | Accepted, but without effect: `touched` is delegated to the items, and the parameters are applied before `params.value` creates them. Assign `list.touched` after construction instead |
| `params.errors` | `ValidationError[]` | `[]` | Initial list-level validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | List-level validators |
| `params.actions` | `FieldActionBase[]` | `[]` | List-level actions |

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | reads `ListValue`, accepts `Record<string, any>[]` | yes | Array of item values — every item is included regardless of its own `enabled` flag; each item's own value follows the `Group` serialization rule. Reads back `null` when the list has no items; the setter only accepts an array, so use `clear()` to empty the list |
| `originalValue` | `ListValue` | yes | Value at creation time. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the list itself and all items are valid |
| `validating` | `boolean` | no | `true` while an async validator registered on the list itself is pending; it does not aggregate items |
| `errors` | `ValidationError[]` | yes | List-level validation errors. Writable, but normally managed by validators |
| `enabled` | `boolean` | yes | Rendering/serialization hint. Unlike `Field`, a disabled `List` still accepts value assignment and all mutations; `enabled` only causes a parent `Group` to omit the list from its value |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint |
| `touched` | `boolean` | yes | `true` when any item has been touched; setting propagates to all items |
| `fullValue` | `ListValue` | no | Same as `value` — `List` does not override it, so disabled fields inside items are still omitted. Consequently a parent `Group.fullValue` does not recover hidden values through a nested `List` either |

`ListValue` is exported as `Record<string, any>[] | null`.

Every mutation — `push()`, `insert()`, `remove()`, `pop()`, `clear()` and assigning `value` — is tracked by Vue, so
a `v-for` over `list.value` re-renders on its own without any additional wiring.

## Methods

### `get(index): Group<T> | undefined`

Returns the `Group` instance at `index`, or `undefined` if out of range.

`List` has no `length` property — use `list.value?.length ?? 0` to get the item count.

### `push(item): number`

Appends an item to the end of the list. `item` may be a plain object or an existing `Group`. Returns the new length of the list. Triggers `ListItemAddedAction`.

```typescript
list.push({ name: 'Charlie', score: 70 });
```

### `pop(): Group<T> | undefined`

Removes the last item and returns a detached clone of it (`undefined` if the list is empty). Triggers `ListItemRemovedAction`.

### `insert(item, index): number`

Inserts `item` at `index`. If `index` is beyond the current length, the gap is filled with clones of the item template — these carry the template's own values, not empty ones. (Without an item template the padding items are genuinely empty, since they go through `Group.createFromFormData(null)`.) Returns the actual insertion index. Triggers `ListItemAddedAction`.

### `remove(index): Group<T> | undefined`

Removes the item at `index` and returns a detached clone of it. Triggers `ListItemRemovedAction`.

### `clear()`

Removes all items and triggers a value-changed notification.

### `registerAction(action): this`

Registers an action on the list. Returns `this`.

### `validate(revalidate?): void`

Validates the list. Pass `revalidate: true` to cascade to all items.

### `notifyValueChanged(): void`

Recomputes `value`, and if it differs from the previously seen one fires `ValueChangedAction`, notifies the parent
and revalidates. The mutation methods call it themselves; you rarely need to.

### `clone(overrides?): List<T>`

Returns a new `List` with a cloned item template, values and actions. `overrides` is a
`Partial<IFieldConstructorParams<ListValue>>`; of its keys, only `value`, `originalValue`, `enabled` and
`visibility` are read. Cloning an empty list gives an empty list.

## `NullableList`

Type alias for `List | null`.

---

> See also: [Actions reference](/api/actions) for `ListItemAddedAction` and `ListItemRemovedAction`
