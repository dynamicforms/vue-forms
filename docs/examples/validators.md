# Validators Example

This example demonstrates how to use validators with form fields in `@dynamicforms/vue-forms`.

## Demo

Here's a live demo of form validation using various validators:

<ValidatorsFormDemo />

## Source Code

Here's the source code for the demo above:

### JavaScript/TypeScript

```js
import { interpolate } from '@dynamicforms/translatable';
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  Group,
  Field,
  ValueChangedAction,
  Validators,
  ValidationErrorRenderContent,
  getConfig,
  setConfig,
  translateStrings,
} from '@dynamicforms/vue-forms';

// Translations of the built-in messages. English is the library's default, so it needs no entry; a key a locale
// does not translate keeps its English default too.
const messages = {
  sl: {
    Required: 'Prosimo, vnesite vrednost',
    ValueInRange: 'Vrednost mora biti med **{minValue}** in **{maxValue}**',
    InAllowedValues: 'Mora biti ena od [**{allowedAsText}**]',
    LengthInRange: 'Dolžina mora biti med **{minLength}** in **{maxLength}**',
  },
  de: {
    Required: 'Bitte geben Sie einen Wert ein',
    ValueInRange: 'Der Wert muss zwischen **{minValue}** und **{maxValue}** liegen',
    InAllowedValues: 'Muss einer von [**{allowedAsText}**] sein',
    LengthInRange: 'Die Länge muss zwischen **{minLength}** und **{maxLength}** liegen',
  },
};
const locale = ref('en');

// A translation function shaped like vue-i18n's t: the translation of key with the placeholders substituted, or key
// unchanged where there is none. It reads locale, so every error on screen follows a switch without revalidating.
translateStrings((key, named) => interpolate(messages[locale.value]?.[key] ?? key, named));

// The configuration is reactive, so the errors on screen follow the switch. Each field's message slot renders its
// errors through the globally registered vue-markdown component, so a markdown message shows its emphasis.
const useMarkdown = ref(getConfig().useMarkdownInValidators);
const markdownInitially = useMarkdown.value;
watch(useMarkdown, (value) => setConfig({ useMarkdownInValidators: value }));

// translateStrings and the configuration are global; leave the rest of the documentation as it was
onUnmounted(() => {
  translateStrings((key) => key);
  setConfig({ useMarkdownInValidators: markdownInitially });
});

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

// A group forms its verdict over its members, and busy answers for the whole tree: true while an asynchronous
// validation is in flight anywhere below the group. Both reads are tracked, so these recompute on their own.
const formValid = computed(() => validatedForm.valid);
const formBusy = computed(() => validatedForm.busy);

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
        <v-btn-toggle v-model="locale" mandatory density="compact" color="primary" class="mb-4">
          <v-btn value="en" size="small">English</v-btn>
          <v-btn value="sl" size="small">Slovenščina</v-btn>
          <v-btn value="de" size="small">Deutsch</v-btn>
        </v-btn-toggle>
        <v-switch v-model="useMarkdown" label="Markdown in messages" color="primary" density="compact" />
        <v-form @submit.prevent>
          <!-- Username field (Required) -->
          <v-text-field
            v-model="validatedForm.fields.username.value"
            label="Username"
            :error-messages="getErrorMessages(validatedForm.fields.username)"
            outlined
            hide-details="auto"
          >
            <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
          </v-text-field>
          
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
          >
            <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
          </v-text-field>
          
          <!-- Age field (ValueInRange) -->
          <v-text-field
            v-model.number="validatedForm.fields.age.value"
            type="number"
            label="Age"
            :error-messages="getErrorMessages(validatedForm.fields.age)"
            outlined
            hide-details="auto"
          >
            <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
          </v-text-field>
          
          <!-- Role field (InAllowedValues) -->
          <v-select
            v-model="validatedForm.fields.role.value"
            :items="['admin', 'user', 'guest']"
            label="Role"
            :error-messages="getErrorMessages(validatedForm.fields.role)"
            outlined
            hide-details="auto"
          >
            <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
          </v-select>
          
          <!-- Bio field (LengthInRange) -->
          <v-textarea
            v-model="validatedForm.fields.bio.value"
            label="Bio"
            :error-messages="getErrorMessages(validatedForm.fields.bio)"
            outlined
            counter="200"
            hide-details="auto"
          >
            <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
          </v-textarea>
        </v-form>
      </v-card-text>
      
      <v-card-actions>
        <v-btn
          color="primary"
          :disabled="!formValid || formBusy"
          :loading="formBusy"
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

The submit button reads `validatedForm.valid` and `validatedForm.busy`: the group forms its verdict over its
members, and `busy` is `true` while a run is in flight anywhere below it, so the button is disabled for the length
of the check without anything walking the fields.

The validation function receives an `AbortSignal` as its fourth argument. It aborts the moment the run's verdict
stops counting — a newer keystroke, a validator taken off the field, a transaction rolled back — and a real
availability check hands it to `fetch` so the request is dropped there. The timer this demo awaits has nothing to
cancel and ignores it.

The validator here resolves in both outcomes and never rejects, because the delay it awaits cannot fail. A real
availability check talks to a server and can: an unreachable server is not read as an address that is free — the
rejected run puts a single `Validation could not be completed` error on the field, which leaves it invalid and the
submit button disabled, and the reason is logged with `console.error('Validation failed', reason)`. Catch the network
error inside the validation function only when the user should read something more specific than that message.

## Translated Messages in This Demo

The language buttons switch the built-in messages between English, Slovenian and German. The demo hands
`translateStrings` a translation function over its own small dictionary, written with `interpolate` from
`@dynamicforms/translatable`; with vue-i18n, `translateStrings(i18n.global.t, 'forms')` takes its place. The
function reads `locale`, so the errors already on the fields change language without the fields revalidating. A key
a locale does not translate keeps its English default, and the email field's message, given to its validator
directly, is not translated at all. See [Translation](/guide/getting-started#translation).

The switch sets [`useMarkdownInValidators`](/api/config). The configuration is reactive, so the errors on screen
follow it too: on, the placeholder values are bold; off, the markup is stripped. Each field renders its messages
through the `vue-markdown` component in Vuetify's `message` slot, since the `error-messages` prop shows plain text.

Both settings are global, so the demo restores them when it is unmounted.

## API Reference

- [Validators](/api/validators) — all built-in validators with signatures and placeholder list
- [Field → errors](/api/field#properties) — `errors`, `valid`, `validating` and `busy` properties
- [MessagesWidget](/api/components) — renders `field.errors` directly, without converting them to strings

## Key Features Demonstrated

- **Required Validator**: Ensures a field is not empty
- **Pattern Validator**: Validates content against a regular expression (email format)  
- **ValueInRange Validator**: Ensures a numeric value is within specified bounds
- **InAllowedValues Validator**: Restricts input to a predefined set of values
- **LengthInRange Validator**: Validates that the input length is within specified bounds
- **Asynchronous Validation**: A promise-returning validator, `field.validating` as the loading state, the newest
  run deciding the verdict, and `form.busy` disabling submit while the tree is still deciding
- **Translated Messages**: The built-in messages in three languages, following a locale switch on screen
- **Markdown Setting**: `useMarkdownInValidators` switched at run time
- **Form-level Validation**: Tracking overall form validity based on individual field states
- **Error Display**: Showing validation errors to the user

## Try It Yourself

Experiment with the validators by:
1. Leaving fields empty
2. Entering an invalid email address
3. Setting age outside the valid range
4. Selecting different role values
5. Entering text that's too short or too long in the bio field
6. Switching the language or the markdown setting while errors are showing

<script setup>
import ValidatorsFormDemo from '../components/validators-demo.vue';
</script>
