# Group

`Group<T>` holds a named set of fields (or nested groups/lists) and exposes their combined value as a plain object. It participates in the same action and validation system as `Field`.

## Creating a group

```typescript
import { Field, Group } from '@dynamicforms/vue-forms';

const form = new Group({
  firstName: new Field({ value: 'John' }),
  lastName:  new Field({ value: 'Doe' }),
  age:       new Field<number>({ value: 30 }),
});
```

## `new Group(fields, params?)`

`params` is a `Partial<IFieldConstructorParams<GroupValueInput<T>>>` — the same parameter type every form element
takes, with the group's value shape substituted.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fields` | `GenericFieldsInterface` (`Record<string, FieldBase>`) | required | Map of field name → field/group/list instance |
| `params.value` | `GroupValueInput<T>` (`Partial<FieldsToValues<T>> \| null`) | `null` | Initial values applied to matching fields; keys left out keep the value their field was created with |
| `params.originalValue` | `GroupValueInput<T>` | same as `value` | Baseline for `isChanged` |
| `params.enabled` | `boolean` | `true` | Whether the group itself is enabled. Not propagated to child fields, and it does not remove the group from its parent's `value` — a disabled subgroup is still serialized as long as its own value is non-empty |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.touched` | `boolean` | `false` | Initial interaction flag, propagated to every child |
| `params.errors` | `ValidationError[]` | `[]` | Initial group-level validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | Group-level validators |
| `params.actions` | `FieldActionBase[]` | `[]` | Group-level actions |

::: warning
If you pass a `params` object, always include `value` (or `originalValue`). The constructor assigns `params.value` to the group, and an undefined value resets every child field to `null`. Passing only `validators`, `actions`, `enabled` or `visibility` therefore wipes the values the child fields were created with. Omitting `params` entirely is safe.
:::

The constructor throws if `fields` is not an object of field instances (`Invalid fields object provided`). It also throws a `TypeError` when you reuse a field instance that already belongs to another group or list — `parent` and `fieldName` are defined as non-configurable, so they cannot be redefined. Each group needs its own field instances (use `clone()`).

Field names are ordinary keys of the `fields` map, so names that collide with `Object.prototype` members (`toString`, `constructor`, `__proto__`, …) are accepted like any other: the map has no prototype, and both `value` and `fullValue` build their result the same way. The value setter likewise assigns only from the object's own keys, so `group.value = {}` leaves a field named `toString` untouched instead of handing it `Object.prototype.toString`. A name used twice in the same group throws `Error('Field <name> is already in this form')`.

Each entry of `fields` is a non-configurable getter, so the map cannot be rewritten from outside: `group.fields.name = otherField` and `delete group.fields.name` both throw a `TypeError`. A field swapped in that way would never get `parent`, `fieldName` or change notifications. Build a new `Group` instead.

`parent` and `fieldName` are non-enumerable, which keeps the parent link out of `Object.keys(field)`, `JSON.stringify(field)` and lodash `isEqual` — all three terminate on a group that contains its own descendants' back-references.

## Types

| Type | Definition | Purpose |
|------|-----------|---------|
| `GenericFieldsInterface` | `Record<string, FieldBase>` | The constraint on `Group`'s and `List`'s type argument. Extend it to declare a form's shape: `interface UserForm extends GenericFieldsInterface { name: Field<string> }` |
| `FieldsToValues<T>` | `{ [K in keyof T]: T[K]['value'] }` | Maps a fields interface to the value object it serializes to. A nested `Group` contributes its own value object, a nested `List` its row array |
| `GroupValue<T>` | `FieldsToValues<T> \| null` | What `group.value` reads back |
| `GroupValueInput<T>` | `Partial<FieldsToValues<T>> \| null` | What `group.value` and `params.value` accept |

## `Group.createFromFormData(data)`

Creates a `Group` from a plain `Record<string, any>` by wrapping each value in a `Field`. Useful when building a form from raw API data. Passing `null` returns an empty group; passing an already built form structure throws (`data is already a Form structure, should be a simple object`).

```typescript
const form = Group.createFromFormData({ name: 'Alice', score: 42 });
```

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `fields` | `T` | no | The typed map of child fields |
| `value` | reads `GroupValue<T>`, accepts `GroupValueInput<T>` | yes | Serialized object of **enabled** field values; `null` if all fields are disabled. Reading it gives each field's own value type — for `Group<{ age: Field<number> }>`, `group.value!.age` is `number`. The setter takes a `Partial`: keys you leave out are not touched, and assigning `null` sets every child to `null` |
| `originalValue` | `GroupValueInput<T>` | yes | Value at creation time. Writable — assigning it rebaselines `isChanged` |
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

Returns a new `Group` with cloned children and actions. `overrides` is a
`Partial<IFieldConstructorParams<GroupValueInput<T>>>`; of its keys, only `value`, `originalValue`, `enabled` and
`visibility` are read, and they apply to the group itself — they are not forwarded to the children.

The clone is detached: it has no `parent` and no `fieldName`. `originalValue` is only carried over when you pass it explicitly in `overrides` — otherwise the clone's `originalValue` becomes its current value, so `isChanged` starts out `false`.

## `NullableGroup`

Type alias for `Group | null`.

---

> See also: [Basic Form example](/examples/basic-form), [Conditional statements example](/examples/conditional-statement)
