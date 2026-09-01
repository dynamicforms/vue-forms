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

- **UI-Agnostic**: A logic layer for form state, validation and dynamic behaviour. Works with native HTML controls, Vuetify, Tailwind, or any custom components. The only component the library ships is the optional `MessagesWidget` for rendering validation errors, and the one deliberate exception is [`Action`](/examples/action#why-action-is-not-ui-agnostic), whose value is a label and an icon.
- **Fields that react to each other**: Conditional visibility, enablement and values are declared as statements over other fields, and the action pipeline lets a handler intercept, transform or abort an event.
- **Reactive & Type-Safe**: Every member of a field, group or list is a tracked read — assign a property and whatever read it re-renders, with no `ref` to unwrap. A group's value type is inferred from the fields it holds, nested structures included.
- **Structural serialization**: A group's value is the shape of its fields, and `Group.createFromFormData()` turns a plain object back into a form.
- **Lightweight**: `vue` (^3.5.2) is the only peer dependency and `lodash-es` the only runtime one.

## Installation

```bash
npm install @dynamicforms/vue-forms
```

The package is ESM-only: it ships one build, which imports `lodash-es`, its only runtime dependency. Node 22 or
newer is required, and `vue` (^3.5.2) is the only peer dependency. A CommonJS consumer reaches it through
`require()` of an ES module, which Node supports.

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
the template checks `touched` before showing the errors. `Required` trims a string before measuring it, so a value
of spaces alone is no value; pass `new Validators.Required({ trim: false })` where the spaces belong to the field.

## Translation

Every built-in validator's message has an English default and a key naming what it validates, not its English
text (`Required`, `MinValue`, `MaxValue`, `ValueInRange`, `MinLength`, `MaxLength`, `LengthInRange`, `Pattern`,
`InAllowedValues`, `ValidationFailed`). The library never picks a locale itself — call `translateStrings` once
per locale to supply translations for as many of them as you have:

```typescript
import { translateStrings } from '@dynamicforms/vue-forms';

function applyLocale(locale: string) {
  const dictionary = translations[locale]; // however your app keeps its translations
  translateStrings((key, defaultValue) => dictionary[key] ?? defaultValue);
}
```

The callback receives the key and its English default, and returns the translation for the current locale, or
`null`/`undefined` to leave the English default in place — so a locale can be adopted before every message is
translated. An error already on screen updates in place when `translateStrings` is called, `{minValue}`-style
placeholders re-interpolated against the value being validated, without the field revalidating. Wiring an
existing i18n setup in is the same shape:

```typescript
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
translateStrings((key, defaultValue) => t(`forms.${key}`, defaultValue));
```

`translateStrings` comes from [`@dynamicforms/translatable`](https://github.com/dynamicforms/translatable), the
primitive this library and its sibling `@dynamicforms` packages share — its own readme covers the same recipe in
more general terms, and how a library declares translatable strings in the first place.

## Plugin Setup

The library ships a Vue plugin for its global options:

```typescript
import { forms } from '@dynamicforms/vue-forms';

app.use(forms, { useMarkdownInValidators: false });
```

By default the built-in validators produce markdown messages, which `MessagesWidget` renders through a globally
registered `vue-markdown` component. Set `useMarkdownInValidators` to `false` if you don't have one. The same
options are reachable without the plugin, through `getConfig()` and `setConfig()` — see
[Configuration](/api/config).

## Versioning and support

The package is in `0.x`, where a breaking change goes in the **minor** version: `0.9.0` → `0.10.0` may break your
code, `0.10.0` → `0.10.1` does not. Every such change is listed in the
[migration guide](/guide/migration) with before/after code and in the
[changelog](/guide/changelog). The public surface is not frozen
until 1.0.

| | Supported |
|---|---|
| Vue | `^3.5.2` |
| Node | 22 or newer |
| Module formats | ESM, with type definitions |
| Browsers | whatever your bundler targets — the build is `es2015` and uses no browser API of its own |

## Next Steps

[The model](/guide/model) is the whole library in one page — elements, declarations, transactions, validity, and
how a `List` builds its rows. After that, the [Examples](/examples/basic-form) section shows the patterns in
context and the API reference names every member: [Field](/api/field), [Group](/api/group),
[Validators](/api/validators) and [Configuration](/api/config).

Upgrading an existing project? The [migration guide](/guide/migration) walks the whole journey from 0.6.1 onwards,
silent breaks first.
