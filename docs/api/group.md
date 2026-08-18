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

`params` is an `IFieldParams<GroupValueInput<T>, X>` — the same parameter type every form element takes, with the
group's value shape substituted. A group takes [extended properties](/api/field#extended-properties) like every
other element: declare them as the second type argument, `new Group<Fields, Presentation>(fields, { label: … })`,
and read them back through `group.extra`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fields` | `GenericFieldsInterface` (`Record<string, FieldBase>`) | required | Map of field name → field/group/list instance |
| `params.value` | `GroupValueInput<T>` (`Partial<FieldsToValues<T>> \| null`) | not assigned | Initial values applied to matching fields; keys left out keep the value their field was created with. Parameters that carry no value assign nothing, and an explicitly `undefined` value counts as carrying none, so every child keeps the value it was created with; an explicit `null` clears all of them |
| `params.originalValue` | `GroupValueInput<T>` | same as `value` | Baseline for `isChanged`. Passed without a value of its own — an explicitly `undefined` `value` included — it is also applied to the fields as their initial value |
| `params.enabled` | `boolean` | `true` | Whether the group itself is enabled. Not propagated to child fields, and it does not remove the group from its parent's `value` — a disabled subgroup is still serialized as long as its own value is non-empty |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.touched` | `boolean` | `false` | Initial interaction flag, propagated to every child |
| `params.errors` | `ValidationError[]` | `[]` | Initial group-level validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | Group-level validators |
| `params.actions` | `FieldActionBase[]` | `[]` | Group-level actions |

`validators` and `actions` are registered before the remaining parameters are applied, and registration fires
nothing, so an `EnabledChangingAction` or `VisibilityChangingAction` passed here already guards the `enabled` and
`visibility` the same object carries, and every eager action among them runs exactly once, over the finished group.
`Field`, `Action` and `List` do the same — see [Field](/api/field) for the full description.

The constructor throws if `fields` is not an object of field instances (`Invalid fields object provided`). It also throws a `TypeError` when you hand it a field instance that already belongs to another group or list: a field belongs to one container, and a container refuses one that is taken. Each group needs its own field instances (use `clone()`). A `List` releases the rows it drops, so those are free to be taken again; a `Group` never releases a field.

Field names are ordinary keys of the `fields` map, so names that collide with `Object.prototype` members (`toString`, `constructor`, `__proto__`, …) are accepted like any other: the map has no prototype, and both `value` and `fullValue` build their result the same way. The value setter likewise assigns only from the object's own keys, so `group.value = {}` leaves a field named `toString` untouched instead of handing it `Object.prototype.toString`. A name used twice in the same group throws `Error('Field <name> is already in this form')`.

Each entry of `fields` is a non-configurable getter, so the map cannot be rewritten from outside: `group.fields.name = otherField` and `delete group.fields.name` both throw a `TypeError`. A field swapped in that way would never get `parent`, `fieldName` or change notifications. Build a new `Group` instead.

`parent` and `fieldName` are read-only accessors over an element's state, and that state is held in private class fields — invisible to `Object.keys(field)`, `Object.getOwnPropertySymbols(field)`, `JSON.stringify(field)` and lodash `isEqual` alike. The parent link is therefore out of reach of all four, and a walk over a group that contains its own descendants' back-references terminates. The container writes both; assigning either yourself throws a `TypeError`.

The same opacity means an element is not worth handing to a structural comparison: `isEqual(fieldA, fieldB)` reads nothing either field holds and answers `true` for any two instances of the same class. Compare `fieldA.value` with `fieldB.value` instead.

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
| `value` | reads `GroupValue<T>`, accepts `GroupValueInput<T>` | yes | Serialized object of **enabled** field values; `null` when nothing serializes — a group without fields, or one every field of which the serialization rule below leaves out. Reading it gives each field's own value type — for `Group<{ age: Field<number> }>`, `group.value!.age` is `number`. The object is built once per change and handed to every reader until the next one, and it is frozen: writing into it throws in strict mode and is silently dropped outside it. The setter takes a `Partial`: keys you leave out are not touched, and assigning `null` sets every child to `null` |
| `originalValue` | `GroupValueInput<T>` | yes | Value at creation time, held as a copy of its own rather than as the object `value` reads back, and not frozen. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the group itself and all child fields are valid |
| `validating` | `boolean` | no | `true` while an async validator registered on the group itself is pending. Unlike `valid`, it does **not** aggregate child fields — check the children individually |
| `errors` | `ValidationError[]` | yes | Group-level validation errors. Writable, but normally managed by validators |
| `enabled` | `boolean` | yes | Setting this does **not** cascade to children; use child fields directly |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint |
| `touched` | `boolean` | yes | `true` when any child field has been touched; setting propagates to all children |
| `fullValue` | `Record<string, any>` | no | Like `value` but includes disabled fields |

::: tip Serialization rule
`Group.value` serializes only **enabled** fields. A disabled field is completely excluded from the output object. An exception applies to a disabled nested `Group`: it is still included when its own value is non-empty, that is when at least one field inside it serializes. A disabled nested `List` has no such exception and is always excluded.
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

Validates the group. Pass `revalidate: true` to cascade validation to all children. The children are revalidated
first and the group forms its own verdict afterwards, over the finished set, so it announces one net transition of
its own validity at most — a child turning valid while a later one is still to be checked produces no notification
on the group.

### `notifyValueChanged()`

Records that a member changed its value, so that the [transaction](/api/transactions) in progress works out at
commit what this group's own value became and announces it once. Called internally when a child value changes; you
rarely need to call this directly.

### `clone(overrides?): Group<T>`

Returns a new `Group` with cloned children, actions and extended properties — the children carry their own over
as they are cloned. `overrides` is an `IFieldParams<GroupValueInput<T>, X>`; of the members every element takes,
only `value`, `originalValue`, `enabled` and `visibility` are read, and extended properties it names are written
over the ones carried from the source. `enabled` and `visibility` apply to the group itself and are not propagated to the children,
while `value` reaches them exactly as it does through the constructor.

`originalValue` is read by key presence and `value` by being anything other than `undefined`, so
`clone({ value: null })` clones a group with every member cleared, while an `undefined` `value` counts as none
supplied and the clone carries the current one.

The clone is detached: it has no `parent` and no `fieldName`. `originalValue` is only carried over when you pass it explicitly in `overrides` — otherwise the clone's `originalValue` becomes its current value, so `isChanged` starts out `false`.

## `NullableGroup`

Type alias for `Group | null`.

---

> See also: [The model](/guide/model), [Basic Form example](/examples/basic-form),
> [Conditional statements example](/examples/conditional-statement)
