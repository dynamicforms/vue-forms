# Getting Started

## Introduction & Rationale

Headless form libraries are not scarce. What varies between them is how much of a form's *behaviour* they model,
as opposed to just its state.

`@dynamicforms/vue-forms` treats behaviour between fields as part of the form definition rather than as wiring you
add in your components. A field's visibility, enablement or value can be declared as a condition over other fields.
Every change travels through an action pipeline in which each handler receives the previous one and decides whether
to call it, transform its result, or abort the event outright. Groups and lists compose recursively, so a nested
section or a list row behaves the same way a single field does — and rendering stays entirely yours.

### Design Goals

- **UI-Agnostic**: A logic layer for form state, validation and dynamic behaviour. Works with native HTML controls, Vuetify, Tailwind, or any custom components. The only component the library ships is the optional `MessagesWidget` for rendering validation errors.
- **Fields that react to each other**: Conditional visibility, enablement and values are declared as statements over other fields, and the action pipeline lets a handler intercept, transform or abort an event.
- **Reactive & Type-Safe**: Fields, groups and lists are Vue reactive objects — assign a property and whatever read it re-renders. A group's value type is inferred from the fields it holds, nested structures included.
- **Structural serialization**: A group's value is the shape of its fields, and `Group.createFromFormData()` turns a plain object back into a form.
- **Lightweight**: Depends on Vue and lodash-es, and nothing else.

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
  firstName: new Field({ value: 'John' }),
  lastName: new Field({ value: 'Doe' }),
  age: new Field({ value: 30 }),
  active: new Field({ value: true })
});
```

Every form element — `Field`, `Action`, `Group` and `List` — is created with `new`, and the instance is a Vue
reactive object from that moment on: reading `personForm.value` or `personForm.fields.age.enabled` in a template
tracks it, and plain assignment re-renders.

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
  firstName: new Field({ value: 'John' }),
  lastName: new Field({ value: 'Doe' }),
  age: new Field({ value: 30 }),
  active: new Field({ value: true })
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

const username = new Field({ value: '', validators: [new Validators.Required()] });
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

Coming from 0.5.x? The [migration guide](/guide/migration) lists the breaking changes with before/after code.
