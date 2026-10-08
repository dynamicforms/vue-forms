<template>
  <div>
    <v-card class="mb-4">
      <v-card-title>Tags</v-card-title>
      <v-card-text>
        <v-row v-for="(tag, index) in tags.items" :key="index" align="start" dense>
          <v-col cols="10" sm="6">
            <v-text-field
              v-model="tag.value"
              :label="`Tag ${index + 1}`"
              :error-messages="getErrorMessages(tag)"
              hide-details="auto"
            ></v-text-field>
          </v-col>

          <v-col cols="2" sm="2" class="d-flex align-center">
            <v-btn
              icon="mdi-delete-outline"
              variant="text"
              title="Remove this tag"
              aria-label="Remove this tag"
              @click="tags.remove(index)"
            ></v-btn>
          </v-col>
        </v-row>

        <p v-if="tags.length === 0">The ticket has no tags.</p>
      </v-card-text>

      <v-card-actions>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="tags.push('')">Add Tag</v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>List Output</v-card-title>
      <v-card-text>
        <p>List is {{ tags.valid ? 'valid' : 'invalid' }}</p>
        <pre class="output">{{ JSON.stringify(tags.value, null, 2) }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import { Field, List, Validators } from '../../src'; // from '@dynamicforms/vue-forms'

// Every row is a Field bound from this template, so the value is an array of strings and every tag carries the
// Required validator
const tags = new List(new Field({ value: '', validators: [new Validators.Required()] }), {
  value: ['urgent', 'billing']
});

// Vuetify's error-messages prop takes strings; the demo shows each error's English detail
function getErrorMessages(field) {
  return field.errors.map((error) => error.detail);
}
</script>

<style scoped>
.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
