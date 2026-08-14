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
| `params.enabled` | `boolean` | `true` | Whether the group itself is enabled. Not propagated to child fields, and it does not remove the group from its parent's `value` — a disabled subgroup is still serialized as long as its own value is non-empty |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.validators` | `IFieldAction[]` | `[]` | Group-level validators |
| `params.actions` | `IFieldAction[]` | `[]` | Group-level actions |

::: warning
If you pass a `params` object, always include `value` (or `originalValue`). The constructor assigns `params.value` to the group, and an undefined value resets every child field to `null`. Passing only `validators`, `actions`, `enabled` or `visibility` therefore wipes the values the child fields were created with. Omitting `params` entirely is safe.
:::

The constructor throws if `fields` is not an object of field instances (`Invalid fields object provided`). It also throws a `TypeError` when you reuse a field instance that already belongs to another group or list — `parent` and `fieldName` are defined as non-configurable, so they cannot be redefined. Each group needs its own field instances (use `clone()`).

## `Group.createFromFormData(data)`

Creates a `Group` from a plain `Record<string, any>` by wrapping each value in a `Field`. Useful when building a form from raw API data. Passing `null` returns an empty group; passing an already built form structure throws (`data is already a Form structure, should be a simple object`).

```typescript
const form = Group.createFromFormData({ name: 'Alice', score: 42 });
```

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `fields` | `T` | no | The typed map of child fields |
| `value` | `FieldsToValues<T> \| null` | yes | Serialized object of **enabled** field values; `null` if all fields are disabled |
| `reactiveValue` | `ComputedRef<...>` | no | Vue computed ref of `value` |
| `originalValue` | `object \| null` | yes | Value at creation time. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the group itself and all child fields are valid |
| `validating` | `boolean` | no | `true` while an async validator registered on the group itself is pending. Unlike `valid`, it does **not** aggregate child fields — check the children individually |
| `errors` | `ValidationError[]` | yes | Group-level validation errors. Writable, but normally managed by validators |
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

The clone is detached: it has no `parent` and no `fieldName`. `originalValue` is only carried over when you pass it explicitly in `overrides` — otherwise the clone's `originalValue` becomes its current value, so `isChanged` starts out `false`.

## `NullableGroup`

Type alias for `Group | null`.

---

> See also: [Basic Form example](/examples/basic-form), [Conditional statements example](/examples/conditional-statement)
