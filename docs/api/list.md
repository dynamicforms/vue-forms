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
| `params.value` | `Record<string, any>[]` | `[]` | Initial array of item values |
| `params.originalValue` | `Record<string, any>[]` | same as `value` | Baseline for `isChanged` |
| `params.enabled` | `boolean` | `true` | Whether the list accepts mutations |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.validators` | `IFieldAction[]` | `[]` | List-level validators |
| `params.actions` | `IFieldAction[]` | `[]` | List-level actions |

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | `Record<string, any>[] \| null` | yes | Serialized array of enabled item values; `null` when empty |
| `reactiveValue` | `ComputedRef<...>` | no | Vue computed ref of `value` |
| `originalValue` | `Record<string, any>[] \| null` | no | Value at creation time |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the list itself and all items are valid |
| `validating` | `boolean` | no | `true` while any item has a pending async validator |
| `errors` | `ValidationError[]` | no | List-level validation errors |
| `enabled` | `boolean` | yes | Rendering/serialization hint |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint |
| `touched` | `boolean` | yes | `true` when any item has been touched; setting propagates to all items |

## Methods

### `get(index): Group<T> | undefined`

Returns the `Group` instance at `index`, or `undefined` if out of range.

### `push(item): number`

Appends an item to the end of the list. `item` may be a plain object or an existing `Group`. Returns the new length of the list. Triggers `ListItemAddedAction`.

```typescript
list.push({ name: 'Charlie', score: 70 });
```

### `pop(): Group<T> | undefined`

Removes and returns the last item. Triggers `ListItemRemovedAction`.

### `insert(item, index): number`

Inserts `item` at `index`. If `index` is beyond the current length, fills with empty items first. Returns the actual insertion index. Triggers `ListItemAddedAction`.

### `remove(index): Group<T> | undefined`

Removes the item at `index` and returns a detached clone of it. Triggers `ListItemRemovedAction`.

### `clear()`

Removes all items and triggers a value-changed notification.

### `registerAction(action): this`

Registers an action on the list. Returns `this`.

### `validate(revalidate?): void`

Validates the list. Pass `revalidate: true` to cascade to all items.

### `clone(overrides?): List<T>`

Returns a new `List` with a cloned item template and actions.

---

> See also: [Actions reference](/api/actions) for `ListItemAddedAction` and `ListItemRemovedAction`
