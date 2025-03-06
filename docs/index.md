---
layout: home
hero:
  name: DynamicForms Vue
  text: A lightweight, reactive data entry forms library for Vue.js
  tagline: Manage form data and state without dictating your UI components
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/velis74/dynamicforms-vue-forms
features:
  - title: UI-agnostic
    details: Works with any Vue UI components or your custom ones
  - title: Reactive
    details: Built on Vue's reactivity system for seamless integration
  - title: TypeScript Support
    details: Full type definitions for an excellent developer experience
  - title: Nested Structures
    details: Support for complex data with nested fields and groups
---

# @dynamicforms/vue-forms

A lightweight, reactive data entry forms library for Vue.js that handles form state management without dictating your
UI components.

## Introduction

`@dynamicforms/vue-forms` provides a powerful yet simple way to manage form data, validation, and state in Vue 
applications. The library focuses on the logic layer of forms, giving you complete freedom to use any UI components 
you prefer.

Unlike other form libraries that couple data management with specific UI components, `@dynamicforms/vue-forms` 
separates these concerns, allowing you to build forms that match your design system perfectly.

## Interactive Demo

Below is an interactive demo of a simple person form built with `@dynamicforms/vue-forms` and Vuetify. Try toggling the 
field states and see how the form output changes:

<PersonFormDemo />

## Basic Usage Example

Here's a simple example of how to create and use a form with fields and groups:

```typescript
import { Field, Group, ValueChangedAction } from '@dynamicforms/vue-forms';

// Create a form with fields
const personForm = new Group({
  firstName: new Field({ value: 'John' }),
  lastName: new Field({ value: 'Doe' }),
  age: new Field({ value: 30 }),
  active: new Field({ value: true })
});

// Access values
console.log(personForm.value);  // { firstName: 'John', lastName: 'Doe', age: 30, active: true }

// Update a field
personForm.fields.firstName.value = 'Jane';

// Disable a field
personForm.fields.age.enabled = false;

// Form serializes only enabled fields
console.log(personForm.value);  // { firstName: 'Jane', lastName: 'Doe', active: true }
```

<script setup>
import PersonFormDemo from './components/person-form-demo.vue'
</script>
