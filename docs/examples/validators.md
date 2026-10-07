# Validators Example

This example demonstrates how to use validators with form fields in `@dynamicforms/vue-forms`.

## Demo

Here's a live demo of form validation using various validators. It also shows the application rendering the
validators' errors itself: [translated](#translated-messages-in-this-demo) into eight languages and with or without
markdown. The errors already on the fields follow either choice without revalidating.

<ValidatorsFormDemo />

## Source Code

Here's the source code for the demo above:

### JavaScript/TypeScript

```js
import { formatParams, interpolate } from '@dynamicforms/translatable';
import { computed, onUnmounted, ref } from 'vue';
import {
  Group,
  Field,
  MdString,
  ValueChangedAction,
  Validators,
  ValidationError,
  getConfig,
  setConfig,
} from '@dynamicforms/vue-forms';

import messages from './validators-demo.messages.json';

const locales = [
  { value: 'en', title: '🇬🇧 English' },
  { value: 'sl', title: '🇸🇮 Slovenščina' },
  { value: 'de', title: '🇩🇪 Deutsch' },
  { value: 'es', title: '🇪🇸 Español' },
  { value: 'ja', title: '🇯🇵 日本語' },
  { value: 'zh', title: '🇨🇳 中文' },
  { value: 'fa', title: '🇮🇷 فارسی' },
  { value: 'bn', title: '🇧🇩 বাংলা' },
];
const locale = ref('en');
const useMarkdown = ref(false);

// The demo's own text: labels, hints and the messages it gives its own validators
const text = computed(() => messages[locale.value].ui);

// A role is stored as its code and shown by its name in the current language
const roles = ['admin', 'user', 'guest'];
const roleName = (role) => messages[locale.value].roles[role];
const roleItems = computed(() => roles.map((value) => ({ value, title: roleName(value) })));

// The demo's translation function: the message for an error code with the params substituted, or the code
// unchanged where the current language has none
const t = (code, params) => {
  const template = messages[locale.value].errors[code];
  return template ? interpolate(template, params) : code;
};

// formatParams formats every param before t substitutes it: numbers in the language's digits, and in bold where the
// demo shows markdown
const translate = formatParams(t, (value) => {
  const shown = typeof value === 'number' ? new Intl.NumberFormat(locale.value).format(value) : String(value);
  return useMarkdown.value ? `**${shown}**` : shown;
});

// errorText renders every error a built-in validator states by code: the demo's own message for it, as markdown where
// the checkbox says so. The only list of allowed values in the demo is the roles, named here by the demo rather than by
// their codes. A code the demo has no message for keeps the library's English detail. errorText is read on every
// render of an error, so the errors already on the fields follow the language and the checkbox without revalidating.
const previousErrorText = getConfig().errorText;
setConfig({
  errorText: (error) => {
    const params =
      error.code === 'in_allowed_values'
        ? { allowedAsText: error.params.allowedValues.map(roleName).join(', ') }
        : error.params;
    const message = translate(error.code, params);
    if (message === error.code) return undefined;
    return useMarkdown.value ? new MdString(message) : message;
  },
});
// the configuration is global; leave the rest of the documentation as it was
onUnmounted(() => setConfig({ errorText: previousErrorText }));

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
        computed(() => text.value.invalidEmail),
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
          return [new ValidationError(computed(() => text.value.emailTaken))];
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
      new Validators.InAllowedValues(roles)
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

### Translations

The demo's text lives in `validators-demo.messages.json`, one block per language: `errors` keyed by the code a
built-in validator states, `roles` keyed by the stored role, and `ui` for the demo's own labels. An excerpt:

```json
{
  "sl": {
    "errors": {
      "required": "Prosimo, vnesite vrednost",
      "value_in_range": "Vrednost mora biti med {minValue} in {maxValue}",
      "in_allowed_values": "Mora biti ena od [{allowedAsText}]",
      "length_in_range": "Dolžina mora biti med {minLength} in {maxLength}"
    },
    "roles": {
      "admin": "Skrbnik",
      "user": "Uporabnik",
      "guest": "Gost"
    },
    "ui": {
      "title": "Demo validatorjev",
      "username": "Uporabniško ime",
      "age": "Starost",
      "role": "Vloga",
      …
    }
  },
  "de": { … }
}
```

### Vue Template

```vue
<template>
  <div class="validators-form-demo">
    <v-locale-provider :rtl="text.rtl ?? false">
      <v-card class="mb-4">
        <v-card-title>{{ text.title }}</v-card-title>
        <v-card-subtitle class="intro">{{ text.intro }}</v-card-subtitle>
        <v-card-text>
          <div class="settings mb-2">
            <v-select
              v-model="locale"
              :items="locales"
              density="compact"
              hide-details
              class="locale"
            ></v-select>
            <v-checkbox v-model="useMarkdown" :label="text.markdown" color="primary" density="compact" hide-details />
          </div>
          <v-form @submit.prevent>
            <!-- Username field (Required) -->
            <v-text-field
              v-model="validatedForm.fields.username.value"
              :label="text.username"
              :error-messages="getErrorMessages(validatedForm.fields.username)"
              outlined
              class="mb-2"
            >
              <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
            </v-text-field>

            <!-- Email field (Pattern) -->
            <v-text-field
              v-model="validatedForm.fields.email.value"
              :label="text.email"
              :error-messages="getErrorMessages(validatedForm.fields.email)"
              :loading="validatedForm.fields.email.validating"
              outlined
              class="mb-2"
              :hint="text.emailHint"
              persistent-hint
            >
              <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
            </v-text-field>

            <!-- Age field (ValueInRange) -->
            <v-text-field
              v-model.number="validatedForm.fields.age.value"
              type="number"
              :label="text.age"
              :error-messages="getErrorMessages(validatedForm.fields.age)"
              outlined
              class="mb-2"
            >
              <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
            </v-text-field>

            <!-- Role field (InAllowedValues) -->
            <v-select
              v-model="validatedForm.fields.role.value"
              :items="roleItems"
              :label="text.role"
              :error-messages="getErrorMessages(validatedForm.fields.role)"
              outlined
              class="mb-2"
            >
              <template #message="{ message }"><vue-markdown :source="message" class="demo-message" /></template>
            </v-select>

            <!-- Bio field (LengthInRange) -->
            <v-textarea
              v-model="validatedForm.fields.bio.value"
              :label="text.bio"
              :error-messages="getErrorMessages(validatedForm.fields.bio)"
              outlined
              counter="200"
              class="mb-2"
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
            {{ text.submit }}
          </v-btn>
          <v-btn
            color="secondary"
            @click="resetForm"
            class="ml-2"
          >
            {{ text.reset }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-card>
        <v-card-title>{{ text.status }}</v-card-title>
        <v-card-text>
          <v-alert
            :type="formValid ? 'success' : 'error'"
            class="mb-3"
          >
            {{ formValid ? text.valid : text.invalid }}
          </v-alert>
          <pre class="output" dir="ltr">{{ JSON.stringify(validatedForm.value, null, 2) }}</pre>
        </v-card-text>
      </v-card>
    </v-locale-provider>
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

The language selector switches the demo between English, Slovenian, German, Spanish, Japanese, Chinese, Persian and
Bengali. The library takes no part in it: every built-in validator reports its failure as a `code`, `params` and an
English `detail`, and the demo renders the error itself through [`errorText`](/api/config).

- **Messages.** `errorText` looks the error's code up under `errors` in the current language and substitutes the
  params with `interpolate` from `@dynamicforms/translatable`. A code the language has no message for keeps the
  library's English detail.
- **Numbers.** `formatParams`, from the same package, formats the params before they are substituted: numbers go
  through `Intl.NumberFormat` for the language, so Persian and Bengali show the age range in their own digits.
- **Role names.** A role is stored as its code, `guest`, and the error's params carry the codes in `allowedValues`.
  The demo names them from `roles`, for the message and for the select's items alike.
- **Markdown.** With the checkbox on, the formatting wraps each value in `**` and `errorText` answers an `MdString`,
  which each field renders through the `vue-markdown` component in Vuetify's `message` slot, since the
  `error-messages` prop shows plain text. With it off, the message is plain text, values as they are.

`errorText` reads the language and the checkbox on every render of an error, so the errors already on the fields
change without the fields revalidating. The labels, the hint and the messages the demo gives its own email
validators come from `ui`; a message given to a validator as a `computed` follows the language the same way.

Persian is written right to left: the demo wraps itself in Vuetify's `v-locale-provider` with `rtl` set for it, and
the Persian message for `in_allowed_values` isolates the list with U+2068 and U+2069, so its brackets stay in place.

`errorText` is global, so the demo restores the previous one when it is unmounted. See
[Error messages and translation](/guide/getting-started#error-messages-and-translation).

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
- **Translated Messages**: The validators' errors rendered by the application through `errorText`, in eight
  languages, numbers in the language's digits, following a language switch on screen
- **Markdown**: The application answering an `MdString` where it wants markdown
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
