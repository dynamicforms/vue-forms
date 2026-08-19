<template>
  <div class="list-demo">
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
        <pre class="output">{{ JSON.stringify(lineItems.value, null, 2) }}</pre>
        <p class="mt-4">List events</p>
        <pre class="output">{{ events.length ? events.join('\n') : 'Add, insert or remove a line to see events' }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
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
} from '../../src'; // from '@dynamicforms/vue-forms'

// The item template: a declaration of what a single row is, bound to the data of every row the list holds.
// The Required validator is declared once here and applies to the description of every row.
const lineItem = new Group({
  description: new Field({ value: '', validators: [new Validators.Required()] }),
  quantity: new Field({ value: 1 }),
  unitPrice: new Field({ value: null })
});

// A validator on a template field also runs in every row. Inside a row, field.parent is that row's Group,
// so the lookup below reads the quantity of the same row. A row is built member by member, so the first run
// happens before the member has a row at all: reaching nothing is no verdict, and markRecordIncomplete() is
// what asks for the run to be repeated once the row exists.
lineItem.fields.unitPrice.registerAction(new Validators.Validator((newValue, oldValue, field) => {
  const row = field.parent;
  if (!row) {
    field.markRecordIncomplete();
    return null;
  }
  if (row.fields.quantity.value > 0 && (newValue === null || newValue === '')) {
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
      return supr(field, item, index);
    }),
    new ListItemRemovedAction((field, supr, item, index) => {
      logEvent(`item removed at index ${index}`);
      return supr(field, item, index);
    })
  ]
});

// list.items hands out the Group behind every row, which is what the inputs bind to. The array is frozen and is
// rebuilt as rows come and go, and the read is tracked, so this recomputes on every mutation.
const rows = computed(() => lineItems.items);

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
</script>

<style scoped>
.list-demo {
  margin: 2rem 0;
}
.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
