<template>
  <div class="person-form-demo">
    <v-card class="mb-4">
      <v-card-title>Person Form</v-card-title>
      <v-card-text>
        <v-form @submit.prevent>
          <v-row v-for="(field, name) in personForm.fields" :key="name" dense align="center">
            <v-col cols="12" sm="6">
              <div v-if="field.visibility !== 'suppress'" :style="visibilityStyle[field.visibility]">
                <v-switch
                  v-if="field.extra.input === 'switch'"
                  v-model="field.value"
                  :label="field.extra.label"
                  :disabled="!field.enabled"
                  color="primary"
                  hide-details
                ></v-switch>
                <v-text-field
                  v-else-if="field.extra.input === 'number'"
                  v-model.number="field.value"
                  type="number"
                  :label="field.extra.label"
                  :readonly="field.access === 'readonly'"
                  :disabled="!field.enabled && field.access !== 'readonly'"
                  hide-details
                ></v-text-field>
                <v-text-field
                  v-else
                  v-model="field.value"
                  :label="field.extra.label"
                  :hint="field.extra.hint"
                  :readonly="field.access === 'readonly'"
                  :disabled="!field.enabled && field.access !== 'readonly'"
                  :error-messages="field.errors.map((error) => error.detail)"
                  hide-details="auto"
                  persistent-hint
                ></v-text-field>
              </div>
            </v-col>
            <v-col cols="6" sm="3">
              <v-select v-model="field.access" :items="accessValues" label="access" density="compact" hide-details />
            </v-col>
            <v-col cols="6" sm="3">
              <v-select
                v-model="field.visibility"
                :items="visibilityValues"
                label="visibility"
                density="compact"
                hide-details
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-card-actions>
        <v-btn color="primary" :disabled="!personForm.isChanged" @click="save">Save</v-btn>
        <v-btn color="secondary" :disabled="!personForm.isChanged" @click="reset">Reset</v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>Form Output</v-card-title>
      <v-card-text>
        <p>
          Form is {{ personForm.valid ? 'valid' : 'invalid' }} and {{ personForm.isChanged ? 'changed' : 'unchanged' }}
        </p>
        <pre class="output">{{ JSON.stringify(personForm.value, null, 2) }}</pre>
        <p class="mt-4">Events</p>
        <pre class="output">{{ events.length ? events.join('\n') : 'Edit a value, an access or a visibility' }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  AccessChangedAction,
  AccessChangingAction,
  accessValues,
  ContributionChangedAction,
  Field,
  Group,
  ValueChangedAction,
  Validators,
  VisibilityChangedAction,
  VisibilityChangingAction,
  visibilityValues,
} from '../../src'; // from '@dynamicforms/vue-forms'

// The data the template renders each field with, declared as the fields' extended properties
interface Presentation {
  label: string;
  hint?: string;
  input?: 'number' | 'switch';
}

const personForm = new Group({
  firstName: new Field<string, Presentation>({
    value: 'John',
    label: 'First Name',
    hint: 'Required',
    validators: [new Validators.Required()],
  }),
  lastName: new Field<string, Presentation>({ value: 'Doe', label: 'Last Name' }),
  age: new Field<number, Presentation>({ value: 30, label: 'Age', input: 'number' }),
  active: new Field<boolean, Presentation>({ value: true, label: 'Active', input: 'switch' }),
});

// How the template applies each visibility; a 'suppress' field is not rendered
const visibilityStyle = {
  full: {},
  invisible: { visibility: 'hidden' },
  hidden: { display: 'none' },
  suppress: {},
} as const;

// The last few events, newest last
const events = ref<string[]>([]);

function logEvent(message: string) {
  events.value = [...events.value, message].slice(-8);
}

const shown = (value: unknown) => (value === undefined ? 'nothing' : JSON.stringify(value));

// The same handlers on every field: each reports the field, the event and its two values
Object.values(personForm.fields).forEach((field) => {
  field.registerAction(new ValueChangedAction((f, supr, newValue, oldValue) => {
    logEvent(`${f.fieldName}: ValueChanged ${shown(oldValue)} → ${shown(newValue)}`);
    return supr(f, newValue, oldValue);
  }));
  field.registerAction(new ContributionChangedAction((f, supr, newValue, oldValue) => {
    logEvent(`${f.fieldName}: ContributionChanged ${shown(oldValue)} → ${shown(newValue)}`);
    return supr(f, newValue, oldValue);
  }));
  field.registerAction(new AccessChangingAction((f, supr, newValue, oldValue) => {
    logEvent(`${f.fieldName}: AccessChanging ${oldValue} → ${newValue}`);
    return supr(f, newValue, oldValue);
  }));
  field.registerAction(new AccessChangedAction((f, supr, newValue, oldValue) => {
    logEvent(`${f.fieldName}: AccessChanged ${oldValue} → ${newValue}`);
    return supr(f, newValue, oldValue);
  }));
  field.registerAction(new VisibilityChangingAction((f, supr, newValue, oldValue) => {
    logEvent(`${f.fieldName}: VisibilityChanging ${oldValue} → ${newValue}`);
    return supr(f, newValue, oldValue);
  }));
  field.registerAction(new VisibilityChangedAction((f, supr, newValue, oldValue) => {
    logEvent(`${f.fieldName}: VisibilityChanged ${oldValue} → ${newValue}`);
    return supr(f, newValue, oldValue);
  }));
});

// Save stands in for a server that stores what the form sends: the stored record becomes the new baseline
function save() {
  personForm.rebind(personForm.value);
}

// Reset puts the data back to the baseline; access and visibility stay as they are
function reset() {
  personForm.rebind(personForm.originalValue);
}
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
