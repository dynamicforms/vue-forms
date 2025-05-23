<template>
  <div class="validators-form-demo">
    <v-card class="mb-4">
      <v-card-title>Validators Demo</v-card-title>
      <v-card-text>
        <v-form @submit.prevent>
          <!-- Username field (Required) -->
          <v-text-field
            v-model="validatedForm.fields.username.value"
            label="Username"
            :error-messages="getErrorMessages(validatedForm.fields.username)"
            outlined
            class="mb-2"
          ></v-text-field>

          <!-- Email field (Pattern) -->
          <v-text-field
            v-model="validatedForm.fields.email.value"
            label="Email"
            :error-messages="getErrorMessages(validatedForm.fields.email)"
            :loading="validatedForm.fields.email.validating"
            outlined
            class="mb-2"
            hint="Try entering something@taken.com to see async validation"
            persistent-hint
          ></v-text-field>

          <!-- Age field (ValueInRange) -->
          <v-text-field
            v-model.number="validatedForm.fields.age.value"
            type="number"
            label="Age"
            :error-messages="getErrorMessages(validatedForm.fields.age)"
            outlined
            class="mb-2"
          ></v-text-field>

          <!-- Role field (InAllowedValues) -->
          <v-select
            v-model="validatedForm.fields.role.value"
            :items="['admin', 'user', 'guest']"
            label="Role"
            :error-messages="getErrorMessages(validatedForm.fields.role)"
            outlined
            class="mb-2"
          ></v-select>

          <!-- Bio field (LengthInRange) -->
          <v-textarea
            v-model="validatedForm.fields.bio.value"
            label="Bio"
            :error-messages="getErrorMessages(validatedForm.fields.bio)"
            outlined
            counter="200"
            class="mb-2"
          ></v-textarea>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-btn
          color="primary"
          :disabled="!formValid"
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
      <v-card-title>Form Validation Status</v-card-title>
      <v-card-text>
        <v-alert
          :type="formValid ? 'success' : 'error'"
          class="mb-3"
        >
          Form is {{ formValid ? 'valid' : 'invalid' }}
        </v-alert>
        <pre class="output">{{ JSON.stringify(formOutput, null, 2) }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import { computed, nextTick } from 'vue';
import { Group, Field, ValueChangedAction, Validators, ValidationErrorRenderContent } from '../../src'; // from '@dynamicforms/vue-forms'

// Create a form group with validated fields
const validatedForm = new Group({
  // Required field - cannot be empty
  username: Field.create({
    value: '',
    validators: [new Validators.Required()]
  }),

  // Email field with pattern validation
  email: Field.create({
    value: '',
    validators: [
      new Validators.Pattern(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please enter a valid email address'
      ),
      // Async validator to simulate email availability check
      new Validators.Validator(async (newValue) => {
        // Only validate if email format is correct
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(newValue)) {
          return null; // Let pattern validator handle format errors
        }

        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if email is "taken"
        if (newValue.endsWith('@taken.com')) {
          return [new ValidationErrorRenderContent('This email address is already taken')];
        }

        return null; // Email is available
      })
    ]
  }),

  // Number field with range validation
  age: Field.create({
    value: null,
    validators: [
      new Validators.ValueInRange(18, 100)
    ]
  }),

  // Field with allowed values validation
  role: Field.create({
    value: '',
    validators: [
      new Validators.InAllowedValues(['admin', 'user', 'guest'])
    ]
  }),

  // Text field with length validation
  bio: Field.create({
    value: '',
    validators: [
      new Validators.LengthInRange(10, 200)
    ]
  })
});

// Create a reactive reference for form output and validation status
const formOutput = validatedForm.reactiveValue;
const formValid = computed(() => {
  return Object.values(validatedForm.fields).every(field => field.valid);
});

// Function to extract error messages
function getErrorMessages(field) {
  if (!field.errors || field.errors.length === 0) return [];
  return field.errors.map(error => {
    if (error.componentBody) return error.componentBody;
    if (error.text) return error.text;
    return 'Validation error';
  });
}

// Function to reset the form
function resetForm() {
  validatedForm.fields.username.value = '';
  validatedForm.fields.email.value = '';
  validatedForm.fields.age.value = null;
  validatedForm.fields.role.value = '';
  validatedForm.fields.bio.value = '';
}

// Register a value changed action to update form output display
validatedForm.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('Form value has changed');
  return supr(field, newValue, oldValue);
}));
</script>

<style scoped>
.validators-form-demo {
  margin: 2rem 0;
}
.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
