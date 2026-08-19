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
      link: https://github.com/dynamicforms/vue-forms
features:
  - title: UI-agnostic
    details: A logic layer for form state, validation and the behaviour between fields. Any Vue components render it, your own included
  - title: Transactional
    details: Every mutating operation is atomic — events are announced once over the net change, and a handler that throws leaves the form exactly as it was
  - title: Lists that scale
    details: A list is meant to hold thousands of rows. What an operation costs depends on what it touches, not on how long the list is
  - title: Declared once, bound per record
    details: A group is the declaration every row of a list is built from — one validator instance, one conditional rule, and each row answers for itself
---

# @dynamicforms/vue-forms

A lightweight, reactive data entry forms library for Vue.js that handles form state management without dictating your
UI components.

## Introduction

`@dynamicforms/vue-forms` manages form data, validation and state, and leaves rendering entirely to you. Every
member of a field, group or list is a tracked read, so a template that reads `field.value` re-renders when
something writes it — there is no `ref` to unwrap and no computed mirror to keep in sync.

What it models beyond state is the behaviour *between* fields. Visibility, enablement and values are declared as
conditions over other fields, and every change travels through an action pipeline in which each handler decides
whether to pass the event on and may reshape its result. Groups and lists compose recursively, so the same
mechanism applies at every level of a nested form.

### Every operation is a transaction

A change is announced once, when the operation carrying it finishes, over the net difference. Several writes
wrapped in a `transaction()` announce as one, and a handler that throws rolls the whole operation back rather than
leaving the form half-applied:

```typescript
import { transaction } from '@dynamicforms/vue-forms';

transaction(() => {
  personForm.fields.firstName.value = 'Jane';
  personForm.fields.lastName.value = 'Novak';
});
// one ValueChangedAction on the form, not two — and none at all if either write throws
```

`tx.rollback()` unwinds a transaction without an error, which is what lets an edit be applied, measured and
withdrawn. See [Transactions](/api/transactions).

### Lists hold thousands of rows

Writing one field of one row costs that row and the depth of the nesting it sits in; `push()`, `insert()`,
`remove()` and `pop()` cost one row; reading `value` or `valid` again with nothing changed in between costs
nothing, because both are cached and the write itself invalidates them. See [Scale](/api/list#scale).

### One declaration, one rule, every row

The `Group` handed to `new List(template)` is not a row — it is the declaration every row is built from, and a
row is a binding of it. A validator or a conditional action registered on the template is one instance serving
every row, and each row answers for itself: two rows disagreeing about a condition show two different verdicts,
and a `CompareTo` compares that row's own fields. See [The model](/guide/model).

## Interactive Demo

Below is an interactive demo of a simple person form built with `@dynamicforms/vue-forms` and Vuetify. Try toggling the 
field states and see how the form output changes:

<PersonFormDemo />

## Basic Usage Example

Here's a simple example of how to create and use a form with fields and groups:

```typescript
import { Field, Group } from '@dynamicforms/vue-forms';

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
