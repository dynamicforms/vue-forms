# List Example

This example builds repeating sections with [`List`](/api/list) from `@dynamicforms/vue-forms`. A row of a list is
any form element, and the switch above the demo shows three of them: a `Group` per row for the line items of an
invoice, a single `Field` per row for a list of tags, and a whole `List` per row for a score sheet of rounds.

## Demo

<ListDemo />

## Source Code

The switch only picks which of three components is shown; each of them is a complete example of its own.

::: code-group

<<< @/components/list-line-items-demo.vue [Line items]

<<< @/components/list-tags-demo.vue [Tags]

<<< @/components/list-rounds-demo.vue [Score sheet]

<<< @/components/list-demo.vue [Switch]

:::

## Line Items: a Group per Row

### The Item Template

The `Group` handed to `new List(...)` is not a row of the list — it is the declaration every row is built from. Each
row is a binding of it, so whatever the template carries, every row carries: the `Required` validator on
`description` is written once and rejects an empty description in row one and in row twelve alike, and an action
registered on a template field runs in each row separately, on that row's field.

The rows are created for the values the list is given and for every `push()` and `insert()` afterwards, so a
template changed after the list has rows only reaches the rows added from then on. Declare the template
completely before building the list from it.

### Reaching a Sibling Field

Inside a row, `field.parent` is the row's own `Group`, which is what makes `row.fields.quantity` the quantity of
the row being validated rather than the template's. `parent` is typed [`Container`](/api/container), which names no
members, so the validator checks `row instanceof Group` before it reads one: the check narrows the type and answers
the question the validator has to ask anyway, whether the row exists yet. The same expression written on the
template resolves per row, because the field the validator receives is the row's field, not the one the template
holds.

A row is built member by member — every member is bound on its own, the bindings are handed to a `Group`, and the
group is then handed the row's data — so this validator's first run happens while the unit price still has no
`parent`. Reaching nothing there is *no verdict*, not a pass: `field.markRecordIncomplete()` says so, and the
container that completes the record runs the validator again over the row it then has. That is why a row created
with a quantity above zero and no unit price is invalid from the moment it exists, without anything revalidating
it by hand.

A validator runs when its own field changes, so the unit price rule fires when the unit price is edited. The other
half of the rule is the quantity, and a change there has to send the unit price through its validators again:
`field.parent.fields.unitPrice.validate(true)` does that from a `ValueChangedAction` on the quantity, behind the
same `instanceof Group` check. `validate(true)` re-runs the field's eager actions, its validators among them;
`validate()` alone announces the verdict the errors already recorded support.

### List Validity

`list.valid` is `true` when the list has no errors of its own and every row is valid, so it is the single value the
Submit button's `disabled` state binds to. Emptying a description or clearing a unit price on a row with a
quantity above zero turns the whole list invalid; removing that row makes it valid again.

### Reading the Value

`list.value` is the plain data: one object per row, in row order, `[]` while the list is empty. It is recomputed
whenever a field, a row or the list itself changes, so the output panel below the form re-renders on its own.

## Tags: a Field per Row

`new List(new Field(...))` is a list of plain values. Every row is a `Field` bound from the template, so it carries
the template's `Required` validator, and `tags.value` is an array of strings — `['urgent', 'billing']` — rather than
an array of objects. A row binds to an input directly through `tag.value`, and `tags.push('')` adds one: the item
is the data the new row is bound to.

## Score Sheet: a List per Row

A row can be a list as well. The outer list is built from a template that is itself a `List` of number fields, so
every round is a list of its own, with its own `push()` and `remove()`, and the sheet's value is an array of
arrays — `[[3, 5], [4]]`. `rounds.push([0])` adds a round holding one score. The `MinValue` validator is declared
once on the innermost template and runs on every score of every round, and `rounds.valid` answers for all of them.

## API Reference

- [List](/api/list) — item template, `get()`, `push()`, `insert()`, `remove()`, `value`, `valid`
- [Group](/api/group) — `fields`, `parent`, serialization rules
- [Validators](/api/validators) — all built-in validators and the custom `Validator` signature
- [Container](/api/container) — `parent`, and what a `Group` and a `List` share
- [Actions → ListItemAddedAction](/api/actions#listitemaddedaction) — the events the buttons produce

## Key Features Demonstrated

- **Any Element as a Row**: a `Group`, a `Field` and a `List`, each declared once as the item template
- **Item Template**: One `Group` declaring the shape, the validators and the actions of every row
- **Mutations**: `push()`, `insert()` at a position, and `remove()`, each wired to a button
- **List Events**: `ListItemAddedAction` and `ListItemRemovedAction` reporting the index involved
- **Per-Row Validation**: A validator declared once on the template and enforced in every row
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
