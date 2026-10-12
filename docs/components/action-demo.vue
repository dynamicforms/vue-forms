<template>
  <div class="action-demo">
    <v-card class="mb-4">
      <v-card-title>Sign-up</v-card-title>
      <v-card-text>
        <!-- Enter and Escape find the form's submit and cancel actions through confirm() and reject() -->
        <v-form @submit.prevent @keydown.enter.prevent="confirm" @keydown.esc="reject">
          <v-text-field
            v-model="form.fields.name.value"
            label="Name"
            :error-messages="getErrorMessages(form.fields.name)"
            :disabled="!form.fields.name.effectiveEnabled"
            hide-details="auto"
            @update:focused="(focused) => focused || (form.fields.name.touched = true)"
          ></v-text-field>

          <v-text-field
            v-model="form.fields.email.value"
            label="Email"
            :error-messages="getErrorMessages(form.fields.email)"
            :disabled="!form.fields.email.effectiveEnabled"
            hint="An @example.com address fails on the server"
            persistent-hint
            hide-details="auto"
            class="mt-4"
            @update:focused="(focused) => focused || (form.fields.email.touched = true)"
          ></v-text-field>
        </v-form>
      </v-card-text>

      <!-- the actions bar: every action of the group, rendered from its label, icon and executable -->
      <v-card-actions>
        <v-btn
          v-for="(action, name) in form.fields.actions.fields"
          :key="name"
          :prepend-icon="action.icon"
          :disabled="!action.executable"
          :loading="action.busy"
          @click="run(action)"
        >
          {{ action.label }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>Action State</v-card-title>
      <v-card-text>
        <p>
          Form is {{ form.valid ? 'valid' : 'invalid' }} and {{ form.isChanged ? 'changed' : 'unchanged' }};
          Submit is {{ submit.executable ? 'executable' : 'not executable' }}{{ submit.busy ? ' and busy' : '' }}
        </p>
        <v-btn variant="text" size="small" class="my-2" @click="run(submit)">
          Call submit.execute() directly
        </v-btn>
        <pre class="output">{{ log.length ? log.join('\n') : 'Fill both fields, then submit' }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  Action,
  type CommandException,
  type FieldBase,
  Field,
  Group,
  RejectAction,
  SubmitAction,
  SubmitFailedException,
  SubmitRefusedException,
  type SubmitResult,
  ValidationError,
  Validators,
} from '../../src'; // from '@dynamicforms/vue-forms'

interface Registration {
  name: string;
  email: string;
}

const log = ref<string[]>([]);

function report(message: string) {
  log.value = [...log.value, message].slice(-6);
}

// The submit handler stands in for a server: it stores the record and returns it as stored, or rejects the address
// and reports the error for the email field
async function register(value: Registration): Promise<Registration> {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  if (value.email.endsWith('@example.com')) {
    const email = form.fields.email;
    email.errors = [
      ...email.errors,
      new ValidationError('email_rejected', {}, 'example.com addresses are not accepted', 'server'),
    ];
    throw new Error('the server rejected the address');
  }
  return { name: value.name.trim(), email: value.email.toLowerCase() };
}

// The target of both actions is the form: an action's parent is the actions bar, whose parent is the form
const target = (action: FieldBase) => action.parent?.parent;

const form = new Group({
  name: new Field({ value: '', validators: [new Validators.Required()] }),
  email: new Field({
    value: '',
    validators: [
      new Validators.Pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, {
        code: 'invalid_email',
        detail: 'Please enter a valid email address',
      }),
    ],
  }),
  actions: new Group({
    submit: new Action({
      value: { label: 'Submit', icon: 'mdi-content-save', defaultConfirm: true },
      actions: [new SubmitAction(target, register)],
    }),
    cancel: new Action({
      value: { label: 'Cancel', icon: 'mdi-undo', defaultReject: true },
      actions: [new RejectAction(target)],
    }),
  }),
});

const submit = form.fields.actions.fields.submit;

// The text of every outcome a run of either action resolves with
function describe(result: SubmitResult<Registration> | CommandException | null | undefined): string {
  if (result === undefined) return 'nothing executed: no executable action';
  if (result instanceof SubmitRefusedException) return `SubmitRefusedException, reason '${result.reason}'`;
  if (result instanceof SubmitFailedException) {
    return `SubmitFailedException: ${result.cause instanceof Error ? result.cause.message : String(result.cause)}`;
  }
  if (result === null || !('received' in result)) return 'Cancel: the form is back at its baseline';
  return `SubmitResult: sent ${JSON.stringify(result.sent)}, received ${JSON.stringify(result.received)}`;
}

// A run rejects only where something other than the submit fails, such as a target callback that returns nothing
async function settle(running: Promise<any> | undefined) {
  try {
    report(describe(await running));
  } catch (error) {
    report(`execute() rejected: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const run = (action: Action) => settle(action.execute());
const confirm = () => settle(form.confirm());
const reject = () => settle(form.reject());

// Vuetify's error-messages prop takes strings; the demo shows each error's English detail
function getErrorMessages(field: FieldBase) {
  return field.errors.map((error) => error.detail);
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
