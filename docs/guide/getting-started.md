# Getting Started

`@dynamicforms/vue-forms` holds a form's data, its validation and the rules between its fields, and the same
elements hold application state; rendering is left to the application. [Rationale](/guide/rationale) describes the
library's purpose and when it fits.

## Installation

```bash
npm install @dynamicforms/vue-forms
```

The package is ESM-only and requires Node 22 or newer. A CommonJS consumer reaches it through `require()` of an
ES module, which Node supports without a flag from 22.12; on 22.0–22.11 it needs `--experimental-require-module`.

The library ships no components and no styles. Any input renders an element, and
[`@dynamicforms/vuetify-inputs`](https://docs.velis.si/dynamicforms/vuetify-inputs/) is an optional UI layer that
renders them with Vuetify.

## Rendering a form

A form is a `Group` of fields. A component declares it once and binds each input to a field's `value`:

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
  <pre>{{ personForm.value }}</pre>
</template>

<script setup>
import { Field, Group } from '@dynamicforms/vue-forms';

const personForm = new Group({
  firstName: new Field({ value: 'John' }),
  lastName: new Field({ value: 'Doe' }),
  age: new Field({ value: 30 }),
  active: new Field({ value: true }),
});
</script>
```

Every read through an element is tracked, so the template re-renders on a plain assignment such as
`personForm.fields.age.access = 'disabled'`, and `watch()` takes a getter of the member read,
`watch(() => personForm.fields.age.value, cb)`.

A field whose `access` is `'disabled'` is omitted from `group.value` (`group.fullValue` contains every field
regardless of access). It still accepts a write to `value`, so loading a record into the form sets it.

## Plain data with `view()`

[`view()`](/api/view) reads a group as plain properties: a field reads and writes its value, and the group itself is
`$`.

```vue
<template>
  <input v-model="form.name" />
  <button :disabled="!form.$.valid">Save</button>
</template>

<script setup>
import { Field, Group, Validators, view } from '@dynamicforms/vue-forms';

const form = view(new Group({ name: new Field({ value: '', validators: [new Validators.Required()] }) }));
</script>
```

## Validation

Validators are attached to a field; the application renders the resulting errors:

```vue
<template>
  <input v-model="username.value" @blur="username.touched = true" />
  <template v-if="username.touched">
    <div v-for="error in username.errors" :key="error.code" class="text-error">
      {{ error.detail }}
    </div>
  </template>
</template>

<script setup>
import { Field, Validators } from '@dynamicforms/vue-forms';

const username = new Field({ value: '', validators: [new Validators.Required()] });
</script>
```

Validators run eagerly: the field above is invalid immediately after creation because it has no value. The
template therefore shows the errors once `touched` is set, which the input does when it loses focus. `Required`
trims a string before measuring it, so a value of only spaces counts as empty;
`new Validators.Required({ trim: false })` keeps spaces as part of the value.

`@dynamicforms/vuetify-inputs` renders `field.errors` in its inputs.

## Rules apply to every row of a list

A list builds its rows from an item template, and a row shares the template's validators and actions. Registering
one on a row registers it on the template, so it applies to every row, existing and added later:

```typescript
import { Field, Group, List, Validators } from '@dynamicforms/vue-forms';

const lines = new List(new Group({ sku: new Field({ value: '' }) }), { value: [{ sku: 'a-1' }, { sku: '' }] });

lines.get(0)!.field('sku')!.registerAction(new Validators.Required());
lines.get(1)!.field('sku')!.valid; // false: the second row has the validator too
```

`unregisterAction()` and `clearValidators()` on a row likewise remove the rule from every row. Values, errors and
validity are per row. [Declarations and bindings](/guide/model#declarations-and-bindings) describes the model.

## Error messages

An error is data: a `code` identifying the failure, `params` holding the values it failed with, and an English
`detail`; the library ships no translations and renders nothing. [Error messages and
translation](/api/validators#error-messages-and-translation) shows how an application converts an error into text,
and lists every code with its English detail.

## Submitting

A submit waits for asynchronous validation, sends only a valid form, and makes what the server saved the new
baseline:

```typescript
async function submit() {
  await personForm.settled();
  if (!personForm.valid) return;
  personForm.rebind(await api.save(personForm.value));
}
```

The cookbook's [Submitting](/guide/cookbook#submitting) recipe describes each step and shows the same submit as a
`SubmitAction` that `form.confirm()` executes.

## Versioning and support

The package follows Semantic Versioning: breaking changes are released only in a **major** version, so `2.x` →
`3.0.0` may break existing code and a minor or patch release does not. Every breaking change is listed in the
[migration guide](/guide/migration) with before/after code and in the [changelog](/guide/changelog).

| | Supported |
|---|---|
| Vue | `^3.5.2` |
| Node | 22 or newer; 22.12 or newer for `require()` from CommonJS |
| Module formats | ESM, with type definitions |
| Browsers | ES2022 with `WeakRef` and `AbortController`; in development also `FinalizationRegistry` |
| Bundler | replaces `process.env.NODE_ENV`, as Vite and webpack do by default |

The package reads `process.env.NODE_ENV` to leave the devtools out of a production build. Where the bundler does not
replace it, a browser has no `process`, and building the first element throws a `ReferenceError`.

## Next Steps

[The model](/guide/model) describes how the library fits together: elements, declarations, transactions, validity,
and how a `List` builds its rows. The [Cookbook](/guide/cookbook) has short recipes for common tasks: loading and
submitting a record, server errors, optional sections, fields that depend on a type, and application state. The
[Examples](/examples/basic-form) section shows the patterns in working forms, and the API reference documents every
member: [Field](/api/field), [Group](/api/group) and [Validators](/api/validators).

Upgrading an existing project? The [migration guide](/guide/migration) has one section per release, newest first,
from 3.0.0 back to 0.6.0, and a combined section for upgrading from a release before 0.12.
