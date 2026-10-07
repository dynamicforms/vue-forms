<template>
  <div class="validators-form-demo">
    <v-card class="mb-4">
      <v-card-title>Validators Demo</v-card-title>
      <v-card-text>
        <div class="locales mb-4">
          <v-btn-toggle v-model="locale" mandatory variant="outlined" divided color="primary">
            <v-btn value="en" size="small">🇺🇸 English</v-btn>
            <v-btn value="sl" size="small">🇸🇮 Slovenščina</v-btn>
            <v-btn value="de" size="small">🇩🇪 Deutsch</v-btn>
            <v-btn value="es" size="small">🇪🇸 Español</v-btn>
            <v-btn value="ja" size="small">🇯🇵 日本語</v-btn>
            <v-btn value="zh" size="small">🇨🇳 中文</v-btn>
          </v-btn-toggle>
        </div>
        <v-switch v-model="useMarkdown" label="Markdown in messages" color="primary" density="compact" />
        <v-form @submit.prevent>
          <!-- Username field (Required) -->
          <v-text-field
            v-model="validatedForm.fields.username.value"
            label="Username"
            :error-messages="getErrorMessages(validatedForm.fields.username)"
            outlined
            class="mb-2"
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
            class="mb-2"
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
            class="mb-2"
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
            class="mb-2"
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
        <pre class="output">{{ JSON.stringify(validatedForm.value, null, 2) }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
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
} from '../../src'; // from '@dynamicforms/vue-forms'

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
  es: {
    Required: 'Introduzca un valor',
    ValueInRange: 'El valor debe estar entre **{minValue}** y **{maxValue}**',
    InAllowedValues: 'Debe ser uno de [**{allowedAsText}**]',
    LengthInRange: 'La longitud debe estar entre **{minLength}** y **{maxLength}**',
  },
  ja: {
    Required: '値を入力してください',
    ValueInRange: '値は **{minValue}** から **{maxValue}** の間でなければなりません',
    InAllowedValues: '[**{allowedAsText}**] のいずれかでなければなりません',
    LengthInRange: '長さは **{minLength}** から **{maxLength}** の間でなければなりません',
  },
  zh: {
    Required: '请输入一个值',
    ValueInRange: '值必须介于 **{minValue}** 和 **{maxValue}** 之间',
    InAllowedValues: '必须是 [**{allowedAsText}**] 之一',
    LengthInRange: '长度必须介于 **{minLength}** 和 **{maxLength}** 之间',
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
</script>

<style scoped>
.validators-form-demo {
  margin: 2rem 0;
}
.locales {
  overflow-x: auto;
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
