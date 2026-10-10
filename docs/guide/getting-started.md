# Getting Started

[Rationale](/guide/rationale) describes the library's purpose and design.

## Installation

```bash
npm install @dynamicforms/vue-forms
```

The package is ESM-only and requires Node 22 or newer. A CommonJS consumer reaches it through `require()` of an
ES module, which Node supports without a flag from 22.12; on 22.0–22.11 it needs `--experimental-require-module`.

The library ships no components and no styles. The few members that relate to the interface, such as
`visibility` and `enabled`, are listed with the reason for each in
[What the library carries for the interface](/guide/rationale#what-the-library-carries-for-the-interface).

## Basic Usage

A simple form:

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

Every form element (`Field`, `Action`, `Group` and `List`) is created with `new`, and every read through it is
tracked: reading `personForm.value` or `personForm.fields.age.enabled` in a template, a `computed` or a
`watchEffect` subscribes to it, and a plain assignment re-renders. The element itself is not a Vue proxy, so
`watch()` takes a getter of the member read, `watch(() => field.value, cb)`; the element itself as the source
subscribes to nothing.

## Using with Vue Components

Form fields bind to any Vue component:

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

A field whose `access` is `'disabled'` is omitted from `group.value` (`group.fullValue` contains every field
regardless of access). It still accepts a write to `value`, so loading a record into the form sets it.

## Validation

Validators are attached to a field; the application renders the resulting errors:

```vue
<template>
  <input v-model="username.value" />
  <div v-if="username.touched" v-for="error in username.errors" :key="error.code" class="text-error">
    {{ error.detail }}
  </div>
</template>

<script setup>
import { Field, Validators } from '@dynamicforms/vue-forms';

const username = new Field({ value: '', validators: [new Validators.Required()] });
</script>
```

Validators run eagerly: the field above is invalid immediately after creation because it has no value. The
template therefore checks `touched` before showing the errors. `Required` trims a string before measuring it, so a
value of only spaces counts as empty; `new Validators.Required({ trim: false })` keeps spaces as part of the value.

`@dynamicforms/vuetify-inputs` renders `field.errors` in its inputs.

## Error messages and translation

An error is data: a `code` identifying the failure, `params` holding the values it failed with, and an English
`detail`. The library ships no translations, selects no locale and renders nothing. The application converts an
error into text:

```typescript
import { formatParams } from '@dynamicforms/translatable';

const { t, n, d, te } = i18n.global;
// formats numbers and dates for the locale before t substitutes them
const tf = formatParams(t, (value) =>
  typeof value === 'number' ? n(value) : value instanceof Date ? d(value) : value);

const errorText = (error) => (te(`errors.${error.code}`) ? tf(`errors.${error.code}`, error.params) : error.detail);
```

```json
{ "errors": { "min_value": "Vrednost mora biti vsaj {minValue}", "required": "Prosimo, vnesite vrednost" } }
```

A function called on every render reflects a locale switch without revalidating the field. Falling back to
`detail` allows an application to use a locale before every code is translated. The codes, their params and their
English details are listed under [Error codes](/api/validators#error-codes). An error the application builds from a
server's response as a [`ValidationError`](/api/validators#validationerror) is rendered by the same function. The
[validators demo](/examples/validators) renders its errors this way in eight languages, with and without markdown.

A validator takes `{ code, detail }` as its last argument. A field that needs its own text for a failure uses its
own code, which the application translates like any other:

```typescript
new Validators.Required({ code: 'role_required', detail: 'Select a role' });
```

## Versioning and support

The package follows Semantic Versioning: breaking changes are released only in a **major** version, so `2.x` →
`3.0.0` may break existing code and a minor or patch release does not. Every breaking change is listed in the
[migration guide](/guide/migration) with before/after code and in the [changelog](/guide/changelog).

| | Supported |
|---|---|
| Vue | `^3.5.2` |
| Node | 22 or newer; 22.12 or newer for `require()` from CommonJS |
| Module formats | ESM, with type definitions |
| Browsers | whatever your bundler targets; the build is `es2022` and uses no browser API of its own |

## Next Steps

[The model](/guide/model) describes the whole library on one page: elements, declarations, transactions, validity,
and how a `List` builds its rows. The [Cookbook](/guide/cookbook) has short recipes for common form tasks: loading
and submitting a record, server errors, optional sections, and fields that depend on a type. The
[Examples](/examples/basic-form) section shows the patterns in working forms, and the API reference documents every
member: [Field](/api/field), [Group](/api/group) and [Validators](/api/validators).

Upgrading an existing project? The [migration guide](/guide/migration) has one section per release, newest first,
from 3.0.0 back to 0.6.0, and a combined section for upgrading from a release before 0.12.
