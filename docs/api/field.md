# Field

`Field<T>` represents a single typed form value. The constructor is guarded — `new Field()` compiles, but throws a `TypeError` at runtime. Always use `Field.create()`. (`Group` and `List`, in contrast, are created with `new`.)

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
| `params.touched` | `boolean` | `false` | Initial interaction flag |
| `params.validators` | `IFieldAction[]` | `[]` | Validator actions (run eagerly on creation) |
| `params.actions` | `IFieldAction[]` | `[]` | Additional actions to register |

Any other `IField` property passed in `params` is assigned to the instance as-is.

Returns a reactive `Field<T>` instance.

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | `T` | yes | Current value. The setter is a no-op on a disabled field, and for primitives also when the new value is `===` the current one. For object and array values every assignment fires `ValueChangedAction`, even with the same reference, because the field is a `reactive()` instance and reads return a proxy. `isChanged` is separate and uses deep equality. |
| `reactiveValue` | `ComputedRef<T>` | no | Vue computed ref of `value` — use in templates instead of `value` when you need reactivity outside of direct binding |
| `originalValue` | `T` | yes | Value as provided at creation. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` (deep equality) |
| `enabled` | `boolean` | yes | When `false`, the field ignores value changes and is excluded from `Group.value` |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint — does not affect serialization |
| `valid` | `boolean` | no | `true` when `errors` is empty |
| `validating` | `boolean` | no | `true` while an async validator is pending |
| `errors` | `ValidationError[]` | yes | Current validation errors. Writable, but normally managed by validators |
| `touched` | `boolean` | yes | Interaction flag. The library never sets it — your UI must assign `field.touched = true` (e.g. on blur). `Group`/`List` aggregate and propagate it |
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

The clone is detached: it has no `parent` and no `fieldName`. `originalValue` is only carried over when you pass it explicitly in `overrides` — otherwise the clone's `originalValue` becomes its current value, so `isChanged` starts out `false`.

## `EmptyField`

A singleton placeholder `Field` exported from the same module, used where a field reference is required but no real field exists. Writing to it logs a `console.warn`.

## `NullableField<T>`

Type alias for `Field<T> | null`.

## `FieldBase`

The exported abstract base shared by `Field`, `Action`, `Group` and `List`. It provides `enabled`, `visibility`,
`valid`, `errors`, `validating`, `isChanged`, `fullValue`, `reactiveValue`, `parent`, `fieldName`,
`registerAction()`, `triggerAction()`, `validate()` and `clearValidators()` — which is why those work the same way
on every form element. Use it in type guards (`field instanceof FieldBase`) when you accept any of the four.

---

> See also: [Basic Form example](/examples/basic-form), [Validators example](/examples/validators)
