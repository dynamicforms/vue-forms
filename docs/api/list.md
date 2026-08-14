# List

`List<T>` manages a dynamic array of `Group<T>` items. It supports adding, removing, and replacing items while triggering the same action/validation system as `Field` and `Group`.

## Creating a list

```typescript
import { Field, Group, List } from '@dynamicforms/vue-forms';

// Define the item template
const itemTemplate = new Group({
  name:  Field.create({ value: '' }),
  score: Field.create<number>({ value: 0 }),
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

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `itemTemplate` | `Group<T>` | `undefined` | Template cloned for each new item. If omitted, `Group.createFromFormData` is used for plain objects. |
| `params.value` | `Record<string, any>[]` | `null` | Initial array of item values |
| `params.originalValue` | `Record<string, any>[]` | same as `value` (`null` when empty) | Baseline for `isChanged` |
| `params.enabled` | `boolean` | `true` | Rendering/serialization hint. Unlike `Field`, a disabled `List` still accepts value assignment and all mutations; `enabled` only causes a parent `Group` to omit the list from its value |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.validators` | `IFieldAction[]` | `[]` | List-level validators |
| `params.actions` | `IFieldAction[]` | `[]` | List-level actions |

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | `Record<string, any>[] \| null` | yes | Array of item values — every item is included regardless of its own `enabled` flag; each item's own value follows the `Group` serialization rule. `null` when the list has no items |
| `reactiveValue` | `ComputedRef<...>` | no | Vue computed ref of `value` |
| `originalValue` | `Record<string, any>[] \| null` | yes | Value at creation time. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the list itself and all items are valid |
| `validating` | `boolean` | no | `true` while an async validator registered on the list itself is pending; it does not aggregate items |
| `errors` | `ValidationError[]` | yes | List-level validation errors. Writable, but normally managed by validators |
| `enabled` | `boolean` | yes | Rendering/serialization hint. Unlike `Field`, a disabled `List` still accepts value assignment and all mutations; `enabled` only causes a parent `Group` to omit the list from its value |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint |
| `touched` | `boolean` | yes | `true` when any item has been touched; setting propagates to all items |
| `fullValue` | `Record<string, any>[] \| null` | no | Same as `value` — `List` does not override it, so disabled fields inside items are still omitted. Consequently a parent `Group.fullValue` does not recover hidden values through a nested `List` either |

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

### `clone(overrides?): List<T>`

Returns a new `List` with a cloned item template, values and actions.

::: warning
Cloning an empty list throws a `TypeError`: `value` is `null` when the list has no items and `clone` spreads it. Passing `clone({ value: [] })` avoids it.

Because cloning is also how items are produced, the same `TypeError` surfaces without any explicit `clone()` call whenever an empty `List` sits inside something that gets cloned: `Group.clone()` on a group containing an empty list (it does not forward overrides to children, so there is no workaround there), and `push()`, `insert()` or construction with a `value` on a list whose item template contains an empty `List`.
:::

## `NullableList`

Type alias for `List | null`.

---

> See also: [Actions reference](/api/actions) for `ListItemAddedAction` and `ListItemRemovedAction`
