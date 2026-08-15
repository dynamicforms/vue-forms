# Getting Started

## Introduction & Rationale

Most form management libraries for Vue either couple state management directly to specific UI components or enforce opinionated template structures.

`@dynamicforms/vue-forms` was created as a headless, logic-first form state management library. It decouples form logic, validation, dynamic actions, and data structures from rendering, giving you full control over your UI and component choices.

### Design Goals

- **UI-Agnostic**: Pure logic layer for form state, validation, and dynamic behavior. Works with native HTML controls, Vuetify, Tailwind, or any custom components.
- **Reactive & Type-Safe**: Native integration with Vue 3 reactivity and TypeScript for automatic type inference across fields and nested forms.
- **Dynamic & Compositional**: First-class support for nested groups, dynamic lists, conditional visibility/enablement, and extensible action event pipelines.
- **Lightweight & Predictable**: Zero runtime dependencies (beyond Vue and lodash-es), transparent serialization, and clean lifecycle management.

## Installation

```bash
npm install @dynamicforms/vue-forms
```

### Stylesheet

The library ships a small stylesheet used by `MessagesWidget`. It is not bundled into the JavaScript, so import it
once in your app entry point if you use that component:

```typescript
import '@dynamicforms/vue-forms/style.css';
```

Everything else — `Field`, `Group`, `List`, validators, actions — is UI-agnostic and needs no styles.

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

Fields are created with the static factory `Field.create()` (the constructor is guarded and throws), while `Group` and
`List` are created with `new`.

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

A disabled field silently ignores writes to `value` and is omitted from `group.value` (use `group.fullValue` if you
need every field regardless of `enabled`).

## Validation

Attach validators to a field and render the resulting errors with the `MessagesWidget` component:

```vue
<template>
  <input v-model="username.value" />
  <messages-widget
    v-if="username.touched && username.errors.length > 0"
    :message="username.errors"
    classes="text-error"
  />
</template>

<script setup>
import { Field, MessagesWidget, Validators } from '@dynamicforms/vue-forms';

const username = Field.create({ value: '', validators: [new Validators.Required()] });
</script>
```

Validators run eagerly — the field above is already invalid right after creation, because it has no value. That is why
the template checks `touched` before showing the errors.

## Plugin Setup

The library ships a Vue plugin for its global options:

```typescript
import { forms } from '@dynamicforms/vue-forms';

app.use(forms, { useMarkdownInValidators: false });
```

By default the built-in validators produce markdown messages, which `MessagesWidget` renders through a globally
registered `vue-markdown` component. Set `useMarkdownInValidators` to `false` if you don't have one.

## Next Steps

Check out the [Examples](/examples/basic-form) section to see more advanced usage patterns, or read the API reference:
[Field](/api/field), [Group](/api/group), [Validators](/api/validators) and [Configuration](/api/config).
