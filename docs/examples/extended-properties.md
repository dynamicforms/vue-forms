# Extended Properties Example

The library models form state and does not render. A UI layer needs to store the data it renders with: a label, a
hint, a column width, a permission flag. Extended properties hold that data. They are declared per element as a
second type argument, checked by the compiler, and read through `extra`.

## Declaring them

```typescript
import { Field, Group } from '@dynamicforms/vue-forms';

interface Presentation {
  label: string;
  hint?: string;
}

const firstName = new Field<string, Presentation>({
  value: 'Ada',
  label: 'First name',
  hint: 'as it appears in your passport',
});

firstName.value;        // 'Ada'
firstName.extra.label;  // 'First name'
firstName.extra.hint;   // 'as it appears in your passport'
```

The second type argument allows them. Without it the parameter object accepts only the parameters every field
accepts:

```typescript
new Field({ value: 'Ada', label: 'First name' });
//                        ^^^^^ rejected as an excess property
```

`extra` is frozen and cannot be written. `setExtendedValues()` writes the properties it names and leaves the others
unchanged:

```typescript
firstName.setExtendedValues({ label: 'Given name' });
firstName.extra.label;  // 'Given name'
firstName.extra.hint;   // unchanged
```

## Rendering off them

A UI component accepts the element, reads state from its members and presentation data from `extra`, and does not
depend on the form it is used in.

```vue
<script setup lang="ts">
import { Field } from '@dynamicforms/vue-forms';

interface Presentation {
  label: string;
  hint?: string;
}

const props = defineProps<{ field: Field<string, Presentation> }>();
</script>

<template>
  <label>
    {{ field.extra.label }}
    <input v-model="field.value" :disabled="!field.enabled" />
  </label>
  <small v-if="field.extra.hint">{{ field.extra.hint }}</small>
  <span v-for="error in field.errors" :key="error.code">{{ error.detail }}</span>
</template>
```

Every read in that template is reactive, including `extra`: `setExtendedValues({ label: 'Given name' })`
re-renders the label without any further call.

## A form whose shape arrives from a server

Extended properties are an open set, not a fixed one: a form built at runtime holds whatever properties its
description contains, and the renderer reads them.

```typescript
interface FieldSpec {
  name: string;
  value: string;
  label: string;
  hint?: string;
  width?: number;
}

function buildForm(spec: FieldSpec[]) {
  const fields: Record<string, Field<string, Presentation & { width?: number }>> = {};
  for (const { name, value, label, hint, width } of spec) {
    fields[name] = new Field<string, Presentation & { width?: number }>({ value, label, hint, width });
  }
  return new Group(fields);
}

const form = buildForm(await fetch('/api/form-spec').then((r) => r.json()));
form.fields.firstName.extra.label;   // the label from the server's description
```

## What a name may not be

A parameter named like a member the class declares sets **that member**, not `extra`:

```typescript
new Field<string, Presentation>({ value: 'Ada', label: 'Name', access: 'readonly' });
// access sets access; only label lands in extra
```

A parameter named like a read-only member throws, so such a name never becomes an unnoticed extended property:

```typescript
new Field({ value: 1, valid: true });     // TypeError: valid is read-only
new List(template, { length: 3 });        // TypeError: length is read-only
```

`Action` declares its own `label` and `icon`. These parameters set the action's value, not `extra`, so give an
action's other presentation properties different names. A subclass that reads `label` or `icon` in its own shape
declares an accessor pair (getter and setter) for it:
[Widening the value in a subclass](/api/action#widening-the-value-in-a-subclass).

## Carried by a binding

A binding copies the extended properties of the element it was bound from, and `bind()`'s second argument
overrides them for that binding only. One item template thus gives every row its labels, and a single row can
override one:

```typescript
const rowTemplate = new Group({
  amount: new Field<number, Presentation>({ value: 0, label: 'Amount' }),
});

const list = new List(rowTemplate);
list.push({ amount: 100 });

list.get(0)!.fields.amount.extra.label;   // 'Amount', copied from the item template
```

## See also

- [`FieldBase` API reference](/api/field-base#extended-properties): the full rules, including subclasses
- [The model](/guide/model): where extended properties sit among the other pieces
