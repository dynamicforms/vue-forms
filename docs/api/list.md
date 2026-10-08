# List

`List<R>` manages a dynamic array of rows of type `R`. A row is any form element: a `Group` for a list of records,
a `Field` for a list of plain values, another `List` for a list of lists. The list supports adding, removing and
replacing rows, and uses the same action and validation system as `Field` and `Group`. It extends
[`Container`](/api/container), which extends [`FieldBase`](/api/field-base). This page describes what `List` adds
or overrides.

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

`params` is an [`IFieldParams<ListValueInput<R>, X>`](/api/field-base#ifieldparams-t-x): the parameter type every
element takes, with the list's value shape substituted. A list takes
[extended properties](/api/field-base#extended-properties) like every other element: augment
[`Extras`](/api/field-base#extras) once and every list carries them, or declare them as the second
type argument for one list, `new List<Group<Fields>, Presentation>(template, { label: … })`. Both are read through
`list.extra`. Every row built from the item template is a binding of it, so the item template's members copy their
extended properties into each row. `length` and `items` are read-only members declared by `List`, so a parameter of
either name throws a `TypeError`, as `valid` and `busy` do. Give a presentation property with that meaning a
different name. `actions`, `errors`, `validators` and `visibility` apply to the list itself as on every element; see
[Constructor parameters](/api/field-base#constructor-parameters), which also describes the order in which the
parameters are applied.

<table class="members">
<thead><tr><th>Parameter</th><th>Type</th><th>Default</th></tr></thead>
<tbody>
<tr class="member-head"><td>

**`itemTemplate`**

</td><td>

`R`

</td><td>

default `undefined`

</td></tr>
<tr class="member-desc"><td colspan="3">

Template bound to each new item's data: every row is `itemTemplate.bind(item)`. If omitted, every row is built from its own item: a `Group` from a plain object, a `List` from an array, a `Field` from anything else

</td></tr>
<tr class="member-head"><td>

**`params.access`**

</td><td>

[`Access`](/api/field-base#access)

</td><td>

default `'editable'`

</td></tr>
<tr class="member-desc"><td colspan="3">

What the list sends to its own container, and the access applied to its rows through `effectiveAccess`. A list accepts value assignment and every mutation regardless of its access. See [What a container serializes](/api/container#what-a-container-serializes).

</td></tr>
<tr class="member-head"><td>

**`params.originalValue`**

</td><td>

`ListValueInput<R>`

</td><td>

default same as `value` (`[]` when empty)

</td></tr>
<tr class="member-desc"><td colspan="3">

Baseline for `isChanged`, and the rows the list is built with where no `value` is supplied

</td></tr>
<tr class="member-head"><td>

**`params.touched`**

</td><td>

`boolean`

</td><td>

default `false`

</td></tr>
<tr class="member-desc"><td colspan="3">

Accepted, but without effect: `touched` is delegated to the items, and the parameters are applied before `params.value` creates them. Assign `list.touched` after construction instead

</td></tr>
<tr class="member-head"><td>

**`params.value`**

</td><td>

`ListValueInput<R>` (`ListValue<R> | null`)

</td><td>

default `[]`

</td></tr>
<tr class="member-desc"><td colspan="3">

Initial array of item values. When absent, `originalValue` is used; an explicit `null` is not replaced and leaves the list empty. Anything that is neither an array nor `null` throws a `TypeError`

</td></tr>
</tbody>
</table>

## Properties

<table class="members">
<thead><tr><th>Property</th><th>Type</th><th>Writable</th></tr></thead>
<tbody>
<tr class="member-head"><td><a id="prop-fullValue"></a>

**`fullValue`**

</td><td>

`ListFullValue<R>`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

Overrides [`FieldBase.fullValue`](/api/field-base#prop-fullValue): the `fullValue` of every row, regardless of access. `value` is what the list sends; `fullValue` is what it holds, and a binding or a reset copies it

</td></tr>
<tr class="member-head"><td><a id="prop-items"></a>

**`items`**

</td><td>

`readonly R[]`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

The rows themselves; see [The rows](#the-rows)

</td></tr>
<tr class="member-head"><td><a id="prop-length"></a>

**`length`**

</td><td>

`number`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

The number of rows the list holds. Reading it builds no array

</td></tr>
<tr class="member-head"><td><a id="prop-value"></a>

**`value`**

</td><td>

reads `ListValue<R>`, accepts `ListValueInput<R>`

</td><td>

writable

</td></tr>
<tr class="member-desc"><td colspan="3">

Overrides [`FieldBase.value`](/api/field-base#prop-value): array of row values, by the rule a `Group` applies to its members: an `'editable'` or `'readonly'` row sends its own `value`, a `'disabled-null'` row is sent as `null`, and a `'disabled'` row is left out. Reads `[]` when the list has no rows; the list's value is never `null`. The setter also accepts `null` (which `group.value = null` writes into a nested list) and releases every row; `clear()` empties a list the same way. A value that is neither an array nor `null` throws `TypeError('Invalid value provided: a list takes an array of rows, or null to empty it')` and leaves the rows unchanged; because the setter is typed, such a value can only come from JavaScript or through an `as any`

</td></tr>
</tbody>
</table>

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
| `push()`, `insert()`, `remove()`, `pop()` | one row, plus native array operations over the row references: the shift of `splice()` and the copy a transaction keeps for a rollback |
| reading an index or `length` of [`view(list)`](/api/view) | constant |
| reading `value` after a change | one array of the current length, plus a rebuild of the rows that changed |
| assigning `value`, or `validate(true)` | the whole list (both apply to every row) |

The rows are held outside Vue's reactivity: a reactive array would route every row a `splice()` shifts through its
proxy. Every change of the set of rows increments a tracked counter, so `length`, `get()`, `items` and a template
that reads them re-run as before.

The caches are invalidated by the write itself, so no manual refresh is needed. `value` is rebuilt on the first
read after a change and reused until the next change, so two consecutive reads return the same object. That object
is frozen, rows included: writing into it throws in strict mode and is ignored otherwise, so assign a new value
instead. `originalValue` is a separate copy and is not frozen. The freeze covers only the objects the containers build. An array or object that a `Field` holds as its value is not frozen: writing into it changes the field's value without a `ValueChangedAction`, so assign a new array or object instead.

An assignment reuses the existing row objects, position by position, so `list.get(0)` returns the same instance
after `list.value = rows` when the new array has the same length. A keyed `v-for` over the rows therefore does not
remount them on every assignment. Only a row the list built from its item template is reused; a row that was
passed to `push()` or `insert()` as an element is replaced by a new row, so it keeps the data of the members the
item template does not have. A reused row is reset to the state of a new row built for that position: a member
whose key is absent from the new item gets the item template member's `originalValue`, and `originalValue`, `isChanged`, `touched`
and `errors` are reset. The new set is built separately and installed as a whole, so a validator that reads
`list.value` during the assignment never sees an unfilled position.

## Methods

### `bind(data?, overrides?): List<R>`

Overrides [`FieldBase.bind()`](/api/field-base#bind-data-overrides-fieldbase-t-x), which describes `overrides`
(an [`IBindParams<ListValueInput<R>, X>`](/api/field-base#ibindparams-t-x)), the construction through
`this.constructor` and the detached result. Returns a new `List` over `data`, with a binding of the item template,
the actions and the extended properties. Binding an empty list returns an empty list. Without `data`, the new list
gets what this one holds (its `fullValue`, every row regardless of access), not what it sends. `bind(null)` returns
an empty list.

A subclass whose constructor does not take `(itemTemplate, params)` would ignore the bound item template and produce
a list with the declaration's rows; `bind()` throws a `TypeError` in that case. Such a subclass must override
`bind()` and construct itself.

### `clear()`

Removes all items and triggers a value-changed notification. Every row is released, exactly as `remove()` releases
the row it removes. It does not change the list's own `touched`, `errors` or `originalValue`; for a reset that
revalidates, see [Clearing and resetting](/guide/cookbook#clearing-and-resetting-a-form) and use `rebind(null)` instead.

### `get(index): R | undefined`

Returns the row at `index`, or `undefined` if out of range.

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

### `pop(): R | undefined`

Removes the last item and returns it (`undefined` if the list is empty). Triggers `ListItemRemovedAction`.

### `push(item): number`

Appends an item to the end of the list. `item` is either the data a row is built from (bound to the item template, or built into an element by its type where the list has no item template) or an existing element, which becomes the row itself. Returns the new length of the list. Triggers `ListItemAddedAction` with the index the item was appended at.

```typescript
list.push({ name: 'Charlie', score: 70 });
```

### `remove(index): R | undefined`

Removes the item at `index` and returns it: the row instance itself, which `list.get(index)` returned before the
call and which is passed to `ListItemRemovedAction`. Triggers `ListItemRemovedAction`.

The removed row is released: its `parent` is cleared, it no longer counts towards the list's validity, and it can
be pushed into another list or back into this one. It keeps its state: a row edited before removal has `isChanged`
`true`, keeps the errors its validators produced, and its `originalValue` is the data it was bound to.

## Inherited members

::: details Inherited from Container
| Member | Description |
|--------|-------------|
| [`busy`](/api/container#prop-busy) | `true` while an `Action.execute()` in any child has not settled |
| [`confirm(params?)`](/api/container#confirm-params-promise-any-undefined) | Executes the action that confirms the container: its `SubmitAction`, or the only shown `defaultConfirm` action |
| [`notifyValueChanged()`](/api/container#notifyvaluechanged-void) | Records that a child changed its value, for the open transaction to announce |
| [`reject(params?)`](/api/container#reject-params-promise-any-undefined) | Executes the action that rejects the container: its `RejectAction`, or the only shown `defaultReject` action |
| [`touched`](/api/container#prop-touched) | `true` where any child is touched; assigning it assigns every child |
| [`valid`](/api/container#prop-valid) | `true` where the container's own errors are empty and every child it counts is valid |
| [`validate(revalidate?)`](/api/container#validate-revalidate-void) | Revalidates every child first with `revalidate: true`, then computes the container's validity |
:::

::: details Inherited from FieldBase
| Member | Description |
|--------|-------------|
| [`access`](/api/field-base#prop-access) | Whether the element accepts input, what it sends to its container, and whether it is validated |
| [`beginValidating() / endValidating()`](/api/field-base#beginvalidating-void-endvalidating-void) | Increment and decrement the asynchronous validation counter behind `validating` |
| [`bindingsOf(declaration)`](/api/field-base#bindingsof-declaration-fieldbase) | Returns every element in the subtree whose `declaration` is the one given |
| [`clearValidators()`](/api/field-base#clearvalidators-void) | Removes the element's validators and empties `errors` |
| [`contribution`](/api/field-base#prop-contribution) | What the element sends to its container's `value` |
| [`declaration`](/api/field-base#prop-declaration) | The element this one was declared as: itself, or the element a binding was made from |
| [`effectiveAccess`](/api/field-base#prop-effectiveAccess) | The access that applies once the containers above are taken into account |
| [`effectiveEnabled`](/api/field-base#prop-effectiveEnabled) | `true` where `effectiveAccess` is `'editable'` |
| [`enabled`](/api/field-base#prop-enabled) | `true` where `access` is `'editable'` |
| [`errors`](/api/field-base#prop-errors) | Current validation errors of the element; writable |
| [`extra`](/api/field-base#prop-extra) | The extended properties the element holds, frozen; written through `setExtendedValues()` |
| [`fieldName`](/api/field-base#prop-fieldName) | Key name within the parent `Group` |
| [`isChanged`](/api/field-base#prop-isChanged) | `true` when `value` differs from `originalValue` (deep equality) |
| [`markRecordIncomplete()`](/api/field-base#markrecordincomplete-void) | Marks that an eager action did not find a second element of a record not yet assembled |
| [`originalValue`](/api/field-base#prop-originalValue) | Baseline for `isChanged`; writable |
| [`parent`](/api/field-base#prop-parent) | Container the element belongs to |
| [`pending`](/api/field-base#prop-pending) | `validating \|\| busy` |
| [`rebind(data)`](/api/field-base#rebind-data-this) | Replaces the data the element holds, in place |
| [`registerAction(action)`](/api/field-base#registeraction-action-this) | Registers an action on the element; returns `this` |
| [`registerActionBefore(action, before)`](/api/field-base#registeractionbefore-action-before-this) | Registers `action` inside an existing chain, wrapped by `before` |
| [`setExtendedValues(values)`](/api/field-base#setextendedvalues-values-void) | Merges extended properties into `extra` |
| [`settled()`](/api/field-base#settled-promise-void) | Resolves once `pending` is `false` |
| [`triggerAction(actionClass, ...params)`](/api/field-base#triggeraction-actionclass-params-any) | Fires an action class on the element and returns what the chain returns |
| [`unregisterAction(action)`](/api/field-base#unregisteraction-action-boolean) | Removes an action from the element's declaration and its bindings |
| [`validating`](/api/field-base#prop-validating) | `true` while an asynchronous validation is in flight on the element or below it |
| [`validationEpoch`](/api/field-base#prop-validationEpoch) | Generation counter of the element's validators |
| [`visibility`](/api/field-base#prop-visibility) | How a rendering layer shows the element; writable |
:::

## `NullableList`

Type alias for `List | null`.

---

> See also: [FieldBase](/api/field-base), [Container](/api/container),
> [The model](/guide/model#how-a-list-builds-rows) for how a row is built and what a record is,
> [Actions reference](/api/actions) for `ListItemAddedAction` and `ListItemRemovedAction`
