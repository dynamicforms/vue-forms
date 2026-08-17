# Validators Example

This example demonstrates how to use validators with form fields in `@dynamicforms/vue-forms`.

## Demo

Here's a live demo of form validation using various validators:

<ValidatorsFormDemo />

## Source Code

Here's the source code for the demo above:

### JavaScript/TypeScript

```js
import { computed } from 'vue';
import { Group, Field, ValueChangedAction, Validators, ValidationErrorRenderContent } from '@dynamicforms/vue-forms';

// Create a form group with validated fields
const validatedForm = new Group({
  // Required field - cannot be empty
  username: new Field({ 
    value: '', 
    validators: [new Validators.Required()]
  }),
  
  // Email field with pattern validation
  email: new Field({ 
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
  age: new Field({ 
    value: null, 
    validators: [
      new Validators.ValueInRange(18, 100)
    ]
  }),
  
  // Field with allowed values validation
  role: new Field({ 
    value: '', 
    validators: [
      new Validators.InAllowedValues(['admin', 'user', 'guest'])
    ]
  }),
  
  // Text field with length validation
  bio: new Field({
    value: '',
    validators: [
      new Validators.LengthInRange(10, 200)
    ]
  })
});

// Overall form validity, recomputed whenever any field's valid state changes
const formValid = computed(() => {
  return Object.values(validatedForm.fields).every(field => field.valid);
});

// Function to extract error messages as plain strings, as required by Vuetify's error-messages prop.
// componentBody carries the text of plain-text errors, componentBindings.source the source of markdown ones.
function getErrorMessages(field) {
  if (!field.errors || field.errors.length === 0) return [];
  return field.errors.map(error => error.componentBody || error.componentBindings.source || 'Validation error');
}

// Function to reset the form
function resetForm() {
  validatedForm.fields.username.value = '';
  validatedForm.fields.email.value = '';
  validatedForm.fields.age.value = null;
  validatedForm.fields.role.value = '';
  validatedForm.fields.bio.value = '';
}

// Optional: react to any value change in the form
validatedForm.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('Form value has changed');
  return supr(field, newValue, oldValue);
}));
```

### Vue Template

```vue
<template>
  <div>
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
            hide-details="auto"
          ></v-text-field>
          
          <!-- Email field (Pattern) -->
          <v-text-field
            v-model="validatedForm.fields.email.value"
            label="Email"
            :error-messages="getErrorMessages(validatedForm.fields.email)"
            :loading="validatedForm.fields.email.validating"
            outlined
            hide-details="auto"
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
            hide-details="auto"
          ></v-text-field>
          
          <!-- Role field (InAllowedValues) -->
          <v-select
            v-model="validatedForm.fields.role.value"
            :items="['admin', 'user', 'guest']"
            label="Role"
            :error-messages="getErrorMessages(validatedForm.fields.role)"
            outlined
            hide-details="auto"
          ></v-select>
          
          <!-- Bio field (LengthInRange) -->
          <v-textarea
            v-model="validatedForm.fields.bio.value"
            label="Bio"
            :error-messages="getErrorMessages(validatedForm.fields.bio)"
            outlined
            counter="200"
            hide-details="auto"
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
          class="ml-2"
          @click="resetForm"
        >
          Reset
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>Form Validation Status</v-card-title>
      <v-card-text>
        <p>Form is {{ formValid ? 'valid' : 'invalid' }}</p>
        <pre class="output">{{ JSON.stringify(validatedForm.value, null, 2) }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>
```

## Asynchronous Validation in This Demo

The email field carries an asynchronous validator with a one-second delay, which is longer than the interval between
two keystrokes, so several runs are usually in flight at once. A run is applied only while it is the newest one for the
field: the results belonging to the intermediate values are discarded as they arrive, the field ends with the verdict
for the text actually in it, and `field.validating` — bound to the input's `loading` prop — is back to `false` once the
last run has settled.

The validator resolves in both outcomes and never rejects, which is the shape to copy. A rejected promise delivers no
verdict: the errors that validator had placed on the field are withdrawn and the reason is logged with
`console.error('Validation failed', reason)`, so a failed availability check would look to the user like an address
that is free. Catch the network error inside the validation function and return an error of your own whenever the
failure is something the user should see.

## API Reference

- [Validators](/api/validators) — all built-in validators with signatures and placeholder list
- [Field → errors](/api/field#properties) — `errors`, `valid`, `validating` properties
- [MessagesWidget](/api/components) — renders `field.errors` directly, without converting them to strings

## Key Features Demonstrated

- **Required Validator**: Ensures a field is not empty
- **Pattern Validator**: Validates content against a regular expression (email format)  
- **ValueInRange Validator**: Ensures a numeric value is within specified bounds
- **InAllowedValues Validator**: Restricts input to a predefined set of values
- **LengthInRange Validator**: Validates that the input length is within specified bounds
- **Asynchronous Validation**: A promise-returning validator, `field.validating` as the loading state, and the newest
  run deciding the verdict
- **Form-level Validation**: Tracking overall form validity based on individual field states
- **Error Display**: Showing validation errors to the user

## Try It Yourself

Experiment with the validators by:
1. Leaving fields empty
2. Entering an invalid email address
3. Setting age outside the valid range
4. Selecting different role values
5. Entering text that's too short or too long in the bio field

<script setup>
import ValidatorsFormDemo from '../components/validators-demo.vue';
</script>
