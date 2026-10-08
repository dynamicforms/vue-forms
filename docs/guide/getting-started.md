# Getting Started

See [Rationale](/guide/rationale) for what the library is trying to do and why it is shaped the way it is.

## Installation

```bash
npm install @dynamicforms/vue-forms
```

The package is ESM-only and requires Node 22 or newer. A CommonJS consumer reaches it through `require()` of an
ES module, which Node supports.

The library ships no components and no styles. The few members that speak about the interface, such as
`visibility` and `enabled`, are listed with the reason for each in
[What the library carries for the interface](/guide/rationale#what-the-library-carries-for-the-interface).

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

Every form element — `Field`, `Action`, `Group` and `List` — is created with `new`, and every read through it is
tracked from that moment on: reading `personForm.value` or `personForm.fields.age.enabled` in a template, in a
`computed` or in a `watchEffect` subscribes to it, and plain assignment re-renders. The element itself is not a Vue
proxy, so watch what you read — `watch(() => field.value, cb)` — rather than passing the element as the source.

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

A field whose `access` is `'disabled'` is omitted from `group.value` (use `group.fullValue` if you need every field
whatever its access), and it still takes a write to `value`, so loading a record into the form reaches it.

## Validation

Attach validators to a field and render the resulting errors yourself:

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

Validators run eagerly — the field above is already invalid right after creation, because it has no value. That is why
the template checks `touched` before showing the errors. `Required` trims a string before measuring it, so a value
of spaces alone is no value; pass `new Validators.Required({ trim: false })` where the spaces belong to the field.

`@dynamicforms/vuetify-inputs` renders `field.errors` in its inputs.

## Error messages and translation

An error is data: a `code` naming what failed, `params` holding the values it failed with, and an English `detail`.
The library ships no translations, picks no locale and renders nothing. The application turns an error into text:

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

A function called on every render follows a locale switch without the field revalidating. Falling back to `detail`
lets an application adopt a locale before it translates every code. The codes, their params and their English
details are listed under [Error codes](/api/validators#error-codes). An error the server returned has the same shape
when it is built as a [`ValidationError`](/api/validators#validationerror) from the `detail_code`, `detail_params`
and `detail` a `@dynamicforms/fastapi-viewsets` server answers with. The [validators demo](/examples/validators)
renders its errors in eight languages, with and without markdown, this way.

A validator takes `{ code, detail }` as its last argument. A field that needs its own text for a failure gets its own
code, and the application translates that code like any other:

```typescript
new Validators.Required({ code: 'role_required', detail: 'Select a role' });
```

## Versioning and support

The package follows Semantic Versioning: a breaking change goes in the **major** version, so `2.x` → `3.0.0` may
break your code and a minor or patch release does not. Every breaking change is listed in the
[migration guide](/guide/migration) with before/after code and in the [changelog](/guide/changelog).

| | Supported |
|---|---|
| Vue | `^3.5.2` |
| Node | 22 or newer |
| Module formats | ESM, with type definitions |
| Browsers | whatever your bundler targets — the build is `es2022` and uses no browser API of its own |

## Next Steps

[The model](/guide/model) is the whole library in one page — elements, declarations, transactions, validity, and
how a `List` builds its rows. The [Cookbook](/guide/cookbook) has short recipes for what a form needs next —
loading and submitting a record, server errors, optional sections, fields that depend on a type. The
[Examples](/examples/basic-form) section shows the patterns in running forms and the API reference names every
member: [Field](/api/field), [Group](/api/group) and
[Validators](/api/validators).

Upgrading an existing project? The [migration guide](/guide/migration) has a section per release, newest first,
starting with 1.x to 2.0.
