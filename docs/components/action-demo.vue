<template>
  <div class="action-demo">
    <v-card class="mb-4">
      <v-card-title>Sign-up</v-card-title>
      <v-card-text>
        <v-form @submit.prevent>
          <v-text-field
            v-model="form.fields.name.value"
            label="Name"
            :error-messages="getErrorMessages(form.fields.name)"
            outlined
            hide-details="auto"
          ></v-text-field>

          <v-text-field
            v-model="form.fields.email.value"
            label="Email"
            :error-messages="getErrorMessages(form.fields.email)"
            outlined
            hide-details="auto"
            class="mt-4"
          ></v-text-field>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-btn
          color="primary"
          :prepend-icon="save.icon"
          :disabled="!save.enabled || save.busy"
          :loading="save.busy"
          @click="submit"
        >
          {{ save.label }}
        </v-btn>
        <v-btn color="secondary" class="ml-2" :disabled="save.busy" @click="reset">Reset</v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>Action State</v-card-title>
      <v-card-text>
        <p>Form is {{ form.valid ? 'valid' : 'invalid' }}, save is
          {{ save.enabled ? 'enabled' : 'disabled' }}{{ save.busy ? ' and busy' : '' }}</p>
        <pre class="output">{{ log.length ? log.join('\n') : 'Fill both fields, then submit' }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import {
  Action,
  ConditionalEnabledAction,
  ExecuteAction,
  Field,
  Group,
  Operator,
  Statement,
  ValidChangedAction,
  Validators,
} from '../../src'; // from '@dynamicforms/vue-forms'

const log = ref([]);

function report(message) {
  log.value = [...log.value, message].slice(-6);
}

// The form the action submits
const form = new Group({
  name: new Field({ value: '', validators: [new Validators.Required()] }),
  email: new Field({
    value: '',
    validators: [new Validators.Pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Please enter a valid email address')],
  }),
});

// Validity is a verdict rather than a value, and a Statement reads values, so the form's verdict is mirrored
// into a field the statement can read.
const formValid = new Field({ value: false });
form.registerAction(
  new ValidChangedAction((field, supr, newValid, oldValid) => {
    formValid.value = newValid;
    return supr(field, newValid, oldValid);
  }),
);

// The action: a label, an icon, the condition that enables it and the handler that runs
const save = new Action({
  value: { label: 'Submit', icon: 'mdi-content-save' },
  actions: [
    new ConditionalEnabledAction(new Statement(formValid, Operator.EQUALS, true)),
    new ExecuteAction(async (field, supr, params) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (params.email.endsWith('@example.com')) throw new Error('example.com addresses are not accepted');
      return `registered ${params.email}`;
    }),
  ],
});

async function submit() {
  try {
    report(await save.execute(form.value));
  } catch (error) {
    report(`submit failed: ${error.message}`);
  }
}

function reset() {
  form.value = { name: '', email: '' };
}

// Function to extract error messages as plain strings, as required by Vuetify's error-messages prop.
// componentBody carries the text of plain-text errors, componentBindings.source the source of markdown ones.
function getErrorMessages(field) {
  if (field.errors.length === 0) return [];
  return field.errors.map((error) => error.componentBody || error.componentBindings.source || 'Validation error');
}
</script>

<style scoped>
.action-demo {
  margin: 2rem 0;
}
.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
