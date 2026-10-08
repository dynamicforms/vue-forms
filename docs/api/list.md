# List

`List<R>` manages a dynamic array of rows of type `R`. A row is any form element: a `Group` for a list of records,
a `Field` for a list of plain values, another `List` for a list of lists. The list supports adding, removing and
replacing rows, and uses the same action and validation system as `Field` and `Group`.

## Creating a list

```typescript
import { Field, Group, List, Validators } from '@dynamicforms/vue-forms';

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

// A list of plain values: every row is a Field, and the value is an array of strings
const tags = new List(new Field<string>({ validators: [new Validators.Required()] }), {
  value: ['urgent', 'billing'],
});
tags.push('refund');
tags.value; // ['urgent', 'billing', 'refund']
```

The type argument is the row type: `new List(itemTemplate)` infers it from the item template, so the two lists above are a
`List<Group<{ name: Field<string>; score: Field<number> }>>` and a `List<Field<string>>`. A list declared without
an item template is typed `List<Group>`; specify the row type where it holds something else:

```typescript
const names = new List<Field<string>>();
names.push('Ada');  // a Field row
names.value;        // ['Ada']
```

Without an item template every row is built from its own item: a plain object becomes a `Group` of fields, an
array a `List`, and anything else (a string, a number, `null`, a `Date`) a `Field` holding it.

## `new List(itemTemplate?, params?)`

`params` is an `IFieldParams<ListValueInput<R>, X>`: the parameter type every element takes, with the list's value
shape substituted. A list takes [extended properties](/api/field#extended-properties) like every other
element: augment [`Extras`](/api/field#extras) once and every list carries them, or declare them as the second
type argument for one list, `new List<Group<Fields>, Presentation>(template, { label: … })`. Both are read through
`list.extra`. Every row built from the item template is a binding of it, so the item template's members copy their
extended properties into each row. `length` and `items` are read-only members declared by `List`, so a parameter of
either name throws a `TypeError`, as `valid` and `busy` do. Give a presentation property with that meaning a
different name.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `itemTemplate` | `R` | `undefined` | Template bound to each new item's data: every row is `itemTemplate.bind(item)`. If omitted, every row is built from its own item: a `Group` from a plain object, a `List` from an array, a `Field` from anything else |
| `params.value` | `ListValueInput<R>` (`ListValue<R> \| null`) | `[]` | Initial array of item values. When absent, `originalValue` is used; an explicit `null` is not replaced and leaves the list empty. Anything that is neither an array nor `null` throws a `TypeError` |
| `params.originalValue` | `ListValueInput<R>` | same as `value` (`[]` when empty) | Baseline for `isChanged`, and the rows the list is built with where no `value` is supplied |
| `params.access` | [`Access`](/api/field#access) | `'editable'` | What the list sends to its own container, and the access applied to its rows through `effectiveAccess`. A list accepts value assignment and every mutation regardless of its access. See [What a container serializes](/api/container#what-a-container-serializes). |
| `params.visibility` | [`Visibility`](/api/field#visibility) | `'full'` | How a rendering layer shows the list. |
| `params.touched` | `boolean` | `false` | Accepted, but without effect: `touched` is delegated to the items, and the parameters are applied before `params.value` creates them. Assign `list.touched` after construction instead |
| `params.errors` | `ValidationError[]` | `[]` | Initial list-level validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | List-level validators |
| `params.actions` | `FieldActionBase[]` | `[]` | List-level actions |

`validators` and `actions` are registered before the remaining parameters are applied, and registration fires no
action. An `AccessChangingAction` or `VisibilityChangingAction` passed here therefore already applies to the
`access` and `visibility` in the same object, and every eager action among them runs exactly once, over the
finished list. `Field`, `Action` and `Group` behave the same way; see [Field](/api/field) for the full description.

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | reads `ListValue<R>`, accepts `ListValueInput<R>` | yes | Array of row values, by the rule a `Group` applies to its members: an `'editable'` or `'readonly'` row sends its own `value`, a `'disabled-null'` row is sent as `null`, and a `'disabled'` row is left out. Reads `[]` when the list has no rows; the list's value is never `null`. The setter also accepts `null` (which `group.value = null` writes into a nested list) and releases every row; `clear()` empties a list the same way. A value that is neither an array nor `null` throws `TypeError('Invalid value provided: a list takes an array of rows, or null to empty it')` and leaves the rows unchanged; because the setter is typed, such a value can only come from JavaScript or through an `as any` |
| `originalValue` | `ListValue<R>` | yes | Value at creation time. Writable; assigning it resets the baseline of `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the list itself and every row it counts are valid. A `'disabled'` row sends nothing and is not counted, whatever errors it carries |
| `validating` | `boolean` | no | `true` while an asynchronous validation is pending on the list itself or in any row. The list keeps a count of the rows whose `validating` is `true`, so the read is constant-time regardless of the number of rows |
| `busy` | `boolean` | no | `true` while an `Action.execute()` in a row is pending. Pending validation in a row is reported by `validating`, not `busy`, so a submit gate reads both, or awaits [`settled()`](/api/field#settled-promise-void) |
| `errors` | `ValidationError[]` | yes | List-level validation errors. Writable, but normally managed by validators |
| `access` | [`Access`](/api/field#access) | yes | What the list sends to its container and whether it is validated (`'disabled'` leaves it out and `'disabled-null'` sends `null` regardless of what it holds), and, through `effectiveAccess`, what every element inside it sends: below a `'disabled'` or `'disabled-null'` list nothing is sent or validated, and below a `'readonly'` one nothing accepts input. Each row keeps the access it was given. See [What a container serializes](/api/container#what-a-container-serializes). |
| `effectiveAccess` | [`Access`](/api/field#access) | no | The access that applies after the containers above are taken into account; see [`effectiveAccess`](/api/field#properties) |
| `enabled` | `boolean` | no | `true` where `access` is `'editable'` |
| `effectiveEnabled` | `boolean` | no | `true` where `effectiveAccess` is `'editable'`. A rendering layer reads it to draw the inputs of a whole section as not accepting input |
| `visibility` | [`Visibility`](/api/field#visibility) | yes | How a rendering layer shows the list. It does not affect what the list sends or whether it is validated |
| `touched` | `boolean` | yes | `true` when any item has been touched; setting propagates to all items |
| `length` | `number` | no | The number of rows the list holds. Reading it builds no array |
| `items` | `readonly R[]` | no | The rows themselves; see [The rows](#the-rows) |
| `fullValue` | `ListFullValue<R>` | no | The `fullValue` of every row, regardless of access. `value` is what the list sends; `fullValue` is what it holds, and a binding or a reset copies it |

`ListValue<R>` is exported as `(R['value'] | null)[]`, `ListValueInput<R>` as `ListValue<R> | null` and
`ListFullValue<R>` as `R['fullValue'][]`, each with `R` defaulting to `Group`.

Every mutation (`push()`, `insert()`, `remove()`, `pop()`, `clear()` and assigning `value`) is tracked by Vue, so
a `v-for` over `list.items` or `list.value` re-renders without additional wiring.

## The rows

`items` returns the rows in list order, and `length` is their number. Both reads are tracked, so a template
rendering either re-renders when rows are added or removed:

```vue
<div v-for="(row, index) in lineItems.items" :key="index">
  <input v-model="row.fields.description.value" />
  <button @click="lineItems.remove(index)">Remove</button>
</div>
<p>{{ lineItems.length }} lines</p>
```

The array `items` returns is a frozen copy of the rows the list held at the time of the read. Writes do not pass
through it; the set changes only through `push()`, `insert()`, `remove()`, `pop()`, `clear()` and assigning
`value`. A caller may keep the array. The rows in it are the live elements, so a row read from it returns its
current state.

The copy is built once per change of the set and returned to every reader until the next change. A write inside a
row changes what the list sends but not which rows it holds, so `items` returns the same array before and after
such a write. `get(index)` returns a single row without building an array.

## Scale

A `List` is designed to hold thousands of rows. The cost of an operation depends on what it touches, not on the
length of the list:

| operation | cost |
|---|---|
| reading `length`, or `items` again with the set of rows unchanged | constant |
| reading `value` or `valid` again with nothing changed in between | constant (both are cached) |
| writing one field of one row | that row, plus the depth of the nesting it sits in |
| `push()`, `insert()`, `remove()`, `pop()` | one row |
| reading `value` after a change | one array of the current length, plus a rebuild of the rows that changed |
| assigning `value`, or `validate(true)` | the whole list (both apply to every row) |

The caches are invalidated by the write itself, so no manual refresh is needed. `value` is rebuilt on the first
read after a change and reused until the next change, so two consecutive reads return the same object. That object
is frozen, rows included: writing into it throws in strict mode and is ignored otherwise, so assign a new value
instead. `originalValue` is a separate copy and is not frozen. The freeze covers only the objects the containers build. An array or object that a `Field` holds as its value is not frozen: writing into it changes the field's value without a `ValueChangedAction`, so assign a new array or object instead.

An assignment reuses the existing row objects, position by position, so `list.get(0)` returns the same instance
after `list.value = rows` when the new array has the same length. A keyed `v-for` over the rows therefore does not
remount them on every assignment. A reused row is reset to the state of a new row built for that position: a member
whose key is absent from the new item gets the item template's value, and `originalValue`, `isChanged`, `touched`
and `errors` are reset. The new set is built separately and installed as a whole, so a validator that reads
`list.value` during the assignment never sees an unfilled position.

## Methods

### `get(index): R | undefined`

Returns the row at `index`, or `undefined` if out of range.

### `push(item): number`

Appends an item to the end of the list. `item` is either the data a row is built from (bound to the item template, or built into an element by its type where the list has no item template) or an existing element, which becomes the row itself. Returns the new length of the list. Triggers `ListItemAddedAction` with the index the item was appended at.

```typescript
list.push({ name: 'Charlie', score: 70 });
```

### `pop(): R | undefined`

Removes the last item and returns it (`undefined` if the list is empty). Triggers `ListItemRemovedAction`.

### `insert(item, index): number`

Inserts `item` at `index` and returns its resulting position. A negative `index` counts back from the end and is
clamped at the front, as in `Array.prototype.splice`: on a three-item list `-1` inserts before the
last item and returns `2`, and `-100` inserts at the front and returns `0`. A non-negative `index` is the position
itself, so the return value equals the argument. If `index` is beyond the current length, the gap is filled with
bindings of the item template, which hold the item template's own values, not empty ones. Without an item template
the padding items are empty elements of the kind `item` is built into: empty groups for a plain object, empty lists
for an array, fields holding `undefined` for anything else.

`ListItemAddedAction` fires once per item added to the list: once for each padding item, with that item's index,
and finally for `item` at its position. That position is the value `insert()` returns, so a negative `index` is
reported resolved.

### `remove(index): R | undefined`

Removes the item at `index` and returns it: the row instance itself, which `list.get(index)` returned before the
call and which is passed to `ListItemRemovedAction`. Triggers `ListItemRemovedAction`.

The removed row is released: its `parent` is cleared, it no longer counts towards the list's validity, and it can
be pushed into another list or back into this one. It keeps its state: a row edited before removal has `isChanged`
`true`, keeps the errors its validators produced, and its `originalValue` is the data it was bound to.

### `clear()`

Removes all items and triggers a value-changed notification. Every row is released, exactly as `remove()` releases
the row it removes. It does not change the list's own `touched`, `errors` or `originalValue`; for a reset that
revalidates, see [Clearing and resetting](/guide/cookbook#clearing-and-resetting-a-form) and use `rebind(null)` instead.

### `registerAction(action): this`

Registers an action on the list. Returns `this`. `registerActionBefore(action, before)` registers
one before another and `unregisterAction(action)` removes one; see
[`Field`](/api/field#registeractionbefore-action-before-this).

### `validate(revalidate?): void`

Validates the list. Pass `revalidate: true` to revalidate all items as well. The items are revalidated first and
the list then computes its own validity over the result, so it announces at most one net transition of its own
validity. An item that becomes valid while a later item is still unchecked produces no notification on the list.

### `notifyValueChanged(): void`

Records that a row changed its value, so that the open [transaction](/api/transactions) computes at commit this
list's new value, fires `ValueChangedAction` where it differs from the value last announced, and recomputes
validity. The mutation methods call it, so a direct call is rarely needed.

### `bind(data?, overrides?): List<R>`

Returns a new `List` over `data`, with a binding of the item template, the actions and the extended
properties. `overrides` is an [`IBindParams<ListValueInput<R>, X>`](/api/field#ibindparams-t-x): `originalValue`,
`access`, `visibility` and the extended properties, which override the ones copied from the source.
Binding an empty list returns an empty list. Without `data`, the new list gets what this one holds (its
`fullValue`, every row regardless of access), not what it sends.

The new list is constructed through `this.constructor`, so a subclass of `List` binds into its own class. A
subclass whose constructor does not take `(itemTemplate, params)` would ignore the bound item template and produce a
list with the declaration's rows; `bind()` throws a `TypeError` in that case. Such a subclass must override `bind()`
and construct itself.

On `List`, `Group` and `Field` alike, `originalValue` counts as supplied when its key is present, and the data when
it is anything other than `undefined`: an explicit `null` is supplied data, so `bind(null)` returns an empty list,
while an `undefined` `data` counts as not supplied and the new list gets the current items.

### `rebind(data): this`

Replaces the rows this list holds with `data`, in place: the same list instance, existing rows reused by position
as in a whole-value assignment, and the baseline of `isChanged` reset. No `ValueChangedAction` fires for the list
itself. See [`rebind()`](/api/field#rebind-data-this) for the full description, and
[Clearing and resetting](/guide/cookbook#clearing-and-resetting-a-form) for `rebind(list.originalValue)` (reset) and
`rebind(null)` (empty).

## `NullableList`

Type alias for `List | null`.

---

> See also: [The model](/guide/model#how-a-list-builds-rows) for how a row is built and what a record is,
> [Actions reference](/api/actions) for `ListItemAddedAction` and `ListItemRemovedAction`
