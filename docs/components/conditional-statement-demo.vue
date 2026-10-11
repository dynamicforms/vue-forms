<template>
  <div class="conditional-actions-demo">
    <v-card class="mb-4">
      <v-card-title>Conditional Actions Demo</v-card-title>
      <v-card-text>
        <v-form @submit.prevent>
          <!-- Fruit selection -->
          <v-select
            v-model="conditionsForm.fields.fruit.value"
            :items="Object.keys(fruitColorMap)"
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
            v-if="conditionsForm.fields.additionalInfo.visibility === 'full'"
            v-model="conditionsForm.fields.additionalInfo.value"
            label="Additional Information"
            outlined
            hide-details="auto"
            class="mb-4"
          ></v-text-field>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-btn color="primary" :disabled="!submit.executable" @click="submitForm">
          {{ submit.label }}
        </v-btn>
        <v-btn color="secondary" @click="resetForm" class="ml-2">Reset</v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>Form Output</v-card-title>
      <v-card-text>
        <p>Form is {{ conditionsForm.isChanged ? 'changed' : 'unchanged' }}</p>
        <pre class="output">{{ conditionsForm.value }}</pre>
        <template v-if="submitted">
          <p class="mt-4">Submitted</p>
          <pre class="output">{{ submitted }}</pre>
        </template>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  Action,
  ConditionalAccessAction,
  ConditionalValueAction,
  ConditionalVisibilityAction,
  ExecuteAction,
  Field,
  Group,
  Operator,
  Statement,
} from '../../src'; // from '@dynamicforms/vue-forms'

const fruitColorMap: Record<string, string> = {
  apple: 'red',
  orange: 'orange',
  banana: 'yellow',
  grape: 'purple',
  blueberry: 'blue',
};

// The field the conditions read. It is declared before the group so that the other elements' actions can be
// passed to their constructors, and the form's baseline is recorded after the actions have applied.
const fruit = new Field({ value: 'apple' });

// 1. Conditional Value Action - Set color based on fruit selection, one action per fruit
const favoriteColor = new Field({
  value: '',
  actions: Object.entries(fruitColorMap).map(
    ([name, color]) => new ConditionalValueAction(new Statement(fruit, Operator.EQUALS, name), color),
  ),
});

// 2. Conditional Visibility Action - Show additional info field only when details toggle is on
const detailsToggle = new Field({ value: false });
const additionalInfo = new Field({
  value: '',
  actions: [new ConditionalVisibilityAction(new Statement(detailsToggle, Operator.EQUALS, true))],
});

// What the last submit sent
const submitted = ref('');

// 3. Conditional Access Action - Enable the submit action only when both fields hold a value
const submit = new Action({
  value: { label: 'Submit' },
  actions: [
    new ConditionalAccessAction(
      new Statement(
        new Statement(fruit, Operator.NOT_EQUALS, ''),
        Operator.AND,
        new Statement(favoriteColor, Operator.NOT_EQUALS, ''),
      ),
    ),
    new ExecuteAction((action, supr, params) => {
      submitted.value = JSON.stringify(conditionsForm.value);
      return supr(action, params);
    }),
  ],
});

const conditionsForm = new Group({ fruit, favoriteColor, detailsToggle, additionalInfo, submit });

async function submitForm() {
  await submit.execute();
}

// Back to the baseline: the values the form was built with, after its actions applied
function resetForm() {
  conditionsForm.rebind(conditionsForm.originalValue);
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
