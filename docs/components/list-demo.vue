<template>
  <div class="list-demo">
    <v-chip-group v-model="shape" mandatory column selected-class="text-primary" class="mb-2">
      <v-chip value="lineItems" filter variant="outlined" title="Every row is a group of fields">Line items</v-chip>
      <v-chip value="tags" filter variant="outlined" title="Every row is a single field">Tags</v-chip>
      <v-chip value="rounds" filter variant="outlined" title="Every row is a list">Score sheet</v-chip>
    </v-chip-group>

    <p class="shape">
      <code>{{ shapes[shape].type }}</code>
    </p>

    <KeepAlive>
      <component :is="shapes[shape].component"></component>
    </KeepAlive>
  </div>
</template>

<script setup>
import { ref } from 'vue';

import ListLineItemsDemo from './list-line-items-demo.vue';
import ListRoundsDemo from './list-rounds-demo.vue';
import ListTagsDemo from './list-tags-demo.vue';

// KeepAlive keeps each list and what was typed into it while another shape is shown
const shapes = {
  lineItems: { type: 'List<Group<{ description, quantity, unitPrice }>>', component: ListLineItemsDemo },
  tags: { type: 'List<Field<string>>', component: ListTagsDemo },
  rounds: { type: 'List<List<Field<number>>>', component: ListRoundsDemo }
};

const shape = ref('lineItems');
</script>

<style scoped>
.list-demo {
  margin: 2rem 0;
}
</style>
