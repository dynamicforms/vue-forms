<template>
  <div>
    <v-card class="mb-4">
      <v-card-title>Score Sheet</v-card-title>
      <v-card-text>
        <div v-for="(round, index) in rounds.items" :key="index" class="round">
          <div class="d-flex align-center">
            <strong>Round {{ index + 1 }}</strong>
            <span class="ml-2 text-medium-emphasis">total {{ total(round) }}</span>
            <v-spacer></v-spacer>
            <v-btn
              icon="mdi-plus"
              variant="text"
              title="Add a score to this round"
              aria-label="Add a score to this round"
              @click="round.push(0)"
            ></v-btn>
            <v-btn
              icon="mdi-delete-outline"
              variant="text"
              title="Remove this round"
              aria-label="Remove this round"
              @click="rounds.remove(index)"
            ></v-btn>
          </div>

          <v-row dense>
            <v-col v-for="(score, position) in round.items" :key="position" cols="6" sm="3">
              <v-text-field
                v-model.number="score.value"
                type="number"
                :label="`Score ${position + 1}`"
                :error-messages="getErrorMessages(score)"
                hide-details="auto"
              >
                <template #append-inner>
                  <v-icon
                    icon="mdi-close"
                    size="small"
                    title="Remove this score"
                    aria-label="Remove this score"
                    @click="round.remove(position)"
                  ></v-icon>
                </template>
              </v-text-field>
            </v-col>
          </v-row>
        </div>

        <p v-if="rounds.length === 0">The sheet has no rounds.</p>
      </v-card-text>

      <v-card-actions>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="rounds.push([0])">Add Round</v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>List Output</v-card-title>
      <v-card-text>
        <p>List is {{ rounds.valid ? 'valid' : 'invalid' }}</p>
        <pre class="output">{{ JSON.stringify(rounds.value) }}</pre>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import { Field, List, Validators } from '../../src'; // from '@dynamicforms/vue-forms'

// A round is a list of scores, and the sheet is a list of rounds: every row of the outer list is a List bound from
// this item template, and every row of a round is a Field bound from the round's item template
const roundTemplate = new List(new Field({ value: 0, validators: [new Validators.MinValue(0)] }));

const rounds = new List(roundTemplate, { value: [[3, 5], [4]] });

// a round's value is an array of numbers, or null while the round holds none
function total(round) {
  return (round.value ?? []).reduce((sum, score) => sum + (Number(score) || 0), 0);
}

// Vuetify's error-messages prop takes strings; the demo shows each error's English detail
function getErrorMessages(field) {
  return field.errors.map((error) => error.detail);
}
</script>

<style scoped>
.round + .round {
  margin-top: 1rem;
}
.output {
  background-color: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>
