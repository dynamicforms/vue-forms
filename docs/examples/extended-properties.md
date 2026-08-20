# Extended Properties Example

The library models form state and leaves rendering to you — but a UI layer needs somewhere to keep what it renders
*with*: a label, a hint, a column width, a permission flag. Extended properties are that place. They are declared
per element as a second type argument, checked by the compiler, and read through `extra`.

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

The second argument is what makes them legal. Without it the parameter object takes only what every field takes:

```typescript
new Field({ value: 'Ada', label: 'First name' });
//                        ^^^^^ rejected as an excess property
```

`extra` is frozen, so it is read rather than written into. `setExtendedValues()` writes, and leaves the members it
does not name as they stand:

```typescript
firstName.setExtendedValues({ label: 'Given name' });
firstName.extra.label;  // 'Given name'
firstName.extra.hint;   // unchanged
```

## Rendering off them

This is the shape a UI component takes: it accepts the element, reads state from the members and presentation from
`extra`, and stays ignorant of what the form is for.

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
  <span v-for="error in field.errors" :key="error.componentBody">{{ error.componentBody }}</span>
</template>
```

Every read in that template is tracked, `extra` included: `setExtendedValues({ label: 'Given name' })` re-renders
the label without anything else being told about it.

## A form whose shape arrives from a server

The reason the properties are open rather than a fixed set: a form built at runtime carries whatever its
description carries, and the renderer reads it back.

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
form.fields.firstName.extra.label;   // whatever the server said
```

## What a name may not be

A parameter naming a member the class itself declares reaches **that member**, not `extra`:

```typescript
new Field<string, Presentation>({ value: 'Ada', label: 'Name', enabled: false });
// enabled sets enabled; only label lands in extra
```

Read-only members refuse the parameter outright, which is what keeps a typo from becoming a silent property:

```typescript
new Field({ value: 1, valid: true });     // TypeError: valid is read-only
new List(template, { length: 3 });        // TypeError: length is read-only
```

`Action` declares `label` and `icon` of its own — those reach the action's value rather than `extra`, so name an
action's presentation properties something else.

## Carried by a binding

A binding takes over the extended properties of the element it was bound from, and `bind()`'s second argument
writes over them for that binding alone. This is what lets one item template give every row its labels while a
single row overrides one:

```typescript
const rowTemplate = new Group({
  amount: new Field<number, Presentation>({ value: 0, label: 'Amount' }),
});

const list = new List(rowTemplate);
list.push({ amount: 100 });

list.get(0)!.fields.amount.extra.label;   // 'Amount' — carried from the template
```

## See also

- [`Field` API reference](/api/field#extended-properties) — the full rules, including subclasses
- [The model](/guide/model) — where extended properties sit among the other pieces
