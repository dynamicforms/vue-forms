<template>
  <div class="person-form-demo">
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
                hide-details="auto"
              ></v-text-field>
            </v-col>

            <v-col cols="12" md="6">
              <v-text-field
                v-model="personForm.fields.lastName.value"
                :disabled="!personForm.fields.lastName.enabled"
                label="Last Name"
                outlined
                hide-details="auto"
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
                hide-details="auto"
              ></v-text-field>
            </v-col>

            <v-col cols="12" md="6">
              <v-switch
                v-model="personForm.fields.active.value"
                :disabled="!personForm.fields.active.enabled"
                label="Active"
                hide-details="auto"
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
        <pre class="output">{{ formOutput }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import { Group, Field, ValueChangedAction } from '../../src'; //from '@dynamicforms/vue-forms'

// Create a form group with fields
const personForm = new Group({
  firstName: Field.create({ value: 'John' }),
  lastName: Field.create({ value: 'Doe' }),
  age: Field.create({ value: 30 }),
  active: Field.create({ value: true })
});

// Create a reactive reference for form output
const formOutput = personForm.reactiveValue;

// Function to toggle field enabled state
const toggleField = (fieldName) => {
  const field = personForm.fields[fieldName];
  if (field) {
    field.enabled = !field.enabled;
  }
};

// Register a value changed action to update form output display
personForm.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('form value has changed');
  return supr(field, newValue, oldValue);
}));
</script>

<style scoped>
.person-form-demo {
  margin: 2rem 0;
}
.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
