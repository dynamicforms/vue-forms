# Basic Form Example

This example demonstrates how to create a simple form with fields and interact with it using `@dynamicforms/vue-forms`.

## Demo

Here's a live demo of the person form with Vuetify components:

<PersonFormDemo />

## Source Code

Here's the source code for the demo above:

### JavaScript/TypeScript

```js
import { Group, Field, ValueChangedAction } from '@dynamicforms/vue-forms';

// Create a form group with fields
const personForm = new Group({
  firstName: new Field({ value: 'John' }),
  lastName: new Field({ value: 'Doe' }),
  age: new Field({ value: 30 }),
  active: new Field({ value: true })
});

// Function to toggle field enabled state
const toggleField = (fieldName) => {
  const field = personForm.fields[fieldName];
  if (field) {
    field.enabled = !field.enabled;
  }
};

// Register a value changed action to display updated values
personForm.registerAction(new ValueChangedAction(async (field, supr, newValue, oldValue) => {
  console.log('Form data changed:', newValue);
  return supr(field, newValue, oldValue);
}));
```

### Vue Template

```vue
<template>
  <div>
    <v-card class="mb-4">
      <v-card-title>Person Form</v-card-title>
      <v-card-text>
        <v-form @submit.prevent>
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="personForm.fields.firstName.value"
                :disabled="!personForm.fields.firstName.enabled"
                label="First Name"
                outlined
              ></v-text-field>
            </v-col>
            
            <v-col cols="12" md="6">
              <v-text-field
                v-model="personForm.fields.lastName.value"
                :disabled="!personForm.fields.lastName.enabled"
                label="Last Name"
                outlined
              ></v-text-field>
            </v-col>
          </v-row>
          
          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="personForm.fields.age.value"
                :disabled="!personForm.fields.age.enabled"
                type="number"
                label="Age"
                outlined
              ></v-text-field>
            </v-col>
            
            <v-col cols="12" md="6">
              <v-switch
                v-model="personForm.fields.active.value"
                :disabled="!personForm.fields.active.enabled"
                label="Active"
                color="primary"
              ></v-switch>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      
      <v-card-actions>
        <v-btn-group>
          <v-btn @click="toggleField('firstName')" color="primary">
            {{ personForm.fields.firstName.enabled ? 'Disable' : 'Enable' }} First Name
          </v-btn>
          <v-btn @click="toggleField('lastName')" color="primary">
            {{ personForm.fields.lastName.enabled ? 'Disable' : 'Enable' }} Last Name
          </v-btn>
          <v-btn @click="toggleField('age')" color="primary">
            {{ personForm.fields.age.enabled ? 'Disable' : 'Enable' }} Age
          </v-btn>
        </v-btn-group>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>Form Output</v-card-title>
      <v-card-text>
        <pre>{{ JSON.stringify(personForm.value, null, 2) }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>
```

## Key Features Demonstrated

- **Form Creation**: Creating a form group with fields
- **Reactivity**: Binding form fields to Vue components
- **Field Controls**: Enabling and disabling fields
- **Events**: Using the ValueChangedAction to respond to form changes

## Try It Yourself

You can experiment with the code by changing field values, toggling field states, or adding new fields to the form.

<script setup>
import PersonFormDemo from '../components/person-form-demo.vue'
</script>
