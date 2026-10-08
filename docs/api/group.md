# Group

`Group<T>` holds a named set of elements (fields, nested groups or lists) and exposes their combined value as a plain object. It uses the same action and validation system as `Field`.

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

`params` is an `IFieldParams<GroupValueInput<T>, X>`: the parameter type every element takes, with the group's
value shape substituted. A group takes [extended properties](/api/field#extended-properties) like every
other element: augment [`Extras`](/api/field#extras) once and every group carries them, or declare them as the
second type argument for one group, `new Group<Fields, Presentation>(fields, { label: … })`. Both are read through
`group.extra`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fields` | `GenericFieldsInterface` (`Record<string, FieldBase>`) | required | Map of member name → element instance |
| `params.value` | `GroupValueInput<T>` (`Partial<FieldsToValues<T>> \| null`) | not assigned | Initial values applied to matching members; members whose key is absent keep the value they were created with. An absent or explicitly `undefined` `value` assigns nothing, so every member keeps the value it was created with; an explicit `null` clears all of them |
| `params.originalValue` | `GroupValueInput<T>` | same as `value` | Baseline for `isChanged`. When `value` is absent or explicitly `undefined`, it is also applied to the members as their initial value |
| `params.access` | [`Access`](/api/field#access) | `'editable'` | What the group sends to its own container, and the access applied to its members through `effectiveAccess`. See [What a container serializes](/api/container#what-a-container-serializes). |
| `params.visibility` | [`Visibility`](/api/field#visibility) | `'full'` | How a rendering layer shows the group. |
| `params.touched` | `boolean` | `false` | Initial interaction flag, propagated to every child |
| `params.errors` | `ValidationError[]` | `[]` | Initial group-level validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | Group-level validators |
| `params.actions` | `FieldActionBase[]` | `[]` | Group-level actions |

`validators` and `actions` are registered before the remaining parameters are applied, and registration fires no
action. An `AccessChangingAction` or `VisibilityChangingAction` passed here therefore already applies to the
`access` and `visibility` in the same object, and every eager action among them runs exactly once, over the
finished group. `Field`, `Action` and `List` behave the same way; see [Field](/api/field) for the full description.

The constructor throws if `fields` is not an object of element instances (`Invalid fields object provided`). It also throws a `TypeError` when it receives an element that already belongs to another group or list: an element belongs to one container at a time. Each group needs its own element instances; create one with `field.bind()`. A `List` releases the rows it removes and a `Group` releases the element `removeField()` removes, so both can be added to a container again.

Member names are ordinary keys of the `fields` map, so names that collide with `Object.prototype` members (`toString`, `constructor`, `__proto__`, …) are accepted: the map has no prototype, and `value` and `fullValue` build their result the same way. The value setter assigns only from the object's own keys, so `group.value = {}` leaves a member named `toString` unchanged and does not assign `Object.prototype.toString` to it. A name used twice in the same group throws `Error('Field <name> is already in this form')`.

`fields` returns a guarded view of the member map, so the set of members cannot be changed through it: `group.fields.name = otherField`, `Object.defineProperty(group.fields, 'name', …)` and `delete group.fields.name` all throw a `TypeError` naming the method to use instead. An element assigned that way would get no `parent`, `fieldName` or change notifications, and the group would keep counting the validity of a member it no longer holds. The set changes only through `addField()` and `removeField()`. Reading through the view is a tracked read of the set of members, so a template rendering `group.fields` re-renders when a member is added or removed.

`parent` and `fieldName` are read-only accessors over an element's state, and that state is held in private class fields, which `Object.keys(field)`, `Object.getOwnPropertySymbols(field)` and `JSON.stringify(field)` do not see. None of the three reaches the parent link, so a walk over a group does not follow its descendants' back-references and terminates. The container writes both; assigning either yourself throws a `TypeError`. A `Group` that is a row of a `List` gets the `List` as its `parent`. On every element `parent` is typed [`Container`](/api/container), the base both classes extend.

Because the state is private, a structural comparison of two elements would read none of it and return `true` for any two instances of the same class. `FieldBase` has a `Symbol.toStringTag` accessor that returns the element's class name; a structural comparison reads the tag first and, for a tag it does not recognise, compares by identity. `isEqual(fieldA, fieldB)` is therefore `false` unless they are the same element. Compare their values instead: `isEqual(fieldA.value, fieldB.value)`. The accessor is on the prototype, so it adds nothing to each element, and `Object.prototype.toString` returns `[object Field]`, not `[object Object]`. See [Comparing elements](/guide/model#comparing-elements) for the package's own `isEqual`, the pitfalls it avoids and the cases it does not cover.

## Types

| Type | Definition | Purpose |
|------|-----------|---------|
| `GenericFieldsInterface` | `Record<string, FieldBase>` | The constraint on `Group`'s and `List`'s type argument. Extend it to declare a form's shape: `interface UserForm extends GenericFieldsInterface { name: Field<string> }` |
| `FieldsToValues<T>` | `{ [K in keyof T]: T[K]['value'] \| null }` | Maps a fields interface to the value object it sends. A nested `Group` sends its own value object, a nested `List` its row array; every member may be `null`, because a `'disabled-null'` member is sent as `null` |
| `GroupValue<T>` | `Partial<FieldsToValues<T>>` | The type of `group.value`. The group's value is never `null`. Every key is optional: a `'disabled'` member is left out of the object the group builds, so each one is possibly `undefined` |
| `GroupValueInput<T>` | `Partial<FieldsToValues<T>> \| null` | What `group.value` and `params.value` accept; `null` writes `null` into every member |
| `FieldsToFullValues<T>` | `{ [K in keyof T]: T[K]['fullValue'] }` | The type of `group.fullValue`: every member's `fullValue`, regardless of access |

## `Group.createFromFormData(data)`

Creates a `Group` from a plain `Record<string, any>` by wrapping each value in a `Field`. Useful when building a form from raw API data. Passing `null` returns an empty group; passing an already built form structure throws (`data is already a Form structure, should be a simple object`).

```typescript
const form = Group.createFromFormData({ name: 'Alice', score: 42 });
```

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `fields` | `T` | no | The typed map of members. It is a guarded view over the group's map: reads return the members themselves, and every write throws a `TypeError`; `addField()` and `removeField()` change the set. The read is tracked, so a template rendering it re-renders when members are added or removed |
| `value` | reads `GroupValue<T>`, accepts `GroupValueInput<T>` | yes | Object of the values the members send, by the serialization rule below; `{}` when no member sends anything (a group without members, or one whose members the rule all leaves out). The group's value is never `null`. Each key has its member's own value type, optional and nullable: for `Group<{ age: Field<number> }>`, `group.value.age` is `number \| null \| undefined`, because a `'disabled'` `age` is left out and a `'disabled-null'` one is `null`. The object is built once per change and returned to every reader until the next change. It is frozen: writing into it throws in strict mode and is ignored otherwise. An array or object a member `Field` holds is not frozen; assign a new one instead of writing into it. The setter takes a `Partial`: absent keys are not changed, and assigning `null` sets every member to `null` |
| `originalValue` | `GroupValueInput<T>` | yes | Value at creation time, held as a separate, unfrozen copy (not the object `value` returns). Writable; assigning it resets the baseline of `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` |
| `valid` | `boolean` | no | `true` when the group itself and every member it counts are valid. A `'disabled'` member sends nothing and is not counted, whatever errors it carries |
| `validating` | `boolean` | no | `true` while an asynchronous validation is pending on the group itself or anywhere below it. The group keeps a count of the members whose `validating` is `true`, so the read is constant-time regardless of the number of members |
| `busy` | `boolean` | no | `true` while an `Action.execute()` at or below the group is pending. Pending validation is reported by `validating`, not `busy`, so a submit gate reads both, or awaits [`settled()`](/api/field#settled-promise-void) |
| `errors` | `ValidationError[]` | yes | Group-level validation errors. Writable, but normally managed by validators |
| `access` | [`Access`](/api/field#access) | yes | What the group sends to its container and whether it is validated (`'disabled'` leaves it out and `'disabled-null'` sends `null` regardless of what it holds), and, through `effectiveAccess`, what every element inside it sends: below a `'disabled'` or `'disabled-null'` group nothing is sent or validated, and below a `'readonly'` one nothing accepts input. Each member keeps the access it was given. See [What a container serializes](/api/container#what-a-container-serializes). |
| `effectiveAccess` | [`Access`](/api/field#access) | no | The access that applies after the containers above are taken into account; see [`effectiveAccess`](/api/field#properties) |
| `enabled` | `boolean` | no | `true` where `access` is `'editable'` |
| `effectiveEnabled` | `boolean` | no | `true` where `effectiveAccess` is `'editable'`. A rendering layer reads it to draw the inputs of a whole section as not accepting input |
| `visibility` | [`Visibility`](/api/field#visibility) | yes | How a rendering layer shows the group. It does not affect what the group sends or whether it is validated |
| `touched` | `boolean` | yes | `true` when any child field has been touched; setting propagates to all children |
| `fullValue` | `FieldsToFullValues<T>` | no | What the group holds (`value` is what it sends): every member's `fullValue`, regardless of access. A nested group includes its own full structure. A binding of the group copies this value |

::: tip Serialization rule
`Group.value` includes every member according to its access: an `'editable'` or `'readonly'` member with its value, a `'disabled-null'` one as `null`, and a `'disabled'` one not at all. A nested container is a member like any other, so a `'disabled'` one is left out regardless of what it holds. See [What a container serializes](/api/container#what-a-container-serializes) for the full rules.
:::

## Methods

### `field(fieldName): T[K] | null`

Type-safe accessor for a single member. Returns `null` if the key does not exist.

```typescript
const first = form.field('firstName'); // typed as Field<string>
```

### `addField(fieldName, field): this`

Adds `field` to the group under `fieldName` and returns the group. The group then holds it exactly as it holds a
member passed to the constructor: the element has `parent` and `fieldName` set, its validity counts towards the
group's, its pending runs count towards the group's `validating`, and its own validators that refer to another
member of the form (a `CompareTo` by name, a validator that reads a sibling) run over the record it now belongs to.

```typescript
const form = new Group({ name: new Field({ value: 'Jan' }) });
form.addField('email', new Field({ value: 'jan@example.com' }));
form.value; // { name: 'Jan', email: 'jan@example.com' }
```

The change is announced like any other: inside a [transaction](/api/transactions) it is committed with the rest of
the transaction, and the group announces its final value once. A member that sends a value fires
`ValueChangedAction` on the group; a `'disabled'` one, which the group leaves out, fires nothing. The baseline of
`isChanged` is not changed: a group that gains a member holds a value its `originalValue` does not contain, and
`isChanged` is `true` until `originalValue` is assigned.

The map is typed `T`, which lists the members declared in the group's type. A member added beyond those is held
and sent like any other, but is not part of the type. Declare it in `T` to have it typed.

- **throws `Error`** (`Field <name> is already in this form`) where the group already holds that name;
- **throws `TypeError`** where `field` already belongs to a container; pass a `bind()` of it instead.

### `removeField(fieldName): FieldBase | undefined`

Removes the member held under `fieldName` from the group and returns it, or returns `undefined` where the group
holds no member of that name. The element is fully released: `parent` and `fieldName` are cleared, its validity and
its pending runs no longer count towards the group's, and it can be added to another container. It keeps its own
state: its value, its errors and the baseline of `isChanged`.

```typescript
const email = form.removeField('email'); // the Field instance, detached
form.value;                              // { name: 'Jan' }
```

The group's value and validity are recomputed over the remaining members and announced the same way as for
`addField()`. The baseline of `isChanged` is not changed. When the transaction it ran in is rolled back, the
member set is restored.

### `registerAction(action): this`

Registers an action on the group itself (not on children). Returns `this`. `registerActionBefore(action, before)` registers
one before another and `unregisterAction(action)` removes one; see
[`Field`](/api/field#registeractionbefore-action-before-this).

### `validate(revalidate?): void`

Validates the group. Pass `revalidate: true` to revalidate all children as well. The children are revalidated
first and the group then computes its own validity over the result, so it announces at most one net transition of
its own validity. A child that becomes valid while a later child is still unchecked produces no notification on the
group.

### `notifyValueChanged()`

Records that a member changed its value, so that the open [transaction](/api/transactions) computes at commit
this group's new value and announces it once. It is called internally when a member's value changes; a direct call
is rarely needed.

### `bind(data?, overrides?): Group<T>`

Returns a new `Group` over `data`: every member is bound in turn, and the actions and extended properties of the
group and of each member are copied. `data` is applied to the members exactly as a value passed to the constructor,
so a member whose key is absent gets the value from the declaration. `overrides` is an
[`IBindParams<GroupValueInput<T>, X>`](/api/field#ibindparams-t-x): `originalValue`, `access`, `visibility` and
the extended properties, which override the ones copied from the source. `access` and `visibility` apply
to the group itself; each member keeps its own.

`originalValue` counts as supplied when its key is present, and `data` when it is anything other than `undefined`:
`bind(null)` returns a group with every member cleared, while an `undefined` `data` counts as not supplied and the
new group gets the current value.

The new group is constructed through `this.constructor`, so a subclass of `Group` binds into its own class. A
subclass whose constructor does not take `(fields, params)` would ignore the bound members and produce a group with
the declaration's data instead of the record's; `bind()` throws a `TypeError` in that case. Such a subclass must
override `bind()` and construct itself.

The new group is detached: it has no `parent` and no `fieldName`. `originalValue` is copied only when passed explicitly in `overrides`; otherwise it is set to the group's current value, so `isChanged` starts as `false`.

### `rebind(data): this`

Replaces the record this group holds with `data`, in place: the same instance, its members written, the baseline
of `isChanged` reset and the validators run. A member whose key is absent from `data` gets its value from the
group's `declaration`, so a row reused this way ends up in the same state as a new `bind()` of the item template.
No `ValueChangedAction` fires for the group itself; its members announce their new values, and a change of validity
is announced as usual. See [`rebind()`](/api/field#rebind-data-this) for the full description, and
[Clearing and resetting](/guide/cookbook#clearing-and-resetting-a-form) for `rebind(group.originalValue)` (reset)
and `rebind(null)` (empty). `group.value = null` also empties the group, but only `rebind` resets `touched`, clears
the group's own errors and revalidates.

## `NullableGroup`

Type alias for `Group | null`.

---

> See also: [The model](/guide/model), [Basic Form example](/examples/basic-form),
> [Conditional statements example](/examples/conditional-statement)
