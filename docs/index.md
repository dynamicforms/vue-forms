---
layout: home
hero:
  name: Vue Forms
  text: Reactive forms and application state for Vue.js
  tagline: Validation, rules between fields and transactions, without dictating your UI components
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: The model
      link: /guide/model
    - theme: alt
      text: View on GitHub
      link: https://github.com/dynamicforms/vue-forms
features:
  - title: UI-agnostic
    details: A logic layer for form state, validation and the behaviour between fields. Any Vue components render it, your own included
    link: /guide/rationale#what-the-library-carries-for-the-interface
    linkText: What it carries for the interface
  - title: Transactional
    details: Every mutating operation is atomic. Events are announced once, over the net change, and a handler that throws leaves the form unchanged
  - title: Validation that composes
    details: Built-in and custom rules, synchronous or asynchronous, comparing fields within a record; errors contain a code and render as text, markdown or your own component
  - title: Application state, not only forms
    details: The same elements also hold state that no screen displays, with per-value reactivity, transactions and validation; view() reads it as plain data
    link: /guide/cookbook#application-state
    linkText: A shopping cart as application state
  - title: Lists that scale
    details: A list is designed to hold thousands of rows. The cost of an operation depends on the rows it changes, not on the length of the list
  - title: Declared once, bound per record
    details: A list's item template is the declaration every row is built from. One validator instance and one conditional rule serve every row, and each row has its own result
  - title: Extended properties
    details: A field holds the data your UI needs to render it (a label, a hint, a width), declared as a type and checked by the compiler
---

# @dynamicforms/vue-forms

A reactive library for Vue.js that holds forms and application state without dictating your UI components.

## Introduction

`@dynamicforms/vue-forms` manages form data, validation and state; rendering is left to the application. The same
elements also hold application state that no screen displays, such as a shopping cart or the filters of a list
view. Every member of a field, group or list is a tracked read, so a template that reads `field.value` re-renders
when it is written.

In addition to state, the library models the behaviour *between* fields. Visibility, enablement and values are
declared as conditions over other fields, and every change passes through an action pipeline in which each handler
decides whether to pass the event on and may modify its result. Groups and lists compose recursively, so the same
mechanism applies at every level of a nested form.

### Every operation is a transaction

A change is announced once, over the net difference, when the operation that contains it finishes. Several writes
wrapped in a `transaction()` are announced as one, and a handler that throws rolls back the whole operation:

```typescript
import { transaction } from '@dynamicforms/vue-forms';

transaction(() => {
  personForm.fields.firstName.value = 'Jane';
  personForm.fields.lastName.value = 'Novak';
});
// one ValueChangedAction on the form, not two, and none if either write throws
```

`tx.rollback()` reverts a transaction without throwing, so an edit can be applied, measured and reverted. See
[Transactions](/api/transactions).

### Lists hold thousands of rows

Writing one field of one row costs that row and the depth of its nesting; `push()`, `insert()`, `remove()` and
`pop()` cost one row. Reading `value` or `valid` again with no change in between costs nothing, because both are
cached and a write invalidates the cache. See [Scale](/api/list#scale).

### One declaration, one rule, every row

A list's item template is the declaration every row is built from. A validator or a conditional action registered
on it is one instance serving every row, and each row has its own result: two rows for which a condition evaluates
differently have different results, and a `CompareTo` compares that row's own fields. See
[How a `List` builds rows](/guide/model#how-a-list-builds-rows).

### A field carries what your UI renders it with

A field can hold the data its rendering needs: a label, a hint, a column width. These properties are declared as a
second type argument, checked by the compiler, and read through `extra`:

```typescript
interface Presentation { label: string; hint?: string }

const firstName = new Field<string, Presentation>({ value: 'Ada', label: 'First name' });
firstName.extra.label;                                // 'First name'
firstName.setExtendedValues({ label: 'Given name' }); // hint stays as it was
```

Reading `extra` is tracked like any other member, so a component that renders from it updates on a change. A UI
layer builds on it, and a form whose structure comes from a server stores its labels in it. See
[Extended properties](/examples/extended-properties).

## Interactive Demo

An interactive person form built with `@dynamicforms/vue-forms`. The demo uses Vuetify only to render the inputs;
[the same form with plain inputs](/guide/getting-started#rendering-a-form) needs no UI library. Toggling the field
states changes the form output:

<PersonFormDemo />

## Basic Usage Example

Creating and using a form with fields and groups:

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
personForm.fields.age.access = 'disabled';

// The form leaves a disabled field out of what it sends
console.log(personForm.value);  // { firstName: 'Jane', lastName: 'Doe', active: true }
```

<script setup>
import PersonFormDemo from './components/person-form-demo.vue'
</script>
