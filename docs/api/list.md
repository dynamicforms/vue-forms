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

`params` is an `IFieldParams<ListValue, X>` — the same parameter type every form element takes, with the list's
value shape substituted. A list takes [extended properties](/api/field#extended-properties) like every other
element: declare them as the second type argument, `new List<Fields, Presentation>(template, { label: … })`, and
read them back through `list.extra`. Every row the item template builds is a binding of it, so the template's
members carry theirs into each row. `length` and `items` are members `List` declares itself and are read-only,
so a parameter of either name throws a `TypeError` the way `valid` and `busy` do — name a presentation property
of that meaning something else.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `itemTemplate` | `Group<T>` | `undefined` | Template bound to each new item's data. If omitted, `Group.createFromFormData` is used for plain objects. |
| `params.value` | `ListValue` (`Record<string, any>[] \| null`) | `null` | Initial array of item values |
| `params.originalValue` | `ListValue` | same as `value` (`null` when empty) | Baseline for `isChanged` |
| `params.enabled` | `boolean` | `true` | Rendering/serialization hint. Unlike `Field`, a disabled `List` still accepts value assignment and all mutations; `enabled` only causes a parent `Group` to omit the list from its value |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.touched` | `boolean` | `false` | Accepted, but without effect: `touched` is delegated to the items, and the parameters are applied before `params.value` creates them. Assign `list.touched` after construction instead |
| `params.errors` | `ValidationError[]` | `[]` | Initial list-level validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | List-level validators |
| `params.actions` | `FieldActionBase[]` | `[]` | List-level actions |

`validators` and `actions` are registered before the remaining parameters are applied, and registration fires
nothing, so an `EnabledChangingAction` or `VisibilityChangingAction` passed here already guards the `enabled` and
`visibility` the same object carries, and every eager action among them runs exactly once, over the finished list.
`Field`, `Action` and `Group` do the same — see [Field](/api/field) for the full description.

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | `ListValue` | yes | Array of item values — every item is included regardless of its own `enabled` flag; each item's own value follows the `Group` serialization rule. Reads back `null` when the list has no items. Getter and setter share the type, so `list.value = null` — the write `group.value = null` makes into a nested list — type-checks, and it releases every row; `clear()` empties a list the same way. Any other non-array value leaves the rows untouched |
| `originalValue` | `ListValue` | yes | Value at creation time. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the list itself and all items are valid |
| `validating` | `boolean` | no | `true` while an asynchronous validation is in flight on the list itself or in any row. The list keeps a tally of the rows that answer `true`, so the read costs nothing however many rows it holds |
| `busy` | `boolean` | no | `true` while an `Action.execute()` in a row has yet to settle. A validation running in a row is answered by `validating`, not by this, so a submit gate reads both, or awaits [`settled()`](/api/field#settled-promise-void) |
| `errors` | `ValidationError[]` | yes | List-level validation errors. Writable, but normally managed by validators |
| `enabled` | `boolean` | yes | Rendering/serialization hint. Unlike `Field`, a disabled `List` still accepts value assignment and all mutations; `enabled` only causes a parent `Group` to omit the list from its value |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint |
| `touched` | `boolean` | yes | `true` when any item has been touched; setting propagates to all items |
| `length` | `number` | no | The number of rows the list holds. Nothing is built to count them |
| `items` | `readonly Group<T>[]` | no | The rows themselves — see [The rows](#the-rows) |
| `fullValue` | `FieldsToFullValues<T>[]` | no | Every row, each built from all of its fields. Where `value` states what the list serializes — rows composed of the enabled fields, and `null` where the list is empty — this states what the list holds: the disabled fields are in it too, and an empty list reads back as `[]` |

`ListValue` is exported as `Record<string, any>[] | null`.

Every mutation — `push()`, `insert()`, `remove()`, `pop()`, `clear()` and assigning `value` — is tracked by Vue, so
a `v-for` over `list.items` or `list.value` re-renders on its own without any additional wiring.

## The rows

`items` hands out the rows in the order the list holds them, and `length` says how many there are. Both reads are
tracked, so a template rendering off either re-renders as rows come and go:

```vue
<div v-for="(row, index) in lineItems.items" :key="index">
  <input v-model="row.fields.description.value" />
  <button @click="lineItems.remove(index)">Remove</button>
</div>
<p>{{ lineItems.length }} lines</p>
```

The array `items` answers with is a frozen copy: it states which rows the list held at the read, nothing writes
back through it — `push()`, `insert()`, `remove()`, `pop()`, `clear()` and assigning `value` are what change the
set — and a caller may hold on to it. The rows in it are the live elements, so reading one reports what it holds
now.

The copy is built once per change of the set and handed to every reader until the next one: a write inside a row
changes what the list serializes without changing which rows it holds, and the array a reader took stays the very
same one across such a write. `get(index)` reaches a single row without building anything at all.

## Scale

A `List` is meant to hold thousands of rows, and what an operation costs depends on what it touches rather than on
how long the list is:

| operation | cost |
|---|---|
| reading `length`, or `items` again with the set of rows unchanged | constant |
| reading `value` or `valid` again with nothing changed in between | constant — both are cached |
| writing one field of one row | that row, plus the depth of the nesting it sits in |
| `push()`, `insert()`, `remove()`, `pop()` | one row |
| reading `value` after a change | one array of the current length, plus a rebuild of the rows that changed |
| assigning `value`, or `validate(true)` | the whole list — both are statements about every row |

The caches are invalidated by the write itself, so nothing has to be refreshed by hand. `value` is rebuilt on the
first read after a change and reused until the next one, which means two consecutive reads return the same object.
That object is frozen, rows included: writing into it throws in strict mode and is silently dropped outside it, so
assign a new value instead. `originalValue` is a copy of its own and is not frozen.

An assignment reuses the row objects it already has, position by position, so `list.get(0)` survives
`list.value = rows` when the new array is the same length. A keyed `v-for` over the rows therefore does not remount
them on every assignment. A reused row is reset to the state the row built for that position would have been in:
a member the new item carries no key for takes the item template's value, and `originalValue`, `isChanged`,
`touched` and `errors` all start over. The new set is built beside the one in place and installed whole, so a
validator that reads `list.value` while the assignment runs never sees a position that has yet to be filled.

## Methods

### `get(index): Group<T> | undefined`

Returns the `Group` instance at `index`, or `undefined` if out of range.

### `push(item): number`

Appends an item to the end of the list. `item` may be a plain object or an existing `Group`. Returns the new length of the list. Triggers `ListItemAddedAction` with the index the item was appended at.

```typescript
list.push({ name: 'Charlie', score: 70 });
```

### `pop(): Group<T> | undefined`

Removes the last item and returns it (`undefined` if the list is empty). Triggers `ListItemRemovedAction`.

### `insert(item, index): number`

Inserts `item` at `index` and returns the position it ends up at. A negative `index` counts back from the end and
stops at the front, exactly the way `Array.prototype.splice` reads it: on a three-item list `-1` inserts before the
last item and returns `2`, and `-100` inserts at the front and returns `0`. A non-negative `index` is the position
itself, so the return value is the number you passed. If `index` is beyond the current length, the gap is filled
with bindings of the item template — these carry the template's own values, not empty ones. (Without an item template
the padding items are genuinely empty, since they go through `Group.createFromFormData(null)`.)

`ListItemAddedAction` fires once per item that ends up in the list: once for each padding item, each with the index
that item occupies, and finally for `item` at the position it occupies — the same number `insert()` returns, so a
negative `index` is reported resolved there too.

### `remove(index): Group<T> | undefined`

Removes the item at `index` and returns it — the row instance itself, the one `list.get(index)` answered with
before the call, and the one `ListItemRemovedAction` is given. Triggers `ListItemRemovedAction`.

The row is released as it leaves: it loses its `parent`, stops counting towards the list's validity, and can be
pushed into another list — or back into this one. Everything it holds stands, so a row edited before it was
removed answers `isChanged` with `true`, keeps the errors its validators reached, and reports its `originalValue`
as the data it was bound to.

### `clear()`

Removes all items and triggers a value-changed notification. Every row is released, exactly as `remove()` releases
the one it takes out.

### `registerAction(action): this`

Registers an action on the list. Returns `this`. `registerActionBefore(action, before)` and
`unregisterAction(action)` place and drop one; see
[`Field`](/api/field#registeractionbefore-action-before-this).

### `validate(revalidate?): void`

Validates the list. Pass `revalidate: true` to cascade to all items. The items are revalidated first and the list
forms its own verdict afterwards, over the finished set, so it announces one net transition of its own validity at
most — an item turning valid while a later one is still to be checked produces no notification on the list.

### `notifyValueChanged(): void`

Records that a row changed its value, so that the [transaction](/api/transactions) in progress works out at commit
what this list's own value became, fires `ValueChangedAction` where it differs from the value last announced, and
re-forms the verdict. The mutation methods call it themselves; you rarely need to.

### `bind(data?, overrides?): List<T>`

Returns a new `List` over `data`, carrying a binding of the item template, the actions and the extended
properties. `overrides` is an [`IBindParams<ListValue, X>`](/api/field#ibindparams-t-x): `originalValue`,
`enabled`, `visibility` and the extended properties, which are written over the ones carried from the source.
Binding an empty list gives an empty list.

The new list is constructed through `this.constructor`, so a subclass of `List` binds into its own class. A
subclass whose constructor does not take `(itemTemplate, params)` never sees the template it is handed and would
answer with a list carrying the declaration's rows; `bind()` refuses that with a `TypeError` rather than returning
it, and such a subclass overrides `bind()` and constructs itself.

`originalValue` is read by key presence and the data by being anything other than `undefined`, on `List`, `Group`
and `Field` alike: an explicit `null` is data the caller supplied, so `bind(null)` gives an empty list, while an
`undefined` `data` counts as none supplied and the new list carries the current items.

### `rebind(data): this`

Exchanges the rows this list holds for `data`, in place: the same list instance, the row standing at a position
reused the way a whole-value assignment reuses it, and the change history started over. No `ValueChangedAction`
fires for the list itself. See [`rebind()`](/api/field#rebind-data-this) for the whole of it.

## `NullableList`

Type alias for `List | null`.

---

> See also: [The model](/guide/model#how-a-list-builds-rows) for how a row is built and what a record is,
> [Actions reference](/api/actions) for `ListItemAddedAction` and `ListItemRemovedAction`
