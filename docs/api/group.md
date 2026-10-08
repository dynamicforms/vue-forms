# Group

`Group<T>` holds a named set of elements (fields, nested groups or lists) and exposes their combined value as a
plain object. It extends [`Container`](/api/container), which extends [`FieldBase`](/api/field-base), and uses the
same action and validation system as `Field`. This page describes what `Group` adds or overrides.

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

`params` is an [`IFieldParams<GroupValueInput<T>, X>`](/api/field-base#ifieldparams-t-x): the parameter type
every element takes, with the group's value shape substituted. A group takes
[extended properties](/api/field-base#extended-properties) like every other element: augment
[`Extras`](/api/field-base#extras) once and every group carries them, or declare them as the second type argument
for one group, `new Group<Fields, Presentation>(fields, { label: … })`. Both are read through `group.extra`.
`actions`, `errors`, `validators` and `visibility` apply to the group itself as on every element; see
[Constructor parameters](/api/field-base#constructor-parameters), which also describes the order in which the
parameters are applied.

<table class="members">
<thead><tr><th>Parameter</th><th>Type</th><th>Default</th></tr></thead>
<tbody>
<tr class="member-head"><td>

**`fields`**

</td><td>

`GenericFieldsInterface` (`Record<string, FieldBase>`)

</td><td>

required

</td></tr>
<tr class="member-desc"><td colspan="3">

Map of member name → element instance

</td></tr>
<tr class="member-head"><td>

**`params.access`**

</td><td>

[`Access`](/api/field-base#access)

</td><td>

default `'editable'`

</td></tr>
<tr class="member-desc"><td colspan="3">

What the group sends to its own container, and the access applied to its members through `effectiveAccess`. See [What a container serializes](/api/container#what-a-container-serializes).

</td></tr>
<tr class="member-head"><td>

**`params.originalValue`**

</td><td>

`GroupValueInput<T>`

</td><td>

default same as `value`

</td></tr>
<tr class="member-desc"><td colspan="3">

Baseline for `isChanged`. When `value` is absent or explicitly `undefined`, it is also applied to the members as their initial value

</td></tr>
<tr class="member-head"><td>

**`params.touched`**

</td><td>

`boolean`

</td><td>

default `false`

</td></tr>
<tr class="member-desc"><td colspan="3">

Initial interaction flag, propagated to every child

</td></tr>
<tr class="member-head"><td>

**`params.value`**

</td><td>

`GroupValueInput<T>` (`Partial<FieldsToValues<T>> | null`)

</td><td>

default not assigned

</td></tr>
<tr class="member-desc"><td colspan="3">

Initial values applied to matching members; members whose key is absent keep the value they were created with. An absent or explicitly `undefined` `value` assigns nothing, so every member keeps the value it was created with; an explicit `null` clears all of them

</td></tr>
</tbody>
</table>

The constructor throws if `fields` is not an object of element instances (`Invalid fields object provided`). It also throws a `TypeError` when it receives an element that already belongs to another group or list: an element belongs to one container at a time. Each group needs its own element instances; create one with `field.bind()`. A `List` releases the rows it removes and a `Group` releases the element `removeField()` removes, so both can be added to a container again.

Member names are ordinary keys of the `fields` map, so names that collide with `Object.prototype` members (`toString`, `constructor`, `__proto__`, …) are accepted: the map has no prototype, and `value` and `fullValue` build their result the same way. The value setter assigns only from the object's own keys, so `group.value = {}` leaves a member named `toString` unchanged and does not assign `Object.prototype.toString` to it. A name used twice in the same group throws `Error('Field <name> is already in this form')`.

`fields` returns a guarded view of the member map, so the set of members cannot be changed through it: `group.fields.name = otherField`, `Object.defineProperty(group.fields, 'name', …)` and `delete group.fields.name` all throw a `TypeError` naming the method to use instead. An element assigned that way would get no `parent`, `fieldName` or change notifications, and the group would keep counting the validity of a member it no longer holds. The set changes only through `addField()` and `removeField()`. Reading through the view is a tracked read of the set of members, so a template rendering `group.fields` re-renders when a member is added or removed.

The group writes `parent` and `fieldName` of each member; see [`parent`](/api/field-base#prop-parent). A `Group`
that is a row of a `List` gets the `List` as its `parent`. Two groups compare by identity; see
[Comparing elements](/api/field-base#comparing-elements).

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

<table class="members">
<thead><tr><th>Property</th><th>Type</th><th>Writable</th></tr></thead>
<tbody>
<tr class="member-head"><td><a id="prop-fields"></a>

**`fields`**

</td><td>

`T`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

The typed map of members. It is a guarded view over the group's map: reads return the members themselves, and every write throws a `TypeError`; `addField()` and `removeField()` change the set. The read is tracked, so a template rendering it re-renders when members are added or removed

</td></tr>
<tr class="member-head"><td><a id="prop-fullValue"></a>

**`fullValue`**

</td><td>

`FieldsToFullValues<T>`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

Overrides [`FieldBase.fullValue`](/api/field-base#prop-fullValue): what the group holds (`value` is what it sends): every member's `fullValue`, regardless of access. A nested group includes its own full structure. A binding of the group copies this value

</td></tr>
<tr class="member-head"><td><a id="prop-value"></a>

**`value`**

</td><td>

reads `GroupValue<T>`, accepts `GroupValueInput<T>`

</td><td>

writable

</td></tr>
<tr class="member-desc"><td colspan="3">

Overrides [`FieldBase.value`](/api/field-base#prop-value): object of the values the members send, by the serialization rule below; `{}` when no member sends anything (a group without members, or one whose members the rule all leaves out). The group's value is never `null`. Each key has its member's own value type, optional and nullable: for `Group<{ age: Field<number> }>`, `group.value.age` is `number | null | undefined`, because a `'disabled'` `age` is left out and a `'disabled-null'` one is `null`. The object is built once per change and returned to every reader until the next change. It is frozen: writing into it throws in strict mode and is ignored otherwise. An array or object a member `Field` holds is not frozen; assign a new one instead of writing into it. The setter takes a `Partial`: absent keys are not changed, and assigning `null` sets every member to `null`

</td></tr>
</tbody>
</table>

::: tip Serialization rule
`Group.value` includes every member according to its access: an `'editable'` or `'readonly'` member with its value, a `'disabled-null'` one as `null`, and a `'disabled'` one not at all. A nested container is a member like any other, so a `'disabled'` one is left out regardless of what it holds. See [What a container serializes](/api/container#what-a-container-serializes) for the full rules.
:::

## Methods

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

### `bind(data?, overrides?): Group<T>`

Overrides [`FieldBase.bind()`](/api/field-base#bind-data-overrides-fieldbase-t-x), which describes `overrides`,
the construction through `this.constructor` and the detached result. Returns a new `Group` over `data`: every member
is bound in turn, and the actions and extended properties of the group and of each member are copied. `data` is
applied to the members exactly as a value passed to the constructor, so a member whose key is absent gets the value
from the declaration. `overrides` is an [`IBindParams<GroupValueInput<T>, X>`](/api/field-base#ibindparams-t-x);
its `access` and `visibility` apply to the group itself, and each member keeps its own. `bind(null)` returns a group
with every member cleared.

A subclass whose constructor does not take `(fields, params)` would ignore the bound members and produce a group with
the declaration's data instead of the record's; `bind()` throws a `TypeError` in that case. Such a subclass must
override `bind()` and construct itself.

### `field(fieldName): T[K] | null`

Type-safe accessor for a single member. Returns `null` if the key does not exist.

```typescript
const first = form.field('firstName'); // typed as Field<string>
```

### `rebind(data): this`

Overrides [`FieldBase.rebind()`](/api/field-base#rebind-data-this), which has the full description, to take a
`GroupValueInput<T>` record. The record need not name every member: a member whose key is absent from `data` gets
its value from the group's `declaration`, not the previous record's value, so a row reused this way ends up in the
same state as a new `bind()` of the item template. See
[Clearing and resetting](/guide/cookbook#clearing-and-resetting-a-form) for `rebind(group.originalValue)` (reset)
and `rebind(null)` (empty). `group.value = null` also empties the group, but only `rebind` resets `touched`, clears
the group's own errors and revalidates.

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

## Inherited from Container

| Member | Description |
|--------|-------------|
| [`busy`](/api/container#prop-busy) | `true` while an `Action.execute()` in any child has not settled |
| [`notifyValueChanged()`](/api/container#notifyvaluechanged-void) | Records that a child changed its value, for the open transaction to announce |
| [`touched`](/api/container#prop-touched) | `true` where any child is touched; assigning it assigns every child |
| [`valid`](/api/container#prop-valid) | `true` where the container's own errors are empty and every child it counts is valid |
| [`validate(revalidate?)`](/api/container#validate-revalidate-void) | Revalidates every child first with `revalidate: true`, then computes the container's validity |

## Inherited from FieldBase

| Member | Description |
|--------|-------------|
| [`access`](/api/field-base#prop-access) | Whether the element accepts input, what it sends to its container, and whether it is validated |
| [`beginValidating() / endValidating()`](/api/field-base#beginvalidating-void-endvalidating-void) | Increment and decrement the asynchronous validation counter behind `validating` |
| [`bindingsOf(declaration)`](/api/field-base#bindingsof-declaration-fieldbase) | Returns every element in the subtree whose `declaration` is the one given |
| [`clearValidators()`](/api/field-base#clearvalidators-void) | Removes the element's validators and empties `errors` |
| [`contribution`](/api/field-base#prop-contribution) | What the element sends to its container's `value` |
| [`declaration`](/api/field-base#prop-declaration) | The element this one was declared as: itself, or the element a binding was made from |
| [`effectiveAccess`](/api/field-base#prop-effectiveAccess) | The access that applies once the containers above are taken into account |
| [`effectiveEnabled`](/api/field-base#prop-effectiveEnabled) | `true` where `effectiveAccess` is `'editable'` |
| [`enabled`](/api/field-base#prop-enabled) | `true` where `access` is `'editable'` |
| [`errors`](/api/field-base#prop-errors) | Current validation errors of the element; writable |
| [`extra`](/api/field-base#prop-extra) | The extended properties the element holds, frozen; written through `setExtendedValues()` |
| [`fieldName`](/api/field-base#prop-fieldName) | Key name within the parent `Group` |
| [`isChanged`](/api/field-base#prop-isChanged) | `true` when `value` differs from `originalValue` (deep equality) |
| [`markRecordIncomplete()`](/api/field-base#markrecordincomplete-void) | Marks that an eager action did not find a second element of a record not yet assembled |
| [`originalValue`](/api/field-base#prop-originalValue) | Baseline for `isChanged`; writable |
| [`parent`](/api/field-base#prop-parent) | Container the element belongs to |
| [`pending`](/api/field-base#prop-pending) | `validating \|\| busy` |
| [`registerAction(action)`](/api/field-base#registeraction-action-this) | Registers an action on the element; returns `this` |
| [`registerActionBefore(action, before)`](/api/field-base#registeractionbefore-action-before-this) | Registers `action` inside an existing chain, wrapped by `before` |
| [`setExtendedValues(values)`](/api/field-base#setextendedvalues-values-void) | Merges extended properties into `extra` |
| [`settled()`](/api/field-base#settled-promise-void) | Resolves once `pending` is `false` |
| [`triggerAction(actionClass, ...params)`](/api/field-base#triggeraction-actionclass-params-any) | Fires an action class on the element and returns what the chain returns |
| [`unregisterAction(action)`](/api/field-base#unregisteraction-action-boolean) | Removes an action from the element's declaration and its bindings |
| [`validating`](/api/field-base#prop-validating) | `true` while an asynchronous validation is in flight on the element or below it |
| [`validationEpoch`](/api/field-base#prop-validationEpoch) | Generation counter of the element's validators |
| [`visibility`](/api/field-base#prop-visibility) | How a rendering layer shows the element; writable |

## `NullableGroup`

Type alias for `Group | null`.

---

> See also: [The model](/guide/model), [FieldBase](/api/field-base), [Container](/api/container),
> [Basic Form example](/examples/basic-form), [Conditional statements example](/examples/conditional-statement)
