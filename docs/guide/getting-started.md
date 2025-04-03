# Getting Started

## Installation

```bash
npm install @dynamicforms/vue-forms
```

## Basic Usage

Here's how to create a simple form with `@dynamicforms/vue-forms`:

```typescript
import { Field, Group } from '@dynamicforms/vue-forms';

// Create a form with fields
const personForm = new Group({
  firstName: Field.create({ value: 'John' }),
  lastName: Field.create({ value: 'Doe' }),
  age: Field.create({ value: 30 }),
  active: Field.create({ value: true })
});
```

## Using with Vue Components

You can bind the form fields to any Vue component:

```vue
<template>
  <form>
    <input v-model="personForm.fields.firstName.value" />
    <input v-model="personForm.fields.lastName.value" />
    <input 
      type="number" 
      v-model.number="personForm.fields.age.value" 
      :disabled="!personForm.fields.age.enabled" 
    />
    <input type="checkbox" v-model="personForm.fields.active.value" />
  </form>
</template>

<script setup>
import { Field, Group } from '@dynamicforms/vue-forms';

const personForm = new Group({
  firstName: Field.create({ value: 'John' }),
  lastName: Field.create({ value: 'Doe' }),
  age: Field.create({ value: 30 }),
  active: Field.create({ value: true })
});
</script>
```

## Next Steps

Check out the [Examples](/examples/basic-form) section to see more advanced usage patterns, or dive into the documentation to learn 
about all available features.
