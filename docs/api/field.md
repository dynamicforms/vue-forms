# Field

`Field<T>` represents a single typed form value. The constructor is private — use `Field.create()`.

## Creating a field

```typescript
import { Field } from '@dynamicforms/vue-forms';

const name = Field.create({ value: 'John' });
const age  = Field.create<number>({ value: 30 });
```

## `Field.create<T>(params?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params.value` | `T` | `undefined` | Initial value |
| `params.originalValue` | `T` | same as `value` | Baseline for `isChanged` |
| `params.enabled` | `boolean` | `true` | Whether the field accepts input and serializes |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.validators` | `IFieldAction[]` | `[]` | Validator actions (run eagerly on creation) |
| `params.actions` | `IFieldAction[]` | `[]` | Additional actions to register |

Returns a reactive `Field<T>` instance.

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | `T` | yes | Current value. Setting it on a disabled field is a no-op. |
| `reactiveValue` | `ComputedRef<T>` | no | Vue computed ref of `value` — use in templates instead of `value` when you need reactivity outside of direct binding |
| `originalValue` | `T` | no | Value as provided at creation |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` (deep equality) |
| `enabled` | `boolean` | yes | When `false`, the field ignores value changes and is excluded from `Group.value` |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint — does not affect serialization |
| `valid` | `boolean` | no | `true` when `errors` is empty |
| `validating` | `boolean` | no | `true` while an async validator is pending |
| `errors` | `ValidationError[]` | no | Current validation errors |
| `touched` | `boolean` | yes | Whether the user has interacted with the field |
| `parent` | `Group \| undefined` | no | Parent group when the field is part of a `Group` |
| `fieldName` | `string \| undefined` | no | Key name within the parent `Group` |
| `fullValue` | `T` | no | Identical to `value` on a plain `Field` |

## Methods

### `registerAction(action): this`

Registers an action (validator or event handler). Returns `this` for chaining.

```typescript
field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('changed to', newValue);
  return supr(field, newValue, oldValue);
}));
```

### `triggerAction(actionClass, ...params): any`

Manually fires a specific action class on this field.

### `validate(revalidate?): void`

Recalculates `valid` based on `errors`. Pass `revalidate: true` to re-trigger all eager validators from scratch.

### `clearValidators(): void`

Removes all registered validators and clears `errors`.

### `clone(overrides?): Field<T>`

Returns a new reactive field with the same registered actions. `overrides` can replace `value`, `originalValue`, `enabled`, or `visibility`.

---

> See also: [Basic Form example](/examples/basic-form), [Validators example](/examples/validators)
