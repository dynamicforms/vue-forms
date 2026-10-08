# Field

`Field<T>` represents a single typed form value. It is constructed with `new`, like `Action`, `Group` and `List`,
and every read through it (`field.value`, `field.valid`, `field.errors`) is tracked by Vue.

[The model](/guide/model) describes how the parts of the library fit together.

## Creating a field

```typescript
import { Field } from '@dynamicforms/vue-forms';

const name = new Field({ value: 'John' });
const age  = new Field<number>({ value: 30 });
```

## `new Field<T>(params?)`

`params` is an `IFieldParams<T, X>` and is optional. It contains the members below, plus the
[extended properties](#extended-properties) the field's second type argument declares.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params.value` | `T` | `undefined` | Initial value. Leaving it out, or passing `undefined`, falls back to `originalValue`; an explicit `null` is kept as the value |
| `params.originalValue` | `T` | same as `value` | Baseline for `isChanged`, and the initial value when no `value` is given |
| `params.access` | [`Access`](#access) | `'editable'` | Whether the field accepts input, what it sends to its container, and whether it is validated. A write to `value` is accepted whatever the access. See [What a container serializes](/api/container#what-a-container-serializes). |
| `params.visibility` | [`Visibility`](#visibility) | `'full'` | How a rendering layer shows the field. It does not affect what the field sends or whether it is validated. |
| `params.touched` | `boolean` | `false` | Initial interaction flag |
| `params.errors` | `ValidationError[]` | `[]` | Initial validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | Validator actions; each runs once over the constructed value |
| `params.actions` | `FieldActionBase[]` | `[]` | Additional actions to register |

`validators` and `actions` are registered before the remaining parameters are applied, and registration itself
fires no action. An action that guards a property set in the same parameter object (an `AccessChangingAction` with
`access`, a `VisibilityChangingAction` with `visibility`) is therefore registered for that assignment and can
rewrite or veto it, and the matching `AccessChangedAction` / `VisibilityChangedAction` fires with the result.
At the end of the constructor every eager action, validators included, runs exactly once over what the finished field
sends.

A parameter object containing `enabled` throws a `TypeError`: `enabled` is derived from `access` and cannot be
assigned. The check is made at runtime as well as by the type, so a parameter object parsed from JSON or typed `any`
also throws; the key is not silently dropped.

These are the only accepted parameters, and they are exactly the writable members of a field. Derived members
(`valid`, `validating`, `busy`, `pending`, `fullValue`, `isChanged`) and the container back-references (`parent`,
`fieldName`) are rejected by the type checker. All eight are getter-only, so assigning any of them throws a `TypeError`, whether or
not the field belongs to a container. Only the container sets `parent` and `fieldName`.

The first generic argument is inferred from `params.value`, so `new Field({ value: 'John' })` is a `Field<string>`
and `new Field()` is a `Field<any>`. Pass it explicitly when the initial value does not pin the type you want:
`new Field<number | null>({ value: null })`. The second type argument is never inferred; see
[extended properties](#extended-properties).

### `IFieldConstructorParams<T>`

The exported type of the members every form element accepts. `IFieldParams<T, X>` makes it partial and adds the
extended properties:

```typescript
type IFieldConstructorParams<T = any> = {
  value: T;
  originalValue: T;
  access: Access;
  visibility: Visibility;
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

const defaults: Partial<IFieldConstructorParams<string>> = { value: '', access: 'readonly' };
const field = new Field(defaults);
```

### Extended properties

A field holds any properties you declare for it beyond the members above, such as a label, a hint, a css class or a
permission flag. A form whose shape comes from a server stores them on its elements, and a UI layer reads them from
there. They are declared as the second type argument and read through `extra`:

```typescript
interface Presentation {
  label: string;
  hint?: string;
}

const name = new Field<string, Presentation>({ value: 'John', label: 'First name', hint: 'as in your passport' });

name.extra.label;                                 // 'First name'
name.setExtendedValues({ label: 'Given name' });  // hint stays as it was
```

Only declared properties are accepted: `X` is excluded from type inference, so a parameter object naming a property
`X` does not declare is rejected as an excess property. To declare properties for a single field, pass both type
arguments (`new Field<string, Presentation>(…)`); the parameter object then accepts exactly the members of
`Presentation` in addition to the ones every field accepts. When the second argument is omitted, `X` is
[`Extras`](#extras).

A parameter named after a member the class declares sets that member and is not an extended property: `access` sets
`access`, and `valid` throws a `TypeError`, with or without extended properties.
`Action` declares `label` and `icon`, so those two parameters set an action's value; give an action's *other*
presentation properties other names. Where a subclass reads `label` or `icon` in a shape of its own, see
[Widening the value in a subclass](/api/actions#widening-the-value-in-a-subclass): that is an accessor pair (getter
and setter) on the subclass, not an extended property. `List` declares `length` and `items`, both read-only, so a
parameter of either name throws the same `TypeError` as `valid`. In your own subclass, an accessor counts as a
declared member and a class field does not: class fields are defined on the instance after the base constructor has
applied the parameters, so a parameter with a class field's name becomes an extended property and the class field
keeps its initializer. Declare the member as an accessor where a parameter of its name should set it.

`validators` and `actions` list what to register on the element, so neither becomes an extended property, in a
constructor or in a `bind()` override.

`extra` is read-only and the object it returns is frozen. `setExtendedValues(values)` writes extended properties
and merges them: a call naming one property leaves the others unchanged. The read is tracked like every other read
through an element, so a template rendering `field.extra.label` re-renders when the property is written, and a write
inside a `transaction()` that rolls back is reverted with the rest of the transaction.

Its type is `Readonly<Partial<X>>`, so every property is typed as possibly `undefined`, whatever `X` declares: a
parameter object may contain any subset of them, `setExtendedValues()` may write any subset, and a property is
present only once it has been written.

```typescript
const bare = new Field<string, Presentation>({ value: 'John' }); // legal: every extended property is optional
bare.extra.label; // string | undefined
```

`Group`, `List` and `Action` take the same type argument in the same position: `Group<Fields, X>`, `List<Row, X>`,
`Action<Value, X>`.

### `Extras`

`X` defaults to `Extras`, an empty interface exported for augmentation. The rendering layer declares its properties
once, and every element in the application accepts them, with no type argument at any construction site:

```typescript
// in the UI layer
declare module '@dynamicforms/vue-forms' {
  interface Extras {
    label?: string;
    hint?: string;
    cssClass?: string;
  }
}

// in the application
const form = new Group({
  name: new Field({ value: '', label: 'First name' }),
  age: new Field({ value: 0, cssClass: 'w-25' }),
});

form.fields.name.extra.label; // string | undefined
```

This also covers the members of a `Group` written inline, which have no type argument of their own: they accept the
properties without per-member annotation.

There is one `Extras` interface per application. Two packages that declare a property of the same name must give it
the same type, because declaration merging rejects a differing second declaration. A library that augments `Extras`
should therefore document what it adds.

An explicit `X` **replaces** the default; it does not extend it. Use `Extras & Local` to have both:

```typescript
new Field<string, Extras & { badge: string }>({ value: 'a', label: 'Name', badge: 'new' });
```

`Action` has a different default: `Extras` without the keys of
[`ActionValue`](/api/actions#the-action-class), because `label` and `icon` are members an action declares itself and a
parameter of either name sets its value. An augmented `label` is therefore `action.label`, never
`action.extra.label`.

The default applies to `FieldBase<T>` as well, so a validator or an action handler, both of which receive their
element as `FieldBase<T>`, reads the augmented properties without a cast.

### `IFieldParams<T, X>`

The exported type of the parameter object itself, taken by `new Field`, `new Action`, `new Group` and `new List`:

```typescript
type IFieldParams<T = any, X extends object = Extras> = Partial<IFieldConstructorParams<T>> & Partial<NoInfer<X>>;
```

The two halves are made partial separately because `T` is inferred through this type. With
`Partial<IFieldConstructorParams<T> & X>`, inference through a mapped type over an intersection yields one
constituent of a union instead of the union, and `new Field({ value: stringOrNumber })` would be a `Field<string>`.

### `IBindParams<T, X>`

The exported type of the second argument of `bind()`: the three members a binding can override on the element it
is bound from, plus the extended properties.

```typescript
type IBindParams<T = any, X extends object = Extras> = Partial<
  Pick<IFieldConstructorParams<T>, 'originalValue' | 'access' | 'visibility'>
> &
  Partial<NoInfer<X>>;
```

`value` is the first argument of `bind()`. The other constructor parameters are excluded because a binding cannot
apply them: `validators` and `actions` are copied from the declaration, and the binding sets its own `touched` and
`errors` as it validates. Naming any of them is a compile error.

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | `T` | yes | Current value. A write is accepted whatever the access; the value the field ends up holding depends on [what is registered on the field](#writing-the-value). Values are compared by identity, so `ValueChangedAction` fires for a new object even when it is deeply equal to the old one, and does not fire when the field is assigned the object it already holds. Assign a modified copy instead of mutating in place. `isChanged` is separate and uses deep equality. |
| `originalValue` | `T` | yes | Value as provided at creation. Assigning it resets the baseline for `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` (deep equality) |
| `access` | [`Access`](#access) | yes | Whether the element accepts input, what it sends to its container, and whether its validators run: `'editable'` and `'readonly'` send its value, `'disabled'` sends nothing and `'disabled-null'` sends `null`. A write to `value` is accepted whatever the access, so a record loaded into the form is written to the element. Changing `access` changes what every container above sends (each fires a [`ContributionChangedAction`](/api/actions#contributionchangedaction)) and runs the validators again on the element and its descendants. Writing the access the element already has is not a change: no `AccessChangingAction` runs, nothing is enrolled in an open transaction, and no `AccessChangedAction` fires. Writing a value that is not one of the four throws `Error("'x' is not an access: …")`. See [What a container serializes](/api/container#what-a-container-serializes). |
| `effectiveAccess` | [`Access`](#access) | no | The access that applies once the containers above are taken into account: `'disabled'` below a container that is `'disabled'` or `'disabled-null'`, `'readonly'` for an `'editable'` element below a `'readonly'` one, and the element's own access otherwise. An element whose `effectiveAccess` is `'disabled'` sends nothing, so its validators produce no result and it has none of their errors |
| `contribution` | `unknown` | no | What the element sends to its container's `value`: its value, `null` for `'disabled-null'`, `undefined` for `'disabled'`. The element's validators run over this value |
| `enabled` | `boolean` | no | `true` where `access` is `'editable'`: the element accepts input. It describes input only: a `'readonly'` element is not enabled and still sends its value |
| `effectiveEnabled` | `boolean` | no | `true` where `effectiveAccess` is `'editable'`: this element and every container above it accept input. A rendering layer binds this instead of walking the parent chain |
| `visibility` | [`Visibility`](#visibility) | yes | How a rendering layer shows the element: `'full'`, `'invisible'`, `'hidden'` or `'suppress'`. It is presentation only and does not affect what the element sends or whether it is validated. Writing the visibility the element already has is not a change, as for `access`. Writing a value that is not one of the four throws `Error("'x' is not a visibility: …")`. |
| `valid` | `boolean` | no | `true` when `errors` is empty. It is computed from the live array, so it reflects an error pushed in by hand without any call. `ValidChangedAction` fires only when `validate()` is called |
| `validating` | `boolean` | no | `true` while an asynchronous validation is in flight on this element **or on any of its descendants**, so on a form it covers the whole tree. An element counts its own runs through `beginValidating()` / `endValidating()`, which validators call around a returned promise, and a container keeps a count of how many of its children are `validating`. Reading it is O(1) whatever the size of the tree; a run that starts or settles updates one count per nesting level |
| `busy` | `boolean` | no | `true` while an `Action.execute()` at or below the element has yet to settle. An `Action` covers its own runs, a `Group` or `List` the actions below it, and any other element is always `false`. `busy` covers executions and `validating` covers validations; `pending` covers both |
| `pending` | `boolean` | no | `validating \|\| busy`: `true` while an asynchronous validation or an `Action.execute()` at or below the element has not settled. Reactive, so a submit button binds to it. [`settled()`](#settled-promise-void) resolves when it turns `false` |
| `validationEpoch` | `number` | no | Generation counter of the field's validators, incremented by `clearValidators()` and by `unregisterAction()` on a validator. A `Validator` reads it to check whether a result it is about to apply still belongs to the validators the field currently has |
| `errors` | `ValidationError[]` | yes | Current validation errors. Writable. The getter returns the array the element holds, so pushing into it works. `valid` updates immediately, on this field and on the containers above it; `ValidChangedAction` fires only when `validate()` is called. The array is reactive, so an error read back from it is a Vue proxy of the original instance: `field.errors[0] === myError` is `false` for the error a validator returned. Compare by content, or use `toRaw()` |
| `touched` | `boolean` | yes | Interaction flag. The library does not set it in response to input; your UI must assign `field.touched = true` (e.g. on blur). `Group`/`List` aggregate it from their children and propagate an assignment down |
| `parent` | `Container \| undefined` | no | Container the element belongs to. The container sets it and clears it when it releases the element: a `List` row removed by `remove()`, `pop()`, `clear()` or a shortening `value` assignment has no `parent` and may be added to another list. A container rejects an element that still has a `parent`, so pass the released instance or a `bind()` of it. The container is a `Group` or a `List`, and [`Container`](/api/container) declares no children, so accessing `fields` through it is a compile error until it is narrowed: with `field.parent instanceof Group` or `(field.parent as Group)?.fields.other`. Naming the sibling and letting [`CompareTo`](/api/validators#new-validators-compareto-otherfield-isvalidcomparison-message) resolve it needs neither; see [`parent`](/api/container#parent). The read is tracked, so a template rendering from `field.parent` updates when the element moves to another container |
| `fieldName` | `string \| undefined` | no | Key name within the parent `Group` |
| `declaration` | `FieldBase` | no | The element this one was declared as: itself for an element built from parameters, and the element `bind()` was called on for a binding, transitively, so a binding of a binding has the same `declaration`. Every row a `List` builds from its item template is a binding of it, so `list.get(0).fields.a.declaration === template.fields.a`. An action shared by every row uses it to tell one row's field from another's |
| `fullValue` | `T` | no | Identical to `value` on a plain `Field`. On a `Group` and a `List` it is what the element holds, while `value` is what it sends; see [`Group`](/api/group#properties) and [`List`](/api/list#properties) |
| `extra` | `Readonly<Partial<X>>` | no | The [extended properties](#extended-properties) the field holds, `{}` where none were declared. The object is frozen; write through `setExtendedValues()` |

## Writing the value

The value a field holds after a write to `value` depends on the actions registered on it. A `ValueChangedAction`
may write another value back (a rule that trims, rounds or caps), and a handler that throws reverts the whole write
and rethrows, so the field keeps its previous value. The write itself is not intercepted: there is no
`ValueChangingAction` corresponding to `AccessChangingAction` and `VisibilityChangingAction`; `ValueChangedAction`
runs after the value is stored. Inside an open `transaction()` the handlers run at the commit, so the final value is
known once the outermost `transaction()` call returns.

Read the field back to get the value it holds:

```typescript
field.value = typed;
if (field.value !== typed) {
  // the field holds something other than what was written
}
```

### What a rendering layer sees

Where the field ends up holding a value that differs from both the written value and its previous value, every
read of it updates: a `computed`
over `field.value` returns the new value, an effect that reads it re-runs, and a control rendering from either
re-renders.

Where the field ends up holding the value it held before the write, no read updates. A write of the value the field
already holds does not write the reactive slot. A rule that restores the previous five characters after a
six-character write, and a handler that throws, both leave the slot holding its previous value. In each case a
`computed` over `field.value` returns the same value as before, so nothing rendering through it re-runs; an effect
reading the field directly re-runs where the slot was written and restored, and reads the same value both times.

The control already shows what was typed: a native input holds the text in its own DOM before the input event is
dispatched to the field. Since no read updates, the control is not re-rendered and shows a value the field does not
hold until an unrelated change re-renders it. In the example, the field holds five characters and the input shows
six.

**A binding layer must handle this case itself.** The read the control renders from must update even where the
field did not, by returning the written value for one tick and the field's value from the next one:

```typescript
import { computed, nextTick, shallowRef } from 'vue';

// inside a composable holding the element as field: FieldBase<T>
const pending = shallowRef<{ value: T } | null>(null);

const model = computed<T>({
  get: () => (pending.value ? pending.value.value : field.value),
  set: (newValue: T) => {
    try {
      field.value = newValue;
    } finally {
      if (field.value !== newValue) {
        pending.value = { value: newValue };
        nextTick(() => {
          pending.value = null;
        });
      }
    }
  },
});
```

Wherever the field holds something other than what was written (another value, or the value it already held), the
read returns the written value for the rest of that tick and the field's value from the next one. The second change
re-renders the control, so it shows what the field holds whether or not the field's value changed. The `finally`
covers a handler that throws: the exception propagates to the caller and the read is still corrected.
`@dynamicforms/vuetify-inputs` implements this in
[`useInputBase()`](https://github.com/dynamicforms/vuetify-inputs/blob/main/src/helpers/input-base.ts), which every
input in that library uses.

## Methods

### `registerAction(action): this`

Registers an action (validator or event handler). Returns `this` for chaining.

```typescript
field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('changed to', newValue);
  return supr(field, newValue, oldValue);
}));
```

Every binding of an element has the action instances registered on that element, so **an action registered on
a `List`'s item template fires for every row**. The first argument the executor receives is the element it fired
for; a handler uses it to distinguish rows:

```typescript
template.fields.amount.registerAction(new ValueChangedAction((field, supr, newValue) => {
  if (field.parent === list.get(0)) console.log('the first row changed to', newValue);
  return supr(field, newValue);
}));
```

State an action keeps between runs is stored per element, not on the action; see
[Writing custom actions](/api/actions#custom-actions).

The newest registration is the outermost handler: it runs first and calls the ones registered before it through
`supr`. A registration made inside a [transaction](/api/transactions) is undone if the transaction rolls back.

### `registerActionBefore(action, before): this`

Registers `action` so that `before` wraps it: `before` runs first and calls `action` through the `supr` it receives.
This adds an action to an existing chain *inside* a handler that is already registered, which registration order
alone cannot do. Returns `this`.

```typescript
// the audit handler already registered wraps this one, so it sees the value the trimming leaves behind
field.registerActionBefore(
  new ValueChangedAction((f, supr, newValue, oldValue) => supr(f, newValue.trim(), oldValue)),
  audit,
);
```

`before` must be registered on this element under the same `classIdentifier` as `action`; otherwise the call
throws `Error('Action to register before is not registered under the same identifier')`.

### `unregisterAction(action): boolean`

Removes `action` from this element and returns whether the element had it. The instance stays registered on every
other element it was registered on: a `Required` registered on a `List`'s item template applies to every row, and
unregistering it from one row leaves it active on the others.

```typescript
const required = new Validators.Required();
const field = new Field({ value: '', validators: [required] });
field.valid;                      // false
field.unregisterAction(required); // true
field.valid;                      // true: the validator's error is removed with it
```

A `Validator` removes the errors it added to the element when it is unregistered, so the validation result is that
of the validators the element still has; errors from other sources remain. Any other action releases what it
installed for this element through `unregisterFrom()`. A validation still in flight is cancelled and its result
discarded. Called inside a [transaction](/api/transactions), the unregistration is undone if the transaction rolls
back, and so is the cancellation: the run continues and its result is applied, so the field is never valid over a
value no validator checked.

### `bindingsOf(declaration): FieldBase[]`

Returns every element in this element's subtree, this element included, whose `declaration` is the one given:
`list.bindingsOf(template.fields.a)` returns the `a` field of every row.

### `markRecordIncomplete(): void`

Marks that an eager action running over this element looked for a second element of the record and did not find
it because the record was not assembled yet (a `List` row's members are bound before the row exists as their parent).
The container that completes the record runs this element's eager actions again, and so does a container that the
record is added to later. Only action implementations call it; see
[Reading a second element of the record](/api/actions#reading-a-second-element-of-the-record).

### `triggerAction(actionClass, ...params): any`

Manually fires a specific action class on this field. `actionClass` is the class itself, not an instance; it is
looked up by its static `classIdentifier`, so abstract classes work too. Returns what the chain returns, `null`
when no action of that type is registered, and the [`AbortEventHandlingException`](/api/actions#aborteventhandlingexception)
instance where a handler threw one to end the run (a promise resolving to it where the chain went through an
asynchronous handler).

### `validate(revalidate?): void`

Publishes the validity derived from the element's `errors`. Pass `revalidate: true` to first re-run every eager
action, validators included, over the element's current value. When the validity differs from the last published
one, it fires `ValidChangedAction` and notifies the parent container, so a field that becomes invalid is reflected in
the `Group` or `List` holding it. Called inside a [transaction](/api/transactions), it fires at the end of the
transaction, together with the transaction's other changes.

### `clearValidators(): void`

Removes the validators registered on this element, empties `errors` and recalculates `valid`. All errors are
removed, including ones no validator added, such as server-side errors pushed in from outside. The validity change is
published as any other: a field that was invalid fires `ValidChangedAction` and its container re-evaluates its own
validity. A validation still in flight is cancelled, so it cannot add an error to a field that no longer has the
validator that produced it. A validator that installed a listener elsewhere (`CompareTo`, on the field it compares
against) has that listener released with the registration. An operation that rolls back restores both, including
the cancelled run: it continues and its result is applied.

Validators belong to the element's **declaration**, so the call applies to the declaration: clearing the validators
of one row of a `List` clears them for every row, because they are registered on the item template. On the other
rows only the errors those validators added are removed; errors from other sources stay. On the element the call is
made on, all errors are removed. `unregisterAction()` removes a single validator instead of all of
them, and removes the errors that validator added, on every element.

It does not descend into members. A `Group` or a `List` also derives `valid` from its members, so
`group.clearValidators()` leaves `group.valid` at `false` while any member is still invalid; call
`clearValidators()` on the members whose validators you also want gone.

### `settled(): Promise<void>`

Resolves once nothing at or below the element is running: no asynchronous validation and no unsettled
`Action.execute()`, which is when `pending` turns `false`. It resolves immediately where `pending` is `false`. A
submit handler awaits it, because the click that runs the handler can start a validation in the same event (a
blur that commits a value), before the button's `:disabled` is re-rendered. [Submitting](/guide/cookbook#submitting) shows it in a submit handler.

It reflects the state at the moment it resolves only: work started later makes the element run again. A caller
that acts on a settled tree reads what it needs immediately after awaiting.

### `beginValidating(): void` / `endValidating(): void`

Increment and decrement the async-validation counter behind `validating`. `Validator` calls them around a
validation function that returns a promise; call them yourself only if you run asynchronous validation outside a
`Validator`. A call that switches the element between running and idle updates the count the container above it
keeps, and so on up the tree. An `endValidating()` without a matching `beginValidating()` is a no-op: the counter
never goes below zero, and the containers above are not updated.

A rolled-back [transaction](/api/transactions) does not restore these counters: a run in flight continues, and
restored counts would not match the `endValidating()` calls still to come.

### `setExtendedValues(values): void`

Writes [extended properties](#extended-properties). `values` is a `Partial<X>` and is merged over the field's
current ones, so a call naming one property leaves the others unchanged, and no property is ever removed. The merged
set replaces the frozen object `extra` returns; this makes the write reactive and lets a rolled-back transaction
restore the previous set.

```typescript
field.setExtendedValues({ label: 'Given name' });
```

### `bind(data?, overrides?): this`

Returns a new reactive field over `data`, with the same registered actions and the same extended properties. It
applies a declared field to a record. The new field's `declaration` is the field `bind()` was called on.

With `data` `undefined`, the new field holds the current value; an explicit `null` is data, so `bind(null)` returns
a field holding `null`. `overrides` is an [`IBindParams<T, X>`](#ibindparams-t-x): `originalValue`, `access`,
`visibility` and the extended properties only. Any other key is a type error. Extended properties it names are
merged over the ones copied from the bound field, and are set before the new field's eager actions run.
`originalValue` is applied when the key is present.

The new field is constructed through `this.constructor`, so a subclass of `Field` binds into its own class. It is
detached: it has no `parent` and no `fieldName`. `originalValue` is taken from `overrides` only when passed
explicitly; otherwise it is the bound data, so `isChanged` starts out `false`.

```typescript
const row = template.bind({ name: 'John' });   // a group over one record
const copy = field.bind(field.value);          // another field holding what this one holds
```

### `rebind(data): this`

Replaces the data the field holds with `data`, in place. The element remains the same instance, with its actions,
its extended properties and its position in its container unchanged, and ends up in the state `bind(data)` would
have produced: the values are written, `originalValue` is set to them so `isChanged` is `false`, `touched` is reset to
`false` and the validators run over the new data. It reuses one element across records, as a virtualised renderer
does with the rows it keeps.

No `ValueChangedAction` fires for the element itself, as for a newly built element. Its members do fire theirs
(the fields of a rebound row fire `ValueChangedAction` for their new values), and a validity change is published as
always, so a rebound row that is invalid notifies the list holding it.

A disabled `Field` takes the value, as it does any write to `value`. A disabled `Group` or `List` writes through
to its members, as an assignment to it does.

Inside an open `transaction()`, a change of the element that the commit has yet to announce is kept: the commit
announces the old and new values measured from the element's state when the transaction opened.

On a `Group` the record need not name every member: a missing key is taken from the element's `declaration`, so a
reused row ends up as a fresh binding of the item template would, not with the previous record's value.

```typescript
const row = list.get(0)!;
row.rebind({ name: 'Jane', age: 25 });   // same instance, next record
```

`Field` has no `clear()`: an empty value depends on `T`, which the library cannot determine. Reset a field with
`rebind(field.originalValue)` or an explicit `rebind('')` (or `rebind(null)` where `T` allows it). See
[Clearing and resetting](/guide/cookbook#clearing-and-resetting-a-form) for `Group` and `List`, which do have a
structural "empty".

## Subclassing

`new` constructs a subclass of `Field`, `Action`, `Group` or `List`, and `bind()` constructs through
`this.constructor`, so a subclass binds into its own class. Two protected hooks shape a construction.

`init(params)`, on `Field` and `Action`, applies the constructor parameters; `Group` and `List` apply theirs in
their constructors. Override it where the subclass accepts parameters of its own shape, and read only the parameters
in it: it runs from the base constructor, so a member the subclass declares as a class field is still `undefined`
while it runs, and anything it assigns to one is overwritten when the initializer runs.

`constructed(params)` is the last step of a construction, and all four classes call it. It runs inside the
construction's transaction, with the parameters applied and the value set, before the element records its initial
state. Override it to complete the element: a value member the caller may omit, a baseline of its own, a member a
container fills in. What it writes is part of the construction, not a change:

- no `ValueChangedAction` fires for the element;
- `isChanged` starts `false`: where the parameters give no `originalValue`, the baseline is the value the hook
  leaves;
- the eager actions and the validators run once, over what the completed element sends.

```typescript
class Money extends Field<{ amount: number; currency?: string }> {
  protected constructed() {
    // the currency a caller need not state
    if (this._value?.currency === undefined) this._value = { ...this._value, currency: 'EUR' };
  }
}

const price = new Money({ value: { amount: 12 }, access: 'readonly' });
price.value;      // { amount: 12, currency: 'EUR' }
price.isChanged;  // false
```

A container completes itself through its members, and each member has already been constructed: the write is an
ordinary write to the member, so the member fires its `ValueChangedAction` and has `isChanged` `true`, while the
container's baseline is the record the hook leaves. Set the member's `originalValue` as well where it should start
unchanged:

```typescript
class Address extends Group<{ street: Field<string>; country: Field<string> }> {
  protected constructed() {
    const country = this.fields.country;
    if (!country.value) {
      country.value = 'SI';
      country.originalValue = country.value;
    }
  }
}

const address = new Address({ street: new Field<string>({ value: 'Main 1' }), country: new Field<string>() });
address.value;                    // { street: 'Main 1', country: 'SI' }
address.isChanged;                // false
address.fields.country.isChanged; // false
```

## `Access`

```typescript
type Access = 'editable' | 'readonly' | 'disabled' | 'disabled-null';
```

What an element accepts and what it sends. The four values follow HTML: an `<input readonly>` is submitted with
its value and an `<input disabled>` is left out:

| `access` | Accepts input | Sends to its container's `value` | Validated |
|---|---|---|---|
| `'editable'` | yes | its value | over its value |
| `'readonly'` | no | its value | over its value |
| `'disabled'` | no | nothing: the key, or the row, is left out | no |
| `'disabled-null'` | no | `null` | over `null` |

`accessValues` lists the four, `defaultAccess` is `'editable'`, and `isAccess(value)` returns whether a value is
one of them; a deserializer uses it to check an access value without the exception the setter throws. See
[What a container serializes](/api/container#what-a-container-serializes) for how a container's access applies to
the elements inside it.

## `Visibility`

```typescript
type Visibility = 'full' | 'invisible' | 'hidden' | 'suppress';
```

How a rendering layer shows an element. It is presentation only: what the element sends and whether it is
validated depend on its `access`.

| `visibility` | Rendered |
|---|---|
| `'full'` | shown |
| `'invisible'` | rendered and keeps its space, but is not painted (`visibility: hidden`) |
| `'hidden'` | rendered but not displayed, taking no space (`display: none`) |
| `'suppress'` | not rendered at all |

`visibilityValues` lists the four, `defaultVisibility` is `'full'`, and `isVisibility(value)` returns whether a
value is one of them.

## `NullableField<T>`

Type alias for `Field<T> | null`.

## `FieldBase<T>`

The exported abstract base of `Field`, `Action`, `Group` and `List`, and the type to use wherever you accept "any
form element": every library signature that takes a field (action executors, `ValidationFunction`,
`Group`'s `fields` map, `CompareTo`'s `otherField`) is typed `FieldBase`.

`T` is the type of `value`, and each subclass passes its own through: `Field<T>` and `Action<T>` extend
`FieldBase<T>`, while `Group<T>` extends [`Container<GroupValue<T>>`](/api/container) and `List<R>` extends
`Container<ListValue<R>>`, and `Container<T>` extends `FieldBase<T>`. `X`
is the second type argument of each of them, the [extended properties](#extended-properties) the element
holds. It defaults to [`Extras`](#extras), so `FieldBase` without type arguments is the type of any form element, and
a validator or an action handler reads the augmented properties from the element it receives.

It provides `originalValue`, `access`, `effectiveAccess`, `contribution`, `enabled`, `effectiveEnabled`, `visibility`,
`valid`, `errors`, `validating`, `busy`, `pending`,
`validationEpoch`, `isChanged`, `fullValue`, `parent`, `fieldName`, `extra`, `registerAction()`, `registerActionBefore()`,
`unregisterAction()`, `triggerAction()`, `validate()`, `clearValidators()`, `setExtendedValues()`, `rebind()`,
`beginValidating()` and `endValidating()`, so these work the same way on every form
element. `value`, `touched` and `bind()` are abstract and implemented by each subclass.

It holds every mutable member of an element in a separate reactive state object, so every form element is reactive
without a wrapper: reading `field.value` in a template or a `computed` subscribes to that one slot, and assigning it
re-renders whatever read it. The element itself is not a proxy, so `toRaw(field)` is `field`, and
`watch(field, cb)` with a bare element as the source never fires. Watch the members you read:
`watch(() => field.value, cb)`.

A structural comparison of two elements (lodash `isEqual(fieldA, fieldB)`) compares identity. The element state is
in private class fields, which a structural comparison does not read, so without further measures it would return
`true` for any two instances of the same class. `FieldBase` has a `Symbol.toStringTag` accessor returning the
element's class name; a structural comparison reads the tag first and returns `false` for two distinct objects with a
tag it does not know.
Two elements are therefore equal only where they are the same element; compare their contents with
`isEqual(a.value, b.value)`. The accessor is defined on the prototype, so it adds nothing to each instance, and
`Object.prototype.toString.call(field)` returns `[object Field]`. See
[Comparing elements](/guide/model#comparing-elements) for the package's own `isEqual`, the pitfalls it avoids and
the cases it does not cover.

### `isEqual(a, b): boolean`

Structural equality that treats a `FieldBase` anywhere in `a` or `b` as the value it holds. Two `FieldBase`
operands compare `a.value` against `b.value` directly; anything else is passed to lodash's `isEqual`, with a
`FieldBase` found at any depth unwrapped the same way. See
[Comparing elements](/guide/model#comparing-elements) for when to use it instead of `isEqual(a.value,
b.value)`.

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
