# List

`List<R>` manages a dynamic array of rows of type `R`. A row is any form element: a `Group` for a list of records,
a `Field` for a list of plain values, another `List` for a list of lists. The list supports adding, removing, and
replacing rows while triggering the same action/validation system as `Field` and `Group`.

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

The type argument is the row: `new List(itemTemplate)` infers it from the template, so the two lists above are a
`List<Group<{ name: Field<string>; score: Field<number> }>>` and a `List<Field<string>>`. A list declared without
a template is typed `List<Group>`; name the row where it holds something else:

```typescript
const names = new List<Field<string>>();
names.push('Ada');  // a Field row
names.value;        // ['Ada']
```

Without a template every row is built from its own item: a plain object becomes a `Group` of fields, an array a
`List`, and anything else — a string, a number, `null`, a `Date` — a `Field` holding it.

## `new List(itemTemplate?, params?)`

`params` is an `IFieldParams<ListValueInput<R>, X>` — the same parameter type every form element takes, with the list's
value shape substituted. A list takes [extended properties](/api/field#extended-properties) like every other
element: augment [`Extras`](/api/field#extras) once and every list carries them, or declare them as the second
type argument for one list, `new List<Group<Fields>, Presentation>(template, { label: … })`. Either way they read back
through `list.extra`. Every row the item template builds is a binding of it, so the template's
members carry theirs into each row. `length` and `items` are members `List` declares itself and are read-only,
so a parameter of either name throws a `TypeError` the way `valid` and `busy` do — name a presentation property
of that meaning something else.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `itemTemplate` | `R` | `undefined` | Template bound to each new item's data: every row is `itemTemplate.bind(item)`. If omitted, every row is built from its own item: a `Group` from a plain object, a `List` from an array, a `Field` from anything else |
| `params.value` | `ListValueInput<R>` (`ListValue<R> \| null`) | `[]` | Initial array of item values. Left out, it falls back to `originalValue`; an explicit `null` does not and leaves the list empty. Anything that is neither an array nor `null` throws a `TypeError` |
| `params.originalValue` | `ListValueInput<R>` | same as `value` (`[]` when empty) | Baseline for `isChanged`, and the rows the list is built with where no `value` is supplied |
| `params.access` | [`Access`](/api/field#access) | `'editable'` | What the list sends to its own container, and what applies to its rows through `effectiveAccess`. A list takes value assignment and every mutation whatever its access. See [What a container serializes](/api/container#what-a-container-serializes). |
| `params.visibility` | [`Visibility`](/api/field#visibility) | `'full'` | How a rendering layer shows the list. |
| `params.touched` | `boolean` | `false` | Accepted, but without effect: `touched` is delegated to the items, and the parameters are applied before `params.value` creates them. Assign `list.touched` after construction instead |
| `params.errors` | `ValidationError[]` | `[]` | Initial list-level validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | List-level validators |
| `params.actions` | `FieldActionBase[]` | `[]` | List-level actions |

`validators` and `actions` are registered before the remaining parameters are applied, and registration fires
nothing, so an `AccessChangingAction` or `VisibilityChangingAction` passed here already guards the `access` and
`visibility` the same object carries, and every eager action among them runs exactly once, over the finished list.
`Field`, `Action` and `Group` do the same — see [Field](/api/field) for the full description.

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | reads `ListValue<R>`, accepts `ListValueInput<R>` | yes | Array of row values, by the rule a `Group` applies to its members: an `'editable'` or `'readonly'` row contributes what its own `value` reads back, a `'disabled-null'` row is sent as `null`, and a `'disabled'` row is left out. Reads back `[]` when the list has no rows; the list itself is never `null`. The setter takes `null` as well — the write `group.value = null` makes into a nested list — and it releases every row; `clear()` empties a list the same way. A value that is neither an array nor `null` throws `TypeError('Invalid value provided: a list takes an array of rows, or null to empty it')` and leaves the rows standing: the setter is typed, so that write reaches it from JavaScript or through an `as any` |
| `originalValue` | `ListValue<R>` | yes | Value at creation time. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the list itself and every row are valid. A row sent nowhere is not validated and so is valid |
| `validating` | `boolean` | no | `true` while an asynchronous validation is in flight on the list itself or in any row. The list keeps a tally of the rows that answer `true`, so the read costs nothing however many rows it holds |
| `busy` | `boolean` | no | `true` while an `Action.execute()` in a row has yet to settle. A validation running in a row is answered by `validating`, not by this, so a submit gate reads both, or awaits [`settled()`](/api/field#settled-promise-void) |
| `errors` | `ValidationError[]` | yes | List-level validation errors. Writable, but normally managed by validators |
| `access` | [`Access`](/api/field#access) | yes | What the list sends to its container and whether it is validated — `'disabled'` leaves it out and `'disabled-null'` sends `null` whatever it holds — and, through `effectiveAccess`, what every element inside it sends: below a `'disabled'` or `'disabled-null'` list nothing is sent or validated, and below a `'readonly'` one nothing accepts input. Each member keeps the access it was given. See [What a container serializes](/api/container#what-a-container-serializes). |
| `effectiveAccess` | [`Access`](/api/field#access) | no | The access that applies once the containers above are taken into account — see [`effectiveAccess`](/api/field#properties) |
| `enabled` | `boolean` | no | `true` where `access` is `'editable'` |
| `effectiveEnabled` | `boolean` | no | `true` where `effectiveAccess` is `'editable'`: what a rendering layer reads to draw the inputs of a whole section without input |
| `visibility` | [`Visibility`](/api/field#visibility) | yes | How a rendering layer shows the list. It changes nothing about what the list sends or whether it is validated |
| `touched` | `boolean` | yes | `true` when any item has been touched; setting propagates to all items |
| `length` | `number` | no | The number of rows the list holds. Nothing is built to count them |
| `items` | `readonly R[]` | no | The rows themselves — see [The rows](#the-rows) |
| `fullValue` | `ListFullValue<R>` | no | The `fullValue` of every row, whatever its access. Where `value` states what the list sends, this states what it holds, and it is what a binding or a reset carries |

`ListValue<R>` is exported as `(R['value'] | null)[]`, `ListValueInput<R>` as `ListValue<R> | null` and
`ListFullValue<R>` as `R['fullValue'][]`, each with `R` defaulting to `Group`.

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

### `get(index): R | undefined`

Returns the row at `index`, or `undefined` if out of range.

### `push(item): number`

Appends an item to the end of the list. `item` is either the data a row is built from — bound to the item template, or turned into a `Group` where the list has none — or an existing element, which becomes the row itself. Returns the new length of the list. Triggers `ListItemAddedAction` with the index the item was appended at.

```typescript
list.push({ name: 'Charlie', score: 70 });
```

### `pop(): R | undefined`

Removes the last item and returns it (`undefined` if the list is empty). Triggers `ListItemRemovedAction`.

### `insert(item, index): number`

Inserts `item` at `index` and returns the position it ends up at. A negative `index` counts back from the end and
stops at the front, exactly the way `Array.prototype.splice` reads it: on a three-item list `-1` inserts before the
last item and returns `2`, and `-100` inserts at the front and returns `0`. A non-negative `index` is the position
itself, so the return value is the number you passed. If `index` is beyond the current length, the gap is filled
with bindings of the item template — these carry the template's own values, not empty ones. Without an item template
the padding items are empty elements of the kind `item` is built into: empty groups for a plain object, empty lists
for an array, fields holding `undefined` for anything else.

`ListItemAddedAction` fires once per item that ends up in the list: once for each padding item, each with the index
that item occupies, and finally for `item` at the position it occupies — the same number `insert()` returns, so a
negative `index` is reported resolved there too.

### `remove(index): R | undefined`

Removes the item at `index` and returns it — the row instance itself, the one `list.get(index)` answered with
before the call, and the one `ListItemRemovedAction` is given. Triggers `ListItemRemovedAction`.

The row is released as it leaves: it loses its `parent`, stops counting towards the list's validity, and can be
pushed into another list — or back into this one. Everything it holds stands, so a row edited before it was
removed answers `isChanged` with `true`, keeps the errors its validators reached, and reports its `originalValue`
as the data it was bound to.

### `clear()`

Removes all items and triggers a value-changed notification. Every row is released, exactly as `remove()` releases
the one it takes out. It does not touch the list's own `touched`, `errors` or `originalValue` — for a reset that
revalidates, see [Clearing and resetting](/guide/cookbook#clearing-and-resetting-a-form) and use `rebind(null)` instead.

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

### `bind(data?, overrides?): List<R>`

Returns a new `List` over `data`, carrying a binding of the item template, the actions and the extended
properties. `overrides` is an [`IBindParams<ListValueInput<R>, X>`](/api/field#ibindparams-t-x): `originalValue`,
`access`, `visibility` and the extended properties, which are written over the ones carried from the source.
Binding an empty list gives an empty list. Without `data`, the new list carries what this one holds — its
`fullValue`, every row whatever its access — rather than what it sends.

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
fires for the list itself. See [`rebind()`](/api/field#rebind-data-this) for the whole of it, and
[Clearing and resetting](/guide/cookbook#clearing-and-resetting-a-form) for `rebind(list.originalValue)` and `rebind(null)`
as the reset and the empty recipes.

## `NullableList`

Type alias for `List | null`.

---

> See also: [The model](/guide/model#how-a-list-builds-rows) for how a row is built and what a record is,
> [Actions reference](/api/actions) for `ListItemAddedAction` and `ListItemRemovedAction`
