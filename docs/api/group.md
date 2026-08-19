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

The constructor throws if `fields` is not an object of field instances (`Invalid fields object provided`). It also throws a `TypeError` when you hand it a field instance that already belongs to another group or list: a field belongs to one container, and a container refuses one that is taken. Each group needs its own field instances — bind the declaration again with `field.bind()`. A `List` releases the rows it drops and a `Group` releases the field `removeField()` takes out, so both are free to be taken again.

Field names are ordinary keys of the `fields` map, so names that collide with `Object.prototype` members (`toString`, `constructor`, `__proto__`, …) are accepted like any other: the map has no prototype, and both `value` and `fullValue` build their result the same way. The value setter likewise assigns only from the object's own keys, so `group.value = {}` leaves a field named `toString` untouched instead of handing it `Object.prototype.toString`. A name used twice in the same group throws `Error('Field <name> is already in this form')`.

`fields` hands out a guarded view of the member map, so the set of members cannot be rewritten from outside: `group.fields.name = otherField`, `Object.defineProperty(group.fields, 'name', …)` and `delete group.fields.name` all throw a `TypeError` naming the method to use instead. A field swapped in that way would never get `parent`, `fieldName` or change notifications, and the group would go on counting the verdict of a member it no longer holds. `addField()` and `removeField()` are the way the set changes. Reading through the view is a tracked read of the set of members, so a template rendering off `group.fields` re-renders when a field is added or removed.

`parent` and `fieldName` are read-only accessors over an element's state, and that state is held in private class fields — invisible to `Object.keys(field)`, `Object.getOwnPropertySymbols(field)`, `JSON.stringify(field)` and lodash `isEqual` alike. The parent link is therefore out of reach of all four, and a walk over a group that contains its own descendants' back-references terminates. The container writes both; assigning either yourself throws a `TypeError`.

The same opacity means an element is not worth handing to a structural comparison: `isEqual(fieldA, fieldB)` reads nothing either field holds and answers `true` for any two instances of the same class. Compare `fieldA.value` with `fieldB.value` instead.

## Types

| Type | Definition | Purpose |
|------|-----------|---------|
| `GenericFieldsInterface` | `Record<string, FieldBase>` | The constraint on `Group`'s and `List`'s type argument. Extend it to declare a form's shape: `interface UserForm extends GenericFieldsInterface { name: Field<string> }` |
| `FieldsToValues<T>` | `{ [K in keyof T]: T[K]['value'] }` | Maps a fields interface to the value object it serializes to. A nested `Group` contributes its own value object, a nested `List` its row array |
| `GroupValue<T>` | `Partial<FieldsToValues<T>> \| null` | What `group.value` reads back. Every key is optional: a disabled member is left out of the object the group builds, so each one reads as possibly `undefined` |
| `GroupValueInput<T>` | `Partial<FieldsToValues<T>> \| null` | What `group.value` and `params.value` accept |

## `Group.createFromFormData(data)`

Creates a `Group` from a plain `Record<string, any>` by wrapping each value in a `Field`. Useful when building a form from raw API data. Passing `null` returns an empty group; passing an already built form structure throws (`data is already a Form structure, should be a simple object`).

```typescript
const form = Group.createFromFormData({ name: 'Alice', score: 42 });
```

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `fields` | `T` | no | The typed map of child fields. What it hands out is a guarded view over the map the group holds: reading it reaches the members themselves, and every write to it throws a `TypeError` — `addField()` and `removeField()` change the set. The read is tracked, so a template rendering off it re-renders as members come and go |
| `value` | reads `GroupValue<T>`, accepts `GroupValueInput<T>` | yes | Serialized object of **enabled** field values; `null` when nothing serializes — a group without fields, or one every field of which the serialization rule below leaves out. Reading it gives each field's own value type, optional — for `Group<{ age: Field<number> }>`, `group.value!.age` is `number \| undefined`, because a disabled `age` is left out. The object is built once per change and handed to every reader until the next one, and it is frozen: writing into it throws in strict mode and is silently dropped outside it. The setter takes a `Partial`: keys you leave out are not touched, and assigning `null` sets every child to `null` |
| `originalValue` | `GroupValueInput<T>` | yes | Value at creation time, held as a copy of its own rather than as the object `value` reads back, and not frozen. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the group itself and all child fields are valid |
| `validating` | `boolean` | no | `true` while an asynchronous validation is in flight on the group itself or anywhere below it. The group keeps a tally of the members that answer `true`, so the read costs nothing however many members it holds |
| `busy` | `boolean` | no | `true` while an `Action.execute()` at or below the group has yet to settle. A validation is not an execution and is answered by `validating`, so a submit gate reads both, or awaits [`settled()`](/api/field#settled-promise-void) |
| `errors` | `ValidationError[]` | yes | Group-level validation errors. Writable, but normally managed by validators |
| `enabled` | `boolean` | yes | Setting this does **not** cascade to children; use child fields directly |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint |
| `touched` | `boolean` | yes | `true` when any child field has been touched; setting propagates to all children |
| `fullValue` | `FieldsToFullValues<T>` | no | What the group holds, where `value` is what it serializes: every field is in it, disabled ones included, and every key is present rather than optional. A nested group contributes its own full structure, so the guarantee carries all the way down and no `?.` is needed to read through it |

::: tip Serialization rule
`Group.value` serializes only **enabled** fields. A disabled field is completely excluded from the output object. An exception applies to a disabled nested container — a `Group` or a `List` alike: it is still included when its own value is non-empty, that is when at least one field inside it serializes. A disabled container whose value is empty is excluded like any other disabled field.
:::

## Methods

### `field(fieldName): T[K] | null`

Type-safe accessor for a single child field. Returns `null` if the key does not exist.

```typescript
const first = form.field('firstName'); // typed as Field<string>
```

### `addField(fieldName, field): this`

Takes `field` into the group under `fieldName` and returns the group. The group ends up holding it exactly as it
holds a field the constructor was given: the field carries `parent` and `fieldName`, its verdict counts towards the
group's, its runs in flight count towards the group's `validating`, and a rule of its own that names another member
of the form — a `CompareTo` by name, a validator that reads a sibling — is run over the record it has joined.

```typescript
const form = new Group({ name: new Field({ value: 'Jan' }) });
form.addField('email', new Field({ value: 'jan@example.com' }));
form.value; // { name: 'Jan', email: 'jan@example.com' }
```

The change is announced through the ordinary path: inside a [transaction](/api/transactions) it settles with
everything else the transaction did, and the group announces the value it ends up holding once — so a member that
serializes fires `ValueChangedAction` on the group, and a disabled one, which the group leaves out, fires nothing.
The baseline behind `isChanged` is not rewritten: a group that gains a field holds something its `originalValue`
does not carry, and reports itself changed until `originalValue` is assigned.

The map is typed `T`, which names the members the group's type declares; a field added beyond those is held and
serialized like any other, and the type does not know about it. Declare it in `T` where the type is to name it.

- **throws `Error`** (`Field <name> is already in this form`) where the group already holds that name;
- **throws `TypeError`** where `field` already belongs to a container — hand over a `bind()` of it instead.

### `removeField(fieldName): FieldBase | undefined`

Takes the field held under `fieldName` out of the group and hands it back, answering `undefined` where the group
holds no field of that name. The field is released whole: `parent` and `fieldName` are gone, its verdict and its
runs in flight no longer count towards the group's, and it is free to be taken by another container. What it holds
— its value, its errors, the change history behind `isChanged` — is its own to report.

```typescript
const email = form.removeField('email'); // the Field instance, detached
form.value;                              // { name: 'Jan' }
```

The group's value and verdict settle over the members it has left, announced the same way `addField()`'s change is.
The baseline behind `isChanged` is not rewritten here either. Rolled back with the transaction it ran in, the
member set is put back as it was.

### `registerAction(action): this`

Registers an action on the group itself (not on children). Returns `this`. `registerActionBefore(action, before)` and
`unregisterAction(action)` place and drop one; see
[`Field`](/api/field#registeractionbefore-action-before-this).

### `validate(revalidate?): void`

Validates the group. Pass `revalidate: true` to cascade validation to all children. The children are revalidated
first and the group forms its own verdict afterwards, over the finished set, so it announces one net transition of
its own validity at most — a child turning valid while a later one is still to be checked produces no notification
on the group.

### `notifyValueChanged()`

Records that a member changed its value, so that the [transaction](/api/transactions) in progress works out at
commit what this group's own value became and announces it once. Called internally when a child value changes; you
rarely need to call this directly.

### `bind(data?, overrides?): Group<T>`

Returns a new `Group` over `data`: every member is bound in turn, and the actions and extended properties of the
group and of each member come along. `data` reaches the members exactly as a value passed to the constructor does,
so a key it leaves out leaves that member with what the declaration gives it. `overrides` is an
[`IBindParams<GroupValueInput<T>, X>`](/api/field#ibindparams-t-x): `originalValue`, `enabled`, `visibility` and
the extended properties, which are written over the ones carried from the source. `enabled` and `visibility` apply
to the group itself and are not propagated to the children.

`originalValue` is read by key presence, and `data` by being anything other than `undefined`: `bind(null)` gives a
group with every member cleared, while an `undefined` `data` counts as none supplied and the new group carries the
current one.

The new group is constructed through `this.constructor`, so a subclass of `Group` binds into its own class. A
subclass whose constructor does not take `(fields, params)` never sees the members it is handed and would answer
with a group carrying the declaration's data instead of the record's; `bind()` refuses that with a `TypeError`
rather than returning it, and such a subclass overrides `bind()` and constructs itself.

The new group is detached: it has no `parent` and no `fieldName`. `originalValue` is only carried over when you pass it explicitly in `overrides` — otherwise it becomes the group's current value, so `isChanged` starts out `false`.

### `rebind(data): this`

Exchanges the record this group holds for `data`, in place: the same instance, its members written, the change
history started over and the validators run. A key `data` leaves out is taken from the group's `declaration`, so a
row recycled this way ends up as a fresh `bind()` of the item template would. No `ValueChangedAction` fires for the
group itself; its members announce the values they took on, and a verdict that moves is announced as always. See
[`rebind()`](/api/field#rebind-data-this) for the whole of it.

## `NullableGroup`

Type alias for `Group | null`.

---

> See also: [The model](/guide/model), [Basic Form example](/examples/basic-form),
> [Conditional statements example](/examples/conditional-statement)
