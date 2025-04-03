# Conditional Actions Example

This example demonstrates how to use conditional actions with form fields in `@dynamicforms/vue-forms`. Conditional actions allow you to dynamically control field properties based on other field values.

## Demo

Here's a live demo showing how conditional actions can be used to create dynamic forms:

<conditional-statement-demo />

## Source Code

Here's the source code for the demo above:

### JavaScript/TypeScript

```js
import { Group, Field, Operator, Statement, ConditionalVisibilityAction, 
         ConditionalEnabledAction, ConditionalValueAction } from '@dynamicforms/vue-forms';

// Create a form group with conditional fields
const conditionsForm = new Group({
  // Field that controls other fields
  fruit: Field.create({ value: 'apple' }),
  
  // Fields with conditional behavior
  favoriteColor: Field.create({ value: '' }),
  detailsToggle: Field.create({ value: false }),
  additionalInfo: Field.create({ value: '' }),
  submitAction: Field.create({ enabled: false }),
});

// Create a reactive reference for form output
const formOutput = conditionsForm.reactiveValue;

// Set up conditional actions

// 1. Conditional Value Action - Set color based on fruit selection
const fruitColorStatement = new Statement(conditionsForm.fields.fruit, Operator.EQUALS, 'apple');
conditionsForm.fields.favoriteColor.registerAction(
  new ConditionalValueAction(fruitColorStatement, 'red')
);

// Set up different conditional actions for different fruits
const orangeStatement = new Statement(conditionsForm.fields.fruit, Operator.EQUALS, 'orange');
conditionsForm.fields.favoriteColor.registerAction(
  new ConditionalValueAction(orangeStatement, 'orange')
);

const bananaStatement = new Statement(conditionsForm.fields.fruit, Operator.EQUALS, 'banana');
conditionsForm.fields.favoriteColor.registerAction(
  new ConditionalValueAction(bananaStatement, 'yellow')
);

const grapeStatement = new Statement(conditionsForm.fields.fruit, Operator.EQUALS, 'grape');
conditionsForm.fields.favoriteColor.registerAction(
  new ConditionalValueAction(grapeStatement, 'purple')
);

const blueberryStatement = new Statement(conditionsForm.fields.fruit, Operator.EQUALS, 'blueberry');
conditionsForm.fields.favoriteColor.registerAction(
  new ConditionalValueAction(blueberryStatement, 'blue')
);

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
```

### Vue Template

```vue
<template>
  <div>
    <v-card class="mb-4">
      <v-card-title>Conditional statements Demo</v-card-title>
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
            :color="conditionsForm.fields.favoriteColor.value"
            class="mb-4"
          ></v-text-field>
          
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
```

## Key Features Demonstrated

- **ConditionalValueAction**: Automatically sets a field's value based on another field's value
- **ConditionalVisibilityAction**: Shows or hides a field based on a condition
- **ConditionalEnabledAction**: Enables or disables a field based on a condition
- **Statement**: Creates logical conditions that can be evaluated
- **Logical Operators**: Using AND, OR, EQUALS, and other operators to create complex conditions

## How It Works

1. **Fruit-Color Relationship**: When you select a fruit, the color field automatically updates to show that fruit's typical color
2. **Conditional Visibility**: The additional information field only appears when you toggle "Show additional details"
3. **Conditional Button State**: The submit button is only enabled when all required fields contain values

## Try It Yourself

You can experiment with the conditional actions by:
1. Selecting different fruits to see the color change
2. Toggling the details switch to show/hide the additional information field
3. Clearing field values to see how it affects the submit button's enabled state

<script setup>
import ConditionalStatementDemo from '../components/conditional-statement-demo.vue'
</script>
