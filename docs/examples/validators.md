# Validators Example

This example demonstrates how to use validators with form fields in `@dynamicforms/vue-forms`.

## Demo

Here's a live demo of form validation using various validators:

<ValidatorsFormDemo />

## Source Code

Here's the source code for the demo above:

### JavaScript/TypeScript

```js
import { Group, Field, ValueChangedAction, Validators } from '@dynamicforms/vue-forms';

// Create a form group with validated fields
const validatedForm = new Group({
  // Required field - cannot be empty
  username: Field.create({ 
    value: '', 
    validators: [new Validators.Required('Username is required')]
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
    value: 18, 
    validators: [
      new Validators.ValueInRange(18, 100, 'Age must be between 18 and 100')
    ]
  }),
  
  // Field with allowed values validation
  role: Field.create({ 
    value: '', 
    validators: [
      new Validators.InAllowedValues(
        ['admin', 'user', 'guest'], 
        'Role must be one of: admin, user, or guest'
      )
    ]
  }),
  
  // Text field with length validation
  bio: Field.create({
    value: '',
    validators: [
      new Validators.LengthInRange(10, 200, 'Bio must be between 10 and 200 characters')
    ]
  })
});

// Create a reactive reference for form output and validation status
const formOutput = validatedForm.reactiveValue;
const formValid = computed(() => {
  return Object.values(validatedForm.fields).every(field => field.valid);
});

// Register a value changed action to update form output display
validatedForm.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
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
            outlined
            hide-details="auto"
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
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>Form Validation Status</v-card-title>
      <v-card-text>
        <p>Form is {{ formValid ? 'valid' : 'invalid' }}</p>
        <pre class="output">{{ JSON.stringify(formOutput, null, 2) }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>
```

## Key Features Demonstrated

- **Required Validator**: Ensures a field is not empty
- **Pattern Validator**: Validates content against a regular expression (email format)  
- **ValueInRange Validator**: Ensures a numeric value is within specified bounds
- **InAllowedValues Validator**: Restricts input to a predefined set of values
- **LengthInRange Validator**: Validates that the input length is within specified bounds
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
import { computed } from 'vue';
import ValidatorsFormDemo from '../components/validators-demo.vue';

function getErrorMessages(field) {
  if (!field.errors || field.errors.length === 0) return [];
  return field.errors.map(error => {
    if (error.componentBody) return error.componentBody;
    if (error.text) return error.text;
    return 'Validation error';
  });
}
</script>
