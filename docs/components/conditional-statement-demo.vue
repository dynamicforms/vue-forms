<template>
  <div class="conditional-actions-demo">
    <v-card class="mb-4">
      <v-card-title>Conditional Actions Demo</v-card-title>
      <v-card-text>
        <v-form @submit.prevent>
          <!-- Fruit selection -->
          <v-select
            v-model="conditionsForm.fields.fruit.value"
            :items="['apple', 'orange', 'banana', 'grape', 'blueberry']"
            label="Select a fruit"
            outlined
            hide-details="auto"
            class="mb-4"
          ></v-select>

          <!-- Color field that updates based on fruit -->
          <v-text-field
            v-model="conditionsForm.fields.favoriteColor.value"
            label="Fruit color"
            outlined
            hide-details="auto"
            class="mb-4"
          ></v-text-field>

          <div class="color-preview mb-4" :style="{ backgroundColor: conditionsForm.fields.favoriteColor.value }">
            Color preview
          </div>

          <!-- Details toggle -->
          <v-switch
            v-model="conditionsForm.fields.detailsToggle.value"
            label="Show additional details"
            color="primary"
            hide-details="auto"
            class="mb-4"
          ></v-switch>

          <!-- Additional info field (conditionally visible) -->
          <v-text-field
            v-if="conditionsForm.fields.additionalInfo.visibility === 10"
            v-model="conditionsForm.fields.additionalInfo.value"
            label="Additional Information"
            outlined
            hide-details="auto"
            class="mb-4"
          ></v-text-field>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-btn
          color="primary"
          :disabled="!conditionsForm.fields.submitAction.enabled"
        >
          Submit
        </v-btn>
        <v-btn
          color="secondary"
          @click="resetForm"
          class="ml-2"
        >
          Reset
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>Form Output</v-card-title>
      <v-card-text>
        <pre class="output">{{ formOutput }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import {
  Group,
  Field,
  Statement,
  Operator,
  ConditionalVisibilityAction,
  ConditionalEnabledAction,
  ConditionalValueAction,
  DisplayMode
} from '../../src'; // from '@dynamicforms/vue-forms'

// Create a form group with conditional fields
const conditionsForm = new Group({
  // Field that controls other fields
  fruit: Field.create({value: 'apple'}),

  // Fields with conditional behavior
  favoriteColor: Field.create({value: ''}),
  detailsToggle: Field.create({value: false}),
  additionalInfo: Field.create({value: ''}),
  submitAction: Field.create({enabled: false}),
});

// Create a reactive reference for form output
const formOutput = conditionsForm.reactiveValue;

// Set up conditional actions

// 1. Conditional Value Action - Set color based on fruit selection
const fruitColorMap = {
  'apple': 'red',
  'orange': 'orange',
  'banana': 'yellow',
  'grape': 'purple',
  'blueberry': 'blue'
};

// Set up conditional actions for each fruit
Object.entries(fruitColorMap).forEach(([fruit, color]) => {
  const fruitStatement = new Statement(conditionsForm.fields.fruit, Operator.EQUALS, fruit);
  conditionsForm.fields.favoriteColor.registerAction(
    new ConditionalValueAction(fruitStatement, color)
  );
});

// 2. Conditional Visibility Action - Show additional info field only when details toggle is on
const showDetailsStatement = new Statement(conditionsForm.fields.detailsToggle, Operator.EQUALS, true);
conditionsForm.fields.additionalInfo.registerAction(
  new ConditionalVisibilityAction(showDetailsStatement)
);

// 3. Conditional Enabled Action - Enable submit button only when all required fields are filled
const fieldsFilledStatement = new Statement(
  new Statement(conditionsForm.fields.fruit, Operator.NOT_EQUALS, ''),
  Operator.AND,
  new Statement(conditionsForm.fields.favoriteColor, Operator.NOT_EQUALS, '')
);
conditionsForm.fields.submitAction.registerAction(
  new ConditionalEnabledAction(fieldsFilledStatement)
);

// Function to reset the form
function resetForm() {
  conditionsForm.fields.fruit.value = 'apple';
  conditionsForm.fields.favoriteColor.value = '';
  conditionsForm.fields.detailsToggle.value = false;
  conditionsForm.fields.additionalInfo.value = '';
}
</script>

<style scoped>
.conditional-actions-demo {
  margin: 2rem 0;
}

.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}

.color-preview {
  height: 40px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
  transition: background-color 0.3s ease;
}
</style>
