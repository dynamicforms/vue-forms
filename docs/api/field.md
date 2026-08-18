# Field

`Field<T>` represents a single typed form value. It is constructed with `new`, like `Action`, `Group` and `List`,
and every read through it — `field.value`, `field.valid`, `field.errors` — is tracked by Vue from that moment on.

New to the library? [The model](/guide/model) describes how the pieces fit together before this page names them
one by one.

## Creating a field

```typescript
import { Field } from '@dynamicforms/vue-forms';

const name = new Field({ value: 'John' });
const age  = new Field<number>({ value: 30 });
```

## `new Field<T>(params?)`

`params` is an `IFieldParams<T, X>`, and omitting it entirely is allowed. It carries the members below, plus the
[extended properties](#extended-properties) the field's second type argument declares.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params.value` | `T` | `undefined` | Initial value. Leaving it out, or passing `undefined`, falls back to `originalValue`; an explicit `null` is kept as the value |
| `params.originalValue` | `T` | same as `value` | Baseline for `isChanged`, and the initial value when no `value` is given |
| `params.enabled` | `boolean` | `true` | Whether the field accepts input and serializes |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.touched` | `boolean` | `false` | Initial interaction flag |
| `params.errors` | `ValidationError[]` | `[]` | Initial validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | Validator actions; each runs once over the constructed value |
| `params.actions` | `FieldActionBase[]` | `[]` | Additional actions to register |

`validators` and `actions` are registered before the remaining parameters are applied, and registration itself
fires nothing. An action that guards a property the same parameter object sets — an `EnabledChangingAction` next to
`enabled`, a `VisibilityChangingAction` next to `visibility` — is therefore in place for that assignment and can
rewrite or veto it, and the matching `EnabledChangedAction` / `VisibilityChangedAction` is notified of the result.
The single trigger closing the constructor runs every eager action — validators among them — exactly once, over the
finished value.

Those are the only accepted parameters: they are exactly the writable members of a field. Derived members
(`valid`, `validating`, `fullValue`, `isChanged`) and the container back-references (`parent`, `fieldName`) are
rejected by the type checker. All six are getter-only, so assigning any of them throws a `TypeError` — on a field
that belongs to no container as much as on one that does. The container installs `parent` and `fieldName`; there
is no way to write either from outside.

The first generic argument is inferred from `params.value`, so `new Field({ value: 'John' })` is a `Field<string>`
and `new Field()` is a `Field<any>`. Pass it explicitly when the initial value does not pin the type you want:
`new Field<number | null>({ value: null })`. The second one is never inferred — see
[extended properties](#extended-properties).

### `IFieldConstructorParams<T>`

The exported type of the members every form element takes, which `IFieldParams<T, X>` makes partial and adds the
extended properties to:

```typescript
type IFieldConstructorParams<T = any> = {
  value: T;
  originalValue: T;
  enabled: boolean;
  visibility: DisplayMode;
  touched: boolean;
  errors: ValidationError[];
} & IFieldConstructorActionsList;

interface IFieldConstructorActionsList {
  actions?: FieldActionBase[];
  validators?: FieldActionBase[];
}
```

Import it when you build a parameter object separately from the construction site:

```typescript
import { Field, IFieldConstructorParams } from '@dynamicforms/vue-forms';

const defaults: Partial<IFieldConstructorParams<string>> = { value: '', enabled: false };
const field = new Field(defaults);
```

### Extended properties

A field carries whatever properties you declare for it beyond the members above — a label, a hint, a css class, a
permission flag — so that a form whose shape arrives from a server has somewhere to put them and a UI layer has
somewhere to read them from. They are declared as the second type argument and reached through `extra`:

```typescript
interface Presentation {
  label: string;
  hint?: string;
}

const name = new Field<string, Presentation>({ value: 'John', label: 'First name', hint: 'as in your passport' });

name.extra.label;                                 // 'First name'
name.setExtendedValues({ label: 'Given name' });  // hint stays as it was
```

The declaration is what makes them legal: `X` is left out of type inference, so `new Field({ value: 1 })` is a
`Field<number, {}>` and `new Field({ value: 1, label: 'x' })` is rejected as an excess property. State both
arguments to declare properties — `new Field<string, Presentation>(…)` — and the parameter object then accepts
exactly the members of `Presentation` alongside the ones every field takes.

A parameter naming a member the class itself declares is that member and not an extended property. `enabled` sets
`enabled`, and `valid` still throws a `TypeError`, on a field with extended properties as much as on one without.
`Action` declares `label` and `icon`, so those two reach an action's value; name presentation properties on an
`Action` something else. In a subclass of your own, an accessor is such a member and a class field is not: class
fields are defined on the instance after the base constructor has applied the parameters, so a parameter named
after one becomes an extended property while the field keeps its initializer. Declare the member as an accessor
where a parameter of its name should reach it.

`validators` and `actions` state what to register on the element rather than what it carries, so neither becomes
an extended property — in a constructor or in a `clone()` override.

`extra` is read-only and the object it hands out is frozen: `setExtendedValues(values)` is the write path, and it
merges — a call naming one property leaves the others standing. The read is tracked like every other read through
an element, so a template rendering `field.extra.label` re-renders when the property is written, and a write inside
a `transaction()` that rolls back is put back with everything else.

Its type is `Readonly<Partial<X>>`, so a property reads as possibly `undefined` whatever `X` declares: a parameter
object carries as few of them as it likes, `setExtendedValues()` writes as few as it likes, and a property is there
once something has put it there.

```typescript
const bare = new Field<string, Presentation>({ value: 'John' }); // legal: every extended property is optional
bare.extra.label; // string | undefined
```

`Group`, `List` and `Action` take the same argument in the same position: `Group<Fields, X>`, `List<Fields, X>`,
`Action<Value, X>`.

### `IFieldParams<T, X>`

The exported type of the parameter object itself, taken by `new Field`, `new Action`, `new Group`, `new List` and
every `clone()`:

```typescript
type IFieldParams<T = any, X extends object = {}> = Partial<IFieldConstructorParams<T>> & Partial<NoInfer<X>>;
```

The two halves are made partial separately rather than as `Partial<IFieldConstructorParams<T> & X>`, because `T`
is inferred through this type: inference through a mapped type over an intersection answers with one constituent
of a union rather than the union, and `new Field({ value: stringOrNumber })` would be a `Field<string>`.

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | `T` | yes | Current value. The setter is a no-op on a disabled field. Values are compared by identity, so `ValueChangedAction` fires for a new object even when it is deeply equal to the old one, and not at all for the very object the field already holds — mutate a copy and assign it, rather than mutating in place. `isChanged` is separate and uses deep equality. |
| `originalValue` | `T` | yes | Value as provided at creation. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` (deep equality) |
| `enabled` | `boolean` | yes | When `false`, the field ignores value changes and is excluded from `Group.value` |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint — does not affect serialization |
| `valid` | `boolean` | no | `true` when `errors` is empty. It is read over the live array, so it follows an error pushed in by hand without any call — what waits for `validate()` is the `ValidChangedAction` announcing the transition |
| `validating` | `boolean` | no | `true` while at least one async validator is pending. The library maintains it through `beginValidating()` / `endValidating()`, which validators call around a returned promise |
| `validationEpoch` | `number` | no | Generation counter of the validators attached to the field, raised by `clearValidators()`. A `Validator` reads it to tell whether a result it is about to apply still belongs to the validators the field carries now |
| `errors` | `ValidationError[]` | yes | Current validation errors. Writable, and the array handed out is the one the element holds, so pushing into it works. `valid` follows immediately, on this field and on the containers above it; announcing the transition does not — call `validate()` for `ValidChangedAction` to fire. The array is reactive, so an error read back from it is a Vue proxy of the instance that produced it: `field.errors[0] === myError` is `false` for the very error a validator returned. Compare by content, or use `toRaw()` |
| `touched` | `boolean` | yes | Interaction flag. Nothing in the library sets it in response to input — your UI must assign `field.touched = true` (e.g. on blur). `Group`/`List` aggregate it from their children and propagate an assignment down |
| `parent` | `Group \| undefined` | no | Container the field belongs to, installed by that container and taken away again when the container releases the field — a `List` row dropped by `remove()`, `pop()`, `clear()` or a shortening `value` assignment has no `parent` and may be handed to another list. A container refuses a field that still carries one, so hand on the released instance or a `clone()`. A `Group` that is a row of a `List` gets the `List`, which the declared type does not tell you apart from a `Group` — the sibling lookup `field.parent?.fields.other` is valid one level below a `Group` only. The read is tracked, so a template rendering off `field.parent` follows the field from one container to the next |
| `fieldName` | `string \| undefined` | no | Key name within the parent `Group` |
| `declaration` | `FieldBase` | no | The element this one was declared as: itself for an element built from parameters, and the element it was cloned from for a clone — transitively, so a clone of a clone answers with the same element. Every row a `List` builds from an item template is a clone, so `list.get(0).fields.a.declaration === template.fields.a`. It is what lets an action shared by every row tell one row's field from another's |
| `fullValue` | `T` | no | Identical to `value` on a plain `Field` |
| `extra` | `Readonly<Partial<X>>` | no | The [extended properties](#extended-properties) the field carries, `{}` where none were declared. The object is frozen; write through `setExtendedValues()` |

## Methods

### `registerAction(action): this`

Registers an action (validator or event handler). Returns `this` for chaining.

```typescript
field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('changed to', newValue);
  return supr(field, newValue, oldValue);
}));
```

An action instance registered on an element is carried by every clone of that element, so **an action registered on
a `List`'s item template fires for every row**. The first argument the executor receives is the element it fired
for, which is how a handler that cares about one row tells them apart:

```typescript
template.fields.amount.registerAction(new ValueChangedAction((field, supr, newValue) => {
  if (field.parent === list.get(0)) console.log('the first row changed to', newValue);
  return supr(field, newValue);
}));
```

Anything an action remembers between runs belongs to the element it ran over rather than to the action — see
[Writing custom actions](/api/actions#custom-actions).

### `bindingsOf(declaration): FieldBase[]`

Every element in this element's subtree, this element included, whose `declaration` is the one given. It answers
which rows a declared element stands for: `list.bindingsOf(template.fields.a)` is the `a` field of every row.

### `markRecordIncomplete(): void`

States that an eager action running over this element looked for a second element of the record and did not find
it, because the record was not assembled yet — a `List` row's members are cloned before any of them holds the row.
The container that completes the record runs this element's eager actions again, and a container that takes the
record in afterwards does the same. Only an action implementation calls it; see
[Reading a second element of the record](/api/actions#reading-a-second-element-of-the-record).

### `triggerAction(actionClass, ...params): any`

Manually fires a specific action class on this field. `actionClass` is the class itself, not an instance — it is
looked up by its static `classIdentifier`, so abstract classes work too. Returns what the chain returns, or `null`
when no action of that type is registered.

### `validate(revalidate?): void`

Announces the verdict the element's `errors` support. Pass `revalidate: true` to re-run every eager action —
the validators among them — over the value the element holds first. When the verdict differs from the one last
announced it fires `ValidChangedAction` and reports the change to the parent container, so a field turning invalid
on its own is reflected in the `Group` or `List` holding it. Called inside a [transaction](/api/transactions), it
settles with everything else the transaction did and announces at the end of it.

### `clearValidators(): void`

Removes the validators registered on this element, empties `errors` and recalculates `valid`. Every error goes,
including ones no validator contributed — errors pushed in from the outside, such as server-side ones. The verdict
goes through the same path as any other: a field that was invalid fires `ValidChangedAction` and its container
re-evaluates its own validity. A validation still in flight is dropped when it settles, so it cannot push an error
onto a field that no longer carries the validator that produced it. A validator that installed a listener
elsewhere — `CompareTo`, on the field it compares against — has that listener released once the operation the call
ran in has finished, so an operation that unwinds leaves the validators exactly as it found them. The release names
this element only: the same validator instance goes on validating every other element it was registered on, so
clearing the validators of one row of a `List` leaves the other rows validating.

It does not descend into members. A `Group` or a `List` composes `valid` from its members as well, so
`group.clearValidators()` leaves `group.valid` at `false` while any member is still invalid — call
`clearValidators()` on the members whose validators you also want gone.

### `beginValidating(): void` / `endValidating(): void`

Raise and lower the async-validation counter that backs `validating`. `Validator` calls them around a validation
function that returns a promise; call them yourself only if you run asynchronous validation outside a `Validator`.
The counter floors at zero, so an unmatched `endValidating()` leaves it there.

### `setExtendedValues(values): void`

Writes [extended properties](#extended-properties). `values` is a `Partial<X>` and is merged over the ones the
field carries, so a call naming one property leaves the rest standing and none of them is ever taken away. The merged set replaces the frozen object
`extra` hands out, which is what makes the write reactive and what lets a rolled-back transaction put the previous
set back.

```typescript
field.setExtendedValues({ label: 'Given name' });
```

### `clone(overrides?): Field<T>`

Returns a new reactive field with the same registered actions and the same extended properties. `overrides` is an
`IFieldParams<T, X>`; of the members every field takes, only `value`, `originalValue`, `enabled` and `visibility`
are read — the rest, `validators` and `actions` included, are ignored and none of them reaches the clone's
extended properties. Extended properties it names are written over the ones the clone carries from the field it
was cloned from, and they are in place before the clone's eager actions run. `originalValue` is read by key
presence and `value` by being anything other than `undefined`, so `clone({ value: null })` gives a clone holding
`null`, while an `undefined` `value` counts as none supplied and the clone keeps the current one.

The clone is constructed through `this.constructor`, so a subclass of `Field` clones into its own class. It is
detached: it has no `parent` and no `fieldName`. `originalValue` is only carried over when you pass it explicitly in
`overrides` — otherwise the clone's `originalValue` becomes its current value, so `isChanged` starts out `false`.

## `EmptyField`

A singleton placeholder `Field` exported from the same module, used where a field reference is required but no real field exists. Writing to it logs a `console.warn`.

## `NullableField<T>`

Type alias for `Field<T> | null`.

## `FieldBase<T>`

The exported abstract base of `Field`, `Action`, `Group` and `List`, and the type to use wherever you accept "any
form element": every library signature that takes a field — action executors, `ValidationFunction`,
`Group`'s `fields` map, `CompareTo`'s `otherField` — is typed `FieldBase`.

`T` is the type of `value`, and each subclass passes its own through: `Field<T>` and `Action<T>` extend
`FieldBase<T>`, `Group<T>` extends `FieldBase<GroupValue<T>>`, and `List<T>` extends `FieldBase<ListValue>`. `X`
is the second argument every one of them takes, the [extended properties](#extended-properties) the element
carries; it defaults to `{}`, which is what makes `FieldBase` on its own the type of any form element.

It provides `originalValue`, `enabled`, `visibility`, `valid`, `errors`, `validating`, `validationEpoch`,
`isChanged`, `fullValue`, `parent`, `fieldName`, `extra`, `registerAction()`, `triggerAction()`, `validate()`,
`clearValidators()`, `setExtendedValues()`, `beginValidating()` and `endValidating()` — which is why those work the same way on every form
element. `value`, `touched` and `clone()` are abstract and supplied by each subclass.

It holds every mutable member of an element in a reactive state object beside it, which is what makes every form
element reactive without a wrapper: reading `field.value` in a template or a `computed` subscribes to that one
slot, and assigning it re-renders whatever read it. The element itself is not a proxy, so `toRaw(field)` is
`field` — and `watch(field, cb)` with a bare element as the source never fires. Watch what you read:
`watch(() => field.value, cb)`.

`instanceof FieldBase` is both the recommended type guard and the runtime check the library itself performs:
`new Group({...})` rejects a member that is not a `FieldBase` with `Error('Invalid fields object provided')`.

```typescript
import { FieldBase } from '@dynamicforms/vue-forms';

function isDirty(field: FieldBase): boolean {
  return field.isChanged;
}
```

---

> See also: [Basic Form example](/examples/basic-form), [Validators example](/examples/validators)
