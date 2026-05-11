# Group

`Group<T>` holds a named set of fields (or nested groups/lists) and exposes their combined value as a plain object. It participates in the same action and validation system as `Field`.

## Creating a group

```typescript
import { Field, Group } from '@dynamicforms/vue-forms';

const form = new Group({
  firstName: Field.create({ value: 'John' }),
  lastName:  Field.create({ value: 'Doe' }),
  age:       Field.create<number>({ value: 30 }),
});
```

## `new Group(fields, params?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fields` | `Record<string, IField>` | required | Map of field name → field/group/list instance |
| `params.value` | `object \| null` | `null` | Initial values applied to matching fields |
| `params.originalValue` | `object \| null` | same as `value` | Baseline for `isChanged` |
| `params.enabled` | `boolean` | `true` | Propagated to all child fields |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.validators` | `IFieldAction[]` | `[]` | Group-level validators |
| `params.actions` | `IFieldAction[]` | `[]` | Group-level actions |

## `Group.createFromFormData(data)`

Creates a `Group` from a plain `Record<string, any>` by wrapping each value in a `Field`. Useful when building a form from raw API data.

```typescript
const form = Group.createFromFormData({ name: 'Alice', score: 42 });
```

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `fields` | `T` | no | The typed map of child fields |
| `value` | `FieldsToValues<T> \| null` | yes | Serialized object of **enabled** field values; `null` if all fields are disabled |
| `reactiveValue` | `ComputedRef<...>` | no | Vue computed ref of `value` |
| `originalValue` | `object \| null` | no | Value at creation time |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the group itself and all child fields are valid |
| `validating` | `boolean` | no | `true` while any child has a pending async validator |
| `errors` | `ValidationError[]` | no | Group-level validation errors |
| `enabled` | `boolean` | yes | Setting this does **not** cascade to children; use child fields directly |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint |
| `touched` | `boolean` | yes | `true` when any child field has been touched; setting propagates to all children |
| `fullValue` | `Record<string, any>` | no | Like `value` but includes disabled fields |

::: tip Serialization rule
`Group.value` serializes only **enabled** fields. A disabled field is completely excluded from the output object. An exception applies to a disabled nested `Group`: it is still included if it is non-empty (i.e. it has at least one enabled child).
:::

## Methods

### `field(fieldName): T[K] | null`

Type-safe accessor for a single child field. Returns `null` if the key does not exist.

```typescript
const first = form.field('firstName'); // typed as Field<string>
```

### `registerAction(action): this`

Registers an action on the group itself (not on children). Returns `this`.

### `validate(revalidate?): void`

Validates the group. Pass `revalidate: true` to cascade validation to all children.

### `notifyValueChanged()`

Called internally when a child value changes. You rarely need to call this directly.

### `clone(overrides?): Group<T>`

Returns a new `Group` with cloned children and actions. `overrides` can replace `value`, `originalValue`, `enabled`, or `visibility`.

---

> See also: [Basic Form example](/examples/basic-form), [Conditional statements example](/examples/conditional-statement)
