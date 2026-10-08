# List Example

This example builds repeating sections with [`List`](/api/list) from `@dynamicforms/vue-forms`. A row of a list is
any form element, and the switch above the demo shows three of them: a `Group` per row for the line items of an
invoice, a single `Field` per row for a list of tags, and a whole `List` per row for a score sheet of rounds.

## Demo

<ListDemo />

## Source Code

The switch selects which of the three components is shown. Each component is a complete example.

::: code-group

<<< @/components/list-line-items-demo.vue [Line items]

<<< @/components/list-tags-demo.vue [Tags]

<<< @/components/list-rounds-demo.vue [Score sheet]

<<< @/components/list-demo.vue [Switch]

:::

## Line Items: a Group per Row

### The Item Template

The `Group` passed to `new List(...)` is not a row of the list. It is the item template every row is built from.
Each row is a binding of it, so every row has what the item template has: the `Required` validator on `description`
is declared once and rejects an empty description in every row, and an action registered on a field of the item
template runs in each row separately, on that row's field.

Rows are created for the list's initial value and for every later `push()` and `insert()`, so a change to the item
template after the list has rows applies only to rows added afterwards. Declare the item template completely before
building the list from it.

### Reaching a Sibling Field

Inside a row, `field.parent` is the row's own `Group`, so `row.fields.quantity` is the quantity of the row being
validated. `parent` is typed [`Container`](/api/container), which declares no members, so the validator checks
`row instanceof Group` before it reads one. The check narrows the type and also tests whether the row exists yet.
The expression is written on the item template and resolves per row, because the field the validator receives is
the row's field.

A row is built member by member: every member is bound separately, the bindings are passed to a `Group`, and the
group then receives the row's data. This validator's first run therefore happens while the unit price has no
`parent`. In that case the validator has no result: `field.markRecordIncomplete()` records this, and the container
that completes the record runs the validator again once the row holds its members and their data. A row created
with a quantity above zero and no unit price is therefore invalid as soon as it exists, without manual
revalidation.

A validator runs when its own field changes, so the unit price rule runs when the unit price is edited. A change of
the quantity must re-validate the unit price: `field.parent.fields.unitPrice.validate(true)` does that from a
`ValueChangedAction` on the quantity, behind the same `instanceof Group` check. `validate(true)` re-runs the field's
eager actions, including its validators; `validate()` alone recomputes validity from the errors already recorded.

### List Validity

`list.valid` is `true` when the list has no errors of its own and every row is valid. The Submit button's `disabled`
state binds to it. Emptying a description or clearing a unit price on a row with a
quantity above zero turns the whole list invalid; removing that row makes it valid again.

### Reading the Value

`list.value` is the plain data: one object per row, in row order, `[]` while the list is empty. It is recomputed
whenever a field, a row or the list itself changes, so the output panel below the form re-renders automatically.

## Tags: a Field per Row

`new List(new Field(...))` is a list of plain values. Every row is a `Field` bound from the item template, so it
has the item template's `Required` validator, and `tags.value` is an array of strings, such as
`['urgent', 'billing']`. A row binds to an input directly through `tag.value`, and `tags.push('')` adds a row: the
argument is the data the new row is bound to.

## Score Sheet: a List per Row

A row can also be a list. The outer list's item template is a `List` of number fields, so every round is a list
with its own `push()` and `remove()`, and the sheet's value is an array of arrays, such as `[[3, 5], [4]]`.
`rounds.push([0])` adds a round holding one score. The `MinValue` validator is declared once on the innermost item
template and runs on every score of every round, and `rounds.valid` covers all of them.

## API Reference

- [List](/api/list): item template, `get()`, `push()`, `insert()`, `remove()`, `value`, `valid`
- [Group](/api/group): `fields`, `parent`, rules for what a group sends
- [Validators](/api/validators): all built-in validators and the custom `Validator` signature
- [Container](/api/container): `parent`, and what a `Group` and a `List` share
- [Actions → ListItemAddedAction](/api/actions#listitemaddedaction): the events the buttons produce

## Key Features Demonstrated

- **Any Element as a Row**: a `Group`, a `Field` and a `List`, each declared once as the item template
- **Item Template**: One `Group` declaring the shape, the validators and the actions of every row
- **Mutations**: `push()`, `insert()` at a position, and `remove()`, each wired to a button
- **List Events**: `ListItemAddedAction` and `ListItemRemovedAction` reporting the index involved
- **Per-Row Validation**: A validator declared once on the item template and enforced in every row
- **Cross-Field Validation**: A row's field reading a sibling through `field.parent`, narrowed with `instanceof Group`
- **Aggregated Validity**: `list.valid` driving the Submit button
- **Plain Data**: `list.value` read back as an array of objects, of strings or of arrays

## Try It Yourself

Experiment with the list by:
1. Adding a line and leaving its description empty
2. Setting a quantity above zero on a row without a unit price
3. Lowering that quantity back to zero
4. Inserting a line above an existing one and watching the reported index
5. Removing the invalid rows and watching the Submit button become enabled
6. Switching to Tags and emptying a tag, or to Score sheet and entering a negative score

<script setup>
import ListDemo from '../components/list-demo.vue';
</script>
