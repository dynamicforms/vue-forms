# Field

`Field<T>` represents a single typed form value. It is constructed with `new`, like `Action`, `Group` and `List`, and the instance is a Vue reactive object from that moment on.

## Creating a field

```typescript
import { Field } from '@dynamicforms/vue-forms';

const name = new Field({ value: 'John' });
const age  = new Field<number>({ value: 30 });
```

## `new Field<T>(params?)`

`params` is a `Partial<IFieldConstructorParams<T>>`, and omitting it entirely is allowed.

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
rejected by the type checker. The derived members are getter-only, so assigning one throws a `TypeError`;
`parent` and `fieldName` are installed by the container, and only throw once a `Group` or `List` has defined
them as non-configurable accessors.

The generic argument is inferred from `params.value`, so `new Field({ value: 'John' })` is a `Field<string>` and
`new Field()` is a `Field<any>`. Pass it explicitly when the initial value does not pin the type you want:
`new Field<number | null>({ value: null })`.

### `IFieldConstructorParams<T>`

The exported type of the parameter object, shared by `new Field`, `new Action`, `new Group`, `new List` and every
`clone()`:

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

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | `T` | yes | Current value. The setter is a no-op on a disabled field, and for primitives also when the new value is `===` the current one. For object and array values every assignment fires `ValueChangedAction`, even with the same reference, because the field is a `reactive()` instance and reads return a proxy. `isChanged` is separate and uses deep equality. |
| `originalValue` | `T` | yes | Value as provided at creation. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` (deep equality) |
| `enabled` | `boolean` | yes | When `false`, the field ignores value changes and is excluded from `Group.value` |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint — does not affect serialization |
| `valid` | `boolean` | no | `true` when `errors` is empty |
| `validating` | `boolean` | no | `true` while at least one async validator is pending. The library maintains it through `beginValidating()` / `endValidating()`, which validators call around a returned promise |
| `validationEpoch` | `number` | no | Generation counter of the validators attached to the field, raised by `clearValidators()`. A `Validator` reads it to tell whether a result it is about to apply still belongs to the validators the field carries now |
| `errors` | `ValidationError[]` | yes | Current validation errors. Writable, but normally managed by validators. Writing to it is a plain property write and recomputes nothing on its own — call `validate()` afterwards to have `valid`, `ValidChangedAction` and the parent container follow |
| `touched` | `boolean` | yes | Interaction flag. Nothing in the library sets it in response to input — your UI must assign `field.touched = true` (e.g. on blur). `Group`/`List` aggregate it from their children and propagate an assignment down |
| `parent` | `Group \| undefined` | no | Container the field belongs to, installed by that container as a non-configurable accessor. A `Group` that is a row of a `List` gets the `List`, which the declared type does not tell you apart from a `Group` — the sibling lookup `field.parent?.fields.other` is valid one level below a `Group` only |
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

Manually fires a specific action class on this field. `actionClass` is the class itself, not an instance — it is
looked up by its static `classIdentifier`, so abstract classes work too. Returns what the chain returns, or `null`
when no action of that type is registered.

### `validate(revalidate?): void`

Recalculates `valid` based on `errors`. Pass `revalidate: true` to re-trigger all eager validators from scratch.
When the verdict changes, it fires `ValidChangedAction` and has the parent container recompute its own validity, so
a field turning invalid on its own is reflected in the `Group` or `List` holding it.

### `clearValidators(): void`

Removes the validators registered on this element, empties `errors` and recalculates `valid`. Every error goes,
including ones no validator contributed — errors pushed in from the outside, such as server-side ones. The verdict
goes through the same path as any other: a field that was invalid fires `ValidChangedAction` and its container
re-evaluates its own validity. A validation still in flight is dropped when it settles, so it cannot push an error
onto a field that no longer carries the validator that produced it.

It does not descend into members. A `Group` or a `List` composes `valid` from its members as well, so
`group.clearValidators()` leaves `group.valid` at `false` while any member is still invalid — call
`clearValidators()` on the members whose validators you also want gone.

### `beginValidating(): void` / `endValidating(): void`

Raise and lower the async-validation counter that backs `validating`. `Validator` calls them around a validation
function that returns a promise; call them yourself only if you run asynchronous validation outside a `Validator`.
The counter floors at zero, so an unmatched `endValidating()` leaves it there.

### `clone(overrides?): Field<T>`

Returns a new reactive field with the same registered actions. `overrides` is a
`Partial<IFieldConstructorParams<T>>`; of its keys, only `value`, `originalValue`, `enabled` and `visibility` are
read — the rest are ignored. `originalValue` is read by key presence and `value` by being anything other than
`undefined`, so `clone({ value: null })` gives a clone holding `null`, while an `undefined` `value` counts as none
supplied and the clone keeps the current one.

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
`FieldBase<T>`, `Group<T>` extends `FieldBase<GroupValue<T>>`, and `List<T>` extends `FieldBase<ListValue>`.

It provides `originalValue`, `enabled`, `visibility`, `valid`, `errors`, `validating`, `validationEpoch`,
`isChanged`, `fullValue`, `parent`, `fieldName`, `registerAction()`, `triggerAction()`, `validate()`,
`clearValidators()`, `beginValidating()` and `endValidating()` — which is why those work the same way on every form
element. `value`, `touched` and `clone()` are abstract and supplied by each subclass.

Its constructor returns the Vue reactive proxy of the instance, which is what makes every form element reactive
without a wrapper. A subclass constructor therefore operates on the proxy, and so does anything that reads `this`
afterwards.

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
