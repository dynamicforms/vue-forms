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

<script setup>
import { formatParams, interpolate } from '@dynamicforms/translatable';
import { computed, ref } from 'vue';
import {
  Group,
  Field,
  ValueChangedAction,
  Validators,
  ValidationError,
} from '../../src'; // from '@dynamicforms/vue-forms'

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

// The text of an error: the demo's message for its code in the current language, with the params substituted. The
// only list of allowed values in the demo is the roles, named by the demo rather than by their codes. A code the demo
// has no message for shows the error's English detail. The function is called on every render, so the errors already
// on the fields follow the language and the checkbox without revalidating.
function errorText(error) {
  const params =
    error.code === 'in_allowed_values'
      ? { allowedAsText: error.params.allowedValues.map(roleName).join(', ') }
      : error.params;
  const message = translate(error.code, params);
  return message === error.code ? error.detail : message;
}

// Vuetify's error-messages prop takes strings; the message slot renders each one as markdown
const getErrorMessages = (field) => field.errors.map(errorText);

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
        { code: 'invalid_email', detail: 'Please enter a valid email address' },
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
          return [new ValidationError('email_taken', {}, 'This email address is already taken')];
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
</script>

<style scoped>
.validators-form-demo {
  margin: 2rem 0;
}
.intro {
  white-space: normal;
}
.settings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 1rem;
}
.locale {
  flex: 0 1 14rem;
}
.demo-message :deep(p) {
  margin: 0;
}
.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
