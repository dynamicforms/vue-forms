# Getting Started

See [Rationale](/guide/rationale) for what the library is trying to do and why it is shaped the way it is.

## Installation

```bash
npm install @dynamicforms/vue-forms
```

The package is ESM-only and requires Node 22 or newer. A CommonJS consumer reaches it through `require()` of an
ES module, which Node supports.

### Stylesheet

The library ships a small stylesheet used by `MessagesWidget`. It is not bundled into the JavaScript, so import it
once in your app entry point if you use that component:

```typescript
import '@dynamicforms/vue-forms/style.css';
```

Everything else — `Field`, `Group`, `List`, validators, actions — is UI-agnostic and needs no styles. The few
members that speak about the interface, such as `visibility` and `enabled`, are listed with the reason for each in
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
the template checks `touched` before showing the errors. `Required` trims a string before measuring it, so a value
of spaces alone is no value; pass `new Validators.Required({ trim: false })` where the spaces belong to the field.

## Error messages and translation

A built-in validator states a failure as data rather than as a sentence: a `code` naming what failed, `params`
holding the values it failed with, and an English `detail`. The library ships no translations, picks no locale and
renders no markdown of its own; the application decides how an error reads through one function, `errorText`:

```typescript
import { setConfig } from '@dynamicforms/vue-forms';
import { formatParams } from '@dynamicforms/translatable';

const { t, n, d, te } = i18n.global;
// formats numbers and dates for the locale before t substitutes them
const tf = formatParams(t, (value) =>
  typeof value === 'number' ? n(value) : value instanceof Date ? d(value) : value);

setConfig({
  errorText: (error) => (te(`errors.${error.code}`) ? tf(`errors.${error.code}`, error.params) : undefined),
});
```

```json
{ "errors": { "min_value": "Vrednost mora biti vsaj {minValue}", "required": "Prosimo, vnesite vrednost" } }
```

`errorText` answers a string, an `MdString` for markdown or a `SimpleComponentDef`; `undefined` leaves the English
detail, so an application can adopt a locale before it translates every code. The codes, their params and their
English details are listed under [Error codes](/api/validators#error-codes).

`errorText` is called on every read of an error, so an error already on screen follows a locale switch without the
field revalidating. An error the server returned goes through the same function when it is built as a
[`ValidationErrorDescription`](/api/validators#validationerrordescription), the shape a
`@dynamicforms/fastapi-viewsets` server answers with. The [validators demo](/examples/validators) renders its errors
in eight languages, with and without markdown, this way.

A validator given a `message` of its own reports that message, and `errorText` is not asked about it.

## Plugin Setup

The library ships a Vue plugin for its global options:

```typescript
import { forms } from '@dynamicforms/vue-forms';

app.use(forms, { errorText });
```

The same options are reachable without the plugin, through `getConfig()` and `setConfig()` — see
[Configuration](/api/config).

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
member: [Field](/api/field), [Group](/api/group),
[Validators](/api/validators) and [Configuration](/api/config).

Upgrading an existing project? The [migration guide](/guide/migration) has a section per release, newest first,
starting with 1.x to 2.0.
