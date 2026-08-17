# List Example

This example demonstrates how to build a repeating section — the line items of an invoice — with
[`List`](/api/list) from `@dynamicforms/vue-forms`.

## Demo

Here's a live demo of a list of line items, each row with its own validation:

<ListDemo />

## Source Code

Here's the source code for the demo above:

### JavaScript/TypeScript

```js
import { computed, ref } from 'vue';
import {
  Group,
  Field,
  List,
  ListItemAddedAction,
  ListItemRemovedAction,
  ValueChangedAction,
  ValidationErrorText,
  Validators
} from '@dynamicforms/vue-forms';

// The item template: a declaration of what a single row is, cloned into every row the list holds.
// The Required validator is declared once here and applies to the description of every row.
const lineItem = new Group({
  description: new Field({ value: '', validators: [new Validators.Required()] }),
  quantity: new Field({ value: 1 }),
  unitPrice: new Field({ value: null })
});

// A validator on a template field also runs in every row. Inside a row, field.parent is that row's Group,
// so the lookup below reads the quantity of the same row.
lineItem.fields.unitPrice.registerAction(new Validators.Validator((newValue, oldValue, field) => {
  const quantity = field.parent?.fields.quantity.value;
  if (quantity > 0 && (newValue === null || newValue === '')) {
    return [new ValidationErrorText('Unit price is required when quantity is above zero')];
  }
  return null;
}));

// The rule spans two fields, so a new quantity sends the unit price of the same row through its validators again
lineItem.fields.quantity.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  const result = supr(field, newValue, oldValue);
  field.parent?.fields.unitPrice.validate(true);
  return result;
}));

// The last few list events, newest last
const events = ref([]);

function logEvent(message) {
  events.value = [...events.value, message].slice(-6);
}

// The list, built from the template and populated with two rows
const lineItems = new List(lineItem, {
  value: [
    { description: 'Consulting hours', quantity: 8, unitPrice: 120 },
    { description: 'Travel expenses', quantity: 1, unitPrice: 85 }
  ],
  actions: [
    new ListItemAddedAction((field, supr, item, index) => {
      logEvent(`item added at index ${index}`);
      // the cross-field rule reads a sibling, and a row has one only once it is a row, so the values the row
      // arrived with are put through the validators here
      item.validate(true);
      return supr(field, item, index);
    }),
    new ListItemRemovedAction((field, supr, item, index) => {
      logEvent(`item removed at index ${index}`);
      return supr(field, item, index);
    })
  ]
});

// list.get(index) hands out the Group behind a row, which is what the inputs bind to. List has no length
// property, so the row count comes from list.value, and reading it makes this recompute on every mutation.
const rows = computed(() => {
  const rowCount = lineItems.value?.length ?? 0;
  const result = [];
  for (let index = 0; index < rowCount; index++) result.push(lineItems.get(index));
  return result;
});

function addLine() {
  lineItems.push({ description: '', quantity: 1, unitPrice: null });
}

function insertAbove(index) {
  lineItems.insert({ description: '', quantity: 1, unitPrice: null }, index);
}

// Function to extract error messages as plain strings, as required by Vuetify's error-messages prop.
// componentBody carries the text of plain-text errors, componentBindings.source the source of markdown ones.
function getErrorMessages(field) {
  if (!field.errors || field.errors.length === 0) return [];
  return field.errors.map(error => error.componentBody || error.componentBindings.source || 'Validation error');
}
```

### Vue Template

```vue
<template>
  <div>
    <v-card class="mb-4">
      <v-card-title>Invoice Line Items</v-card-title>
      <v-card-text>
        <v-form @submit.prevent>
          <v-row v-for="(row, index) in rows" :key="index" align="start">
            <v-col cols="12" md="4">
              <v-text-field
                v-model="row.fields.description.value"
                label="Description"
                :error-messages="getErrorMessages(row.fields.description)"
                outlined
                hide-details="auto"
              ></v-text-field>
            </v-col>

            <v-col cols="6" md="2">
              <v-text-field
                v-model.number="row.fields.quantity.value"
                type="number"
                label="Quantity"
                :error-messages="getErrorMessages(row.fields.quantity)"
                outlined
                hide-details="auto"
              ></v-text-field>
            </v-col>

            <v-col cols="6" md="3">
              <v-text-field
                v-model.number="row.fields.unitPrice.value"
                type="number"
                label="Unit Price"
                :error-messages="getErrorMessages(row.fields.unitPrice)"
                outlined
                hide-details="auto"
              ></v-text-field>
            </v-col>

            <v-col cols="12" md="3">
              <v-btn-group>
                <v-btn color="primary" @click="insertAbove(index)">Insert Above</v-btn>
                <v-btn color="secondary" @click="lineItems.remove(index)">Remove</v-btn>
              </v-btn-group>
            </v-col>
          </v-row>
        </v-form>

        <p v-if="rows.length === 0">The invoice has no line items.</p>
      </v-card-text>

      <v-card-actions>
        <v-btn color="primary" @click="addLine">Add Line</v-btn>
        <v-btn color="primary" class="ml-2" :disabled="!lineItems.valid">Submit</v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>List Output</v-card-title>
      <v-card-text>
        <p>List is {{ lineItems.valid ? 'valid' : 'invalid' }}</p>
        <pre>{{ JSON.stringify(lineItems.value, null, 2) }}</pre>
        <p class="mt-4">List events</p>
        <pre>{{ events.join('\n') }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>
```

## The Item Template

The `Group` handed to `new List(...)` is not a row of the list — it is the declaration every row is built from. Each
row is a clone of it, so whatever the template carries, every row carries: the `Required` validator on
`description` is written once and rejects an empty description in row one and in row twelve alike, and an action
registered on a template field runs in each row separately, on that row's field.

The rows are created for the values the list is given and for every `push()` and `insert()` afterwards, so a
template changed after the list has rows only reaches the rows added from then on. Declare the template
completely before building the list from it.

## Reaching a Sibling Field

Inside a row, `field.parent` is the row's own `Group`, which is what makes `field.parent?.fields.quantity` the
quantity of the row being validated rather than the template's. The same expression written on the template
resolves per row, because the field the validator receives is the row's field, not the one the template holds.

A validator runs when its own field changes, so the unit price rule fires when the unit price is edited. The other
half of the rule is the quantity, and a change there has to send the unit price through its validators again:
`field.parent?.fields.unitPrice.validate(true)` does that from a `ValueChangedAction` on the quantity, with the
same sibling lookup. `validate(true)` re-runs the field's validators; `validate()` alone only recomputes the
verdict from the errors already recorded.

## List Validity

`list.valid` is `true` when the list has no errors of its own and every row is valid, so it is the single value the
Submit button's `disabled` state binds to. Emptying a description or clearing a unit price on a row with a
quantity above zero turns the whole list invalid; removing that row makes it valid again.

## Reading the Value

`list.value` is the plain data: one object per row, in row order, `null` while the list is empty. It is recomputed
whenever a field, a row or the list itself changes, so the output panel below the form re-renders on its own.

## API Reference

- [List](/api/list) — item template, `get()`, `push()`, `insert()`, `remove()`, `value`, `valid`
- [Group](/api/group) — `fields`, `parent`, serialization rules
- [Validators](/api/validators) — all built-in validators and the custom `Validator` signature
- [Actions → ListItemAddedAction](/api/actions#listitemaddedaction) — the events the buttons produce

## Key Features Demonstrated

- **Item Template**: One `Group` declaring the shape, the validators and the actions of every row
- **Mutations**: `push()`, `insert()` at a position, and `remove()`, each wired to a button
- **List Events**: `ListItemAddedAction` and `ListItemRemovedAction` reporting the index involved
- **Per-Row Validation**: A validator declared once on the template and enforced in every row
- **Cross-Field Validation**: A row's field reading a sibling through `field.parent`
- **Aggregated Validity**: `list.valid` driving the Submit button
- **Plain Data**: `list.value` read back as an array of objects

## Try It Yourself

Experiment with the list by:
1. Adding a line and leaving its description empty
2. Setting a quantity above zero on a row without a unit price
3. Lowering that quantity back to zero
4. Inserting a line above an existing one and watching the reported index
5. Removing the invalid rows and watching the Submit button become enabled

<script setup>
import ListDemo from '../components/list-demo.vue';
</script>
