# FieldBase

`FieldBase` (element) is the abstract base class of every element: [`Field`](/api/field),
[`Action`](/api/action), [`Group`](/api/group) and [`List`](/api/list). It is the type to use
wherever you accept any form element: every library signature that takes an element (action executors,
`ValidationFunction`, `Group`'s `fields` map, `CompareTo`'s `otherField`) is typed `FieldBase`.

```
FieldBase ─┬─ Field ── Action
           └─ Container ─┬─ Group
                         └─ List
```

`T` is the type of `value`, and each subclass passes its own through: `Field<T>` and `Action<T>` extend
`FieldBase<T>`, while `Group<T>` extends [`Container<GroupValue<T>>`](/api/container) and `List<R>` extends
`Container<ListValue<R>>`, and `Container<T>` extends `FieldBase<T>`. `X` is the second type argument of each of
them, the [extended properties](#extended-properties) the element holds. It defaults to [`Extras`](#extras), so
`FieldBase` without type arguments is the type of any form element, and a validator or an action handler reads the
augmented properties from the element it receives.

It provides every member listed under [Properties](#properties) and [Methods](#methods), so these work the same
way on every element. `value`, `touched` and `bind()` are abstract and implemented by each subclass. Where a
subclass overrides a member, the entry below names it and links to the override.

It holds every mutable member of an element in a separate reactive state object, so every form element is reactive
without a wrapper: reading `field.value` in a template or a `computed` subscribes to that one slot, and assigning it
re-renders whatever read it. The element itself is not a proxy, so `toRaw(field)` is `field`, and
`watch(field, cb)` with a bare element as the source never fires. Watch the members you read:
`watch(() => field.value, cb)`.

The state is held in private class fields, which `Object.keys(field)`, `Object.getOwnPropertySymbols(field)` and
`JSON.stringify(field)` do not see. None of the three reaches the `parent` link, so a walk over a group does not
follow its descendants' back-references and terminates.

`instanceof FieldBase` is both the recommended type guard and the runtime check the library itself performs:
`new Group({...})` rejects a member that is not a `FieldBase` with `Error('Invalid fields object provided')`.

```typescript
import { FieldBase } from '@dynamicforms/vue-forms';

function isDirty(field: FieldBase): boolean {
  return field.isChanged;
}
```

## Constructor parameters

`new Field(params?)`, `new Action(params?)`, `new Group(fields, params?)` and `new List(itemTemplate?, params?)`
take `params` as an [`IFieldParams<T, X>`](#ifieldparams-t-x), with `T` the element's value type. It contains the
members below, plus the [extended properties](#extended-properties) the element's second type argument declares.
`value`, `originalValue` and `touched` depend on the class and are described on each class's page.

<table class="members">
<thead><tr><th>Parameter</th><th>Type</th><th>Default</th></tr></thead>
<tbody>
<tr class="member-head"><td>

**`params.access`**

</td><td>

[`Access`](#access)

</td><td>

default `'editable'`

</td></tr>
<tr class="member-desc"><td colspan="3">

Whether the element accepts input, what it sends to its container, and whether it is validated. A write to `value` is accepted whatever the access. See [What a container serializes](/api/container#what-a-container-serializes).

</td></tr>
<tr class="member-head"><td>

**`params.actions`**

</td><td>

`FieldActionBase[]`

</td><td>

default `[]`

</td></tr>
<tr class="member-desc"><td colspan="3">

Additional actions to register on the element

</td></tr>
<tr class="member-head"><td>

**`params.errors`**

</td><td>

`ValidationError[]`

</td><td>

default `[]`

</td></tr>
<tr class="member-desc"><td colspan="3">

Initial validation errors of the element

</td></tr>
<tr class="member-head"><td>

**`params.originalValue`**

</td><td>

`T`

</td><td>

default same as `value`

</td></tr>
<tr class="member-desc"><td colspan="3">

Baseline for `isChanged`; see [`Field`](/api/field#new-field-t-params), [`Action`](/api/action), [`Group`](/api/group#new-group-fields-params), [`List`](/api/list#new-list-itemtemplate-params)

</td></tr>
<tr class="member-head"><td>

**`params.touched`**

</td><td>

`boolean`

</td><td>

default `false`

</td></tr>
<tr class="member-desc"><td colspan="3">

Initial interaction flag; see [`Group`](/api/group#new-group-fields-params) and [`List`](/api/list#new-list-itemtemplate-params) for containers

</td></tr>
<tr class="member-head"><td>

**`params.validators`**

</td><td>

`FieldActionBase[]`

</td><td>

default `[]`

</td></tr>
<tr class="member-desc"><td colspan="3">

Validator actions of the element; each runs once over the constructed value

</td></tr>
<tr class="member-head"><td>

**`params.value`**

</td><td>

`T`

</td><td>

default per class

</td></tr>
<tr class="member-desc"><td colspan="3">

Initial value; see [`Field`](/api/field#new-field-t-params), [`Action`](/api/action), [`Group`](/api/group#new-group-fields-params), [`List`](/api/list#new-list-itemtemplate-params)

</td></tr>
<tr class="member-head"><td>

**`params.visibility`**

</td><td>

[`Visibility`](#visibility)

</td><td>

default `'full'`

</td></tr>
<tr class="member-desc"><td colspan="3">

How a rendering layer shows the element. It does not affect what the element sends or whether it is validated.

</td></tr>
</tbody>
</table>

`validators` and `actions` are registered before the remaining parameters are applied, and registration itself
fires no action. An action that guards a property set in the same parameter object (an `AccessChangingAction` with
`access`, a `VisibilityChangingAction` with `visibility`) is therefore registered for that assignment and can
rewrite or veto it, and the matching `AccessChangedAction` / `VisibilityChangedAction` fires with the result.
At the end of the constructor every eager action, validators included, runs exactly once over what the finished
element sends. `Field`, `Action`, `Group` and `List` all apply their parameters in this order.

A parameter object containing `enabled` throws a `TypeError`: `enabled` is derived from `access` and cannot be
assigned. The check is made at runtime as well as by the type, so a parameter object parsed from JSON or typed `any`
also throws; the key is not silently dropped.

These are the only accepted parameters, and they are exactly the writable members of an element. Derived members
(`valid`, `validating`, `busy`, `pending`, `fullValue`, `isChanged`) and the container back-references (`parent`,
`fieldName`) are rejected by the type checker. All eight are getter-only, so assigning any of them throws a
`TypeError`, whether or not the element belongs to a container. Only the container sets `parent` and `fieldName`.

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

An element holds any properties you declare for it beyond the members above, such as a label, a hint, a css class
or a permission flag. A form whose shape comes from a server stores them on its elements, and a UI layer reads them
from there. They are declared as the second type argument and read through `extra`:

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
`X` does not declare is rejected as an excess property. To declare properties for a single element, pass both type
arguments (`new Field<string, Presentation>(…)`); the parameter object then accepts exactly the members of
`Presentation` in addition to the ones every element accepts. When the second argument is omitted, `X` is
[`Extras`](#extras).

A parameter named after an accessor the class declares (a getter, a setter or both) sets that member and is not an
extended property: `access` sets `access`, and `valid`, a getter without a setter, throws a `TypeError`. A parameter
named after any other member, such as the method `validate`, is an extended property: it is stored in `extra` and
leaves the member as it is.
`Action` declares `label` and `icon`, so those two parameters set an action's value; give an action's *other*
presentation properties other names. Where a subclass reads `label` or `icon` in a shape of its own, see
[Widening the value in a subclass](/api/action#widening-the-value-in-a-subclass): that is an accessor pair (getter
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
[`ActionValue`](/api/action), because `label` and `icon` are members an action declares itself and a
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

<table class="members">
<thead><tr><th>Property</th><th>Type</th><th>Writable</th></tr></thead>
<tbody>
<tr class="member-head"><td><a id="prop-access"></a>

**`access`**

</td><td>

[`Access`](#access)

</td><td>

writable

</td></tr>
<tr class="member-desc"><td colspan="3">

Whether the element accepts input, what it sends to its container, and whether its validators run: `'editable'` and `'readonly'` send its value, `'disabled'` sends nothing and `'disabled-null'` sends `null`. A write to `value` is accepted whatever the access, so a record loaded into the form is written to the element. Changing `access` changes what every container above sends (each fires a [`ContributionChangedAction`](/api/actions#contributionchangedaction)) and runs the validators again on the element and its descendants. Writing the access the element already has is not a change: no `AccessChangingAction` runs, nothing is enrolled in an open transaction, and no `AccessChangedAction` fires. Writing a value that is not one of the four throws `Error("'x' is not an access: …")`. On a `Group` or a `List` the access also applies to every element inside it through `effectiveAccess`. See [What a container serializes](/api/container#what-a-container-serializes).

</td></tr>
<tr class="member-head"><td><a id="prop-busy"></a>

**`busy`**

</td><td>

`boolean`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

`true` while an `Action.execute()` at or below the element has yet to settle. On `FieldBase` it is always `false`; [`Action.busy`](/api/action) covers the action's own runs and [`Container.busy`](/api/container#prop-busy) the actions below a `Group` or `List`. `busy` covers executions and `validating` covers validations; `pending` covers both

</td></tr>
<tr class="member-head"><td><a id="prop-contribution"></a>

**`contribution`**

</td><td>

`unknown`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

What the element sends to its container's `value`: its value, `null` for `'disabled-null'`, `undefined` for `'disabled'`. The element's validators run over this value

</td></tr>
<tr class="member-head"><td><a id="prop-declaration"></a>

**`declaration`**

</td><td>

`FieldBase`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

The element this one was declared as: itself for an element built from parameters, and the element `bind()` was called on for a binding, transitively, so a binding of a binding has the same `declaration`. Every row a `List` builds from its item template is a binding of it, so `list.get(0).fields.a.declaration === template.fields.a`. An action shared by every row uses it to tell one row's field from another's

</td></tr>
<tr class="member-head"><td><a id="prop-effectiveAccess"></a>

**`effectiveAccess`**

</td><td>

[`Access`](#access)

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

The access that applies once the containers above are taken into account: `'disabled'` below a container that is `'disabled'` or `'disabled-null'`, `'readonly'` for an `'editable'` element below a `'readonly'` one, and the element's own access otherwise. An element whose `effectiveAccess` is `'disabled'` sends nothing, so its validators produce no result and it has none of their errors

</td></tr>
<tr class="member-head"><td><a id="prop-effectiveEnabled"></a>

**`effectiveEnabled`**

</td><td>

`boolean`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

`true` where `effectiveAccess` is `'editable'`: this element and every container above it accept input. A rendering layer binds this instead of walking the parent chain; on a `Group` or a `List` it reads it to draw the inputs of a whole section as not accepting input

</td></tr>
<tr class="member-head"><td><a id="prop-enabled"></a>

**`enabled`**

</td><td>

`boolean`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

`true` where `access` is `'editable'`: the element accepts input. It describes input only: a `'readonly'` element is not enabled and still sends its value

</td></tr>
<tr class="member-head"><td><a id="prop-errors"></a>

**`errors`**

</td><td>

`ValidationError[]`

</td><td>

writable

</td></tr>
<tr class="member-desc"><td colspan="3">

Current validation errors of the element; on a `Group` or a `List` these are the container's own errors. Writable, but normally managed by validators. The getter returns the array the element holds, so pushing into it works. `valid` updates immediately, on this element and on the containers above it; `ValidChangedAction` fires only when `validate()` is called. The array is reactive, so an error read back from it is a Vue proxy of the original instance: `field.errors[0] === myError` is `false` for the error a validator returned. Compare by content, or use `toRaw()`

</td></tr>
<tr class="member-head"><td><a id="prop-extra"></a>

**`extra`**

</td><td>

`Readonly<Partial<X>>`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

The [extended properties](#extended-properties) the element holds, `{}` where none were declared. The object is frozen; write through `setExtendedValues()`

</td></tr>
<tr class="member-head"><td><a id="prop-fieldName"></a>

**`fieldName`**

</td><td>

`string | undefined`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

Key name within the parent `Group`

</td></tr>
<tr class="member-head"><td><a id="prop-fullValue"></a>

**`fullValue`**

</td><td>

`T`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

Identical to `value` on `FieldBase`, and so on `Field` and `Action`. [`Group`](/api/group#prop-fullValue) and [`List`](/api/list#prop-fullValue) override it: there it is what the element holds, while `value` is what it sends

</td></tr>
<tr class="member-head"><td><a id="prop-isChanged"></a>

**`isChanged`**

</td><td>

`boolean`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

`true` when `value` differs from `originalValue` (deep equality)

</td></tr>
<tr class="member-head"><td><a id="prop-originalValue"></a>

**`originalValue`**

</td><td>

`T`

</td><td>

writable

</td></tr>
<tr class="member-desc"><td colspan="3">

Value as provided at creation. Assigning it resets the baseline for `isChanged`. On a `Group` or a `List` it is held as a separate, unfrozen copy, not the object `value` returns

</td></tr>
<tr class="member-head"><td><a id="prop-parent"></a>

**`parent`**

</td><td>

`Container | undefined`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

Container the element belongs to. The container sets it and clears it when it releases the element: a `List` row removed by `remove()`, `pop()`, `clear()` or a shortening `value` assignment has no `parent` and may be added to another list. A container rejects an element that still has a `parent`, so pass the released instance or a `bind()` of it. The container is a `Group` or a `List`, and [`Container`](/api/container) declares no children, so accessing `fields` through it is a compile error until it is narrowed: with `field.parent instanceof Group` or `(field.parent as Group)?.fields.other`. Naming the sibling and letting [`CompareTo`](/api/validators#new-validators-compareto-otherfield-isvalidcomparison-options) resolve it needs neither; see [`parent`](/api/container#parent). The read is tracked, so a template rendering from `field.parent` updates when the element moves to another container. `parent` and `fieldName` are read-only accessors; assigning either throws a `TypeError`

</td></tr>
<tr class="member-head"><td><a id="prop-pending"></a>

**`pending`**

</td><td>

`boolean`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

`validating || busy`: `true` while an asynchronous validation or an `Action.execute()` at or below the element has not settled. Reactive, so a submit button binds to it. [`settled()`](#settled-promise-void) resolves when it turns `false`

</td></tr>
<tr class="member-head"><td><a id="prop-touched"></a>

**`touched`**

</td><td>

`boolean`

</td><td>

writable

</td></tr>
<tr class="member-desc"><td colspan="3">

Interaction flag. The library does not set it in response to input; your UI must assign `field.touched = true` (e.g. on blur). Abstract on `FieldBase`: [`Field`](/api/field#prop-touched) stores it, and [`Container`](/api/container#prop-touched) aggregates it from the children of a `Group` or `List` and propagates an assignment down

</td></tr>
<tr class="member-head"><td><a id="prop-valid"></a>

**`valid`**

</td><td>

`boolean`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

`true` when `errors` is empty. It is computed from the live array, so it reflects an error pushed in by hand without any call. `ValidChangedAction` fires only when `validate()` is called. [`Container.valid`](/api/container#prop-valid) also requires every child it counts to be valid

</td></tr>
<tr class="member-head"><td><a id="prop-validating"></a>

**`validating`**

</td><td>

`boolean`

</td><td>

read-only

</td></tr>
<tr class="member-desc"><td colspan="3">

`true` while an asynchronous validation is in flight on this element **or on any of its descendants**, so on a form it covers the whole tree. An element counts its own asynchronous validation runs, which a `Validator` starts and ends around a returned promise, and a container keeps a count of how many of its children are `validating`. Reading it is O(1) whatever the size of the tree; a run that starts or settles updates one count per nesting level

</td></tr>
<tr class="member-head"><td><a id="prop-value"></a>

**`value`**

</td><td>

`T`

</td><td>

writable

</td></tr>
<tr class="member-desc"><td colspan="3">

Current value. A write is accepted whatever the access. Abstract on `FieldBase`: [`Field`](/api/field#prop-value), [`Group`](/api/group#prop-value) and [`List`](/api/list#prop-value) implement it, and `Action` inherits `Field`'s. `isChanged` compares it with `originalValue`

</td></tr>
<tr class="member-head"><td><a id="prop-visibility"></a>

**`visibility`**

</td><td>

[`Visibility`](#visibility)

</td><td>

writable

</td></tr>
<tr class="member-desc"><td colspan="3">

How a rendering layer shows the element: `'full'`, `'invisible'`, `'hidden'` or `'suppress'`. It is presentation only and does not affect what the element sends or whether it is validated. Writing the visibility the element already has is not a change, as for `access`. Writing a value that is not one of the four throws `Error("'x' is not a visibility: …")`.

</td></tr>
</tbody>
</table>

## Methods

### `bind(data?, overrides?): FieldBase<T, X>`

Abstract on `FieldBase`; [`Field`](/api/field#bind-data-overrides-this), [`Group`](/api/group#bind-data-overrides-group-t)
and [`List`](/api/list#bind-data-overrides-list-r) implement it, and `Action` inherits `Field`'s. It returns a new
element over `data`, with the same registered actions and the same extended properties. It applies a declared
element to a record. The new element's `declaration` is the element `bind()` was called on.

With `data` `undefined`, the new element holds the current value; an explicit `null` is data, so `bind(null)`
returns an element built over `null`. `overrides` is an [`IBindParams<T, X>`](#ibindparams-t-x): `originalValue`,
`access`, `visibility` and the extended properties only. Any other key is a type error. `access` and `visibility`
default to this element's. Extended properties it names are merged over the ones copied from the bound element, and
are set before the new element's eager actions run. `originalValue` is applied when the key is present.

The new element is constructed through `this.constructor`, so a subclass binds into its own class. It is
detached: it has no `parent` and no `fieldName`. `originalValue` is taken from `overrides` only when passed
explicitly; otherwise it is the bound data, so `isChanged` starts out `false`.

```typescript
const row = template.bind({ name: 'John' });   // a group over one record
const copy = field.bind(field.value);          // another field holding what this one holds
```

### `bindingsOf(declaration): FieldBase[]`

Returns every element in this element's subtree, this element included, whose `declaration` is the one given:
`list.bindingsOf(template.fields.a)` returns the `a` field of every row.

### `clearValidators(): void`

Removes the validators registered on this element, empties `errors` and recalculates `valid`. All errors are
removed, including ones no validator added, such as server-side errors pushed in from outside. The validity change is
published as any other: an element that was invalid fires `ValidChangedAction` and its container re-evaluates its
own validity. A validation still in flight is cancelled, so it cannot add an error to an element that no longer has
the validator that produced it. A validator that installed a listener elsewhere (`CompareTo`, on the field it
compares against) has that listener released with the registration. An operation that rolls back restores both,
including the cancelled run: it continues and its result is applied.

Validators belong to the element's **declaration**, so the call applies to the declaration: clearing the validators
of one row of a `List` clears them for every row, because they are registered on the item template. On the other
rows only the errors those validators added are removed; errors from other sources stay. On the element the call is
made on, all errors are removed. `unregisterAction()` removes a single validator instead of all of
them, and removes the errors that validator added, on every element.

It does not descend into members. A `Group` or a `List` also derives `valid` from its members, so
`group.clearValidators()` leaves `group.valid` at `false` while any member is still invalid; call
`clearValidators()` on the members whose validators you also want gone.

### `markRecordIncomplete(): void`

Marks that an eager action running over this element looked for a second element of the record and did not find
it because the record was not assembled yet (a `List` row's members are bound before the row exists as their parent).
The container that completes the record runs this element's eager actions again, and so does a container that the
record is added to later. Only action implementations call it; see
[Reading a second element of the record](/api/actions#reading-a-second-element-of-the-record).

### `rebind(data): this`

Replaces the data the element holds with `data`, in place. The element remains the same instance, with its actions,
its extended properties and its position in its container unchanged, and ends up in the state `bind(data)` would
have produced: the values are written, `originalValue` is set to them so `isChanged` is `false`, `touched` is reset
to `false` and the validators run over the new data. It reuses one element across records, as a virtualised
renderer does with the rows it keeps. [`Group`](/api/group#rebind-data-this) overrides it.

No `ValueChangedAction` fires for the element itself, as for a newly built element. Its members do fire theirs
(the fields of a rebound row fire `ValueChangedAction` for their new values), and a validity change is published as
always, so a rebound row that is invalid notifies the list holding it.

The element's own `access`, `visibility` and extended properties stay as they are, so what it sends after a rebind
follows its current access. A disabled `Field` takes the value, as it does any write to `value`. A disabled `Group`
or `List` writes through to its members, as an assignment to it does. A member of a group that is its own
declaration also keeps its `access` and `visibility`. A member of a group bound from a declaration (a group
`bind()` built, every `List` row among them), and a `List` row reused at its position, take the `access` and
`visibility` of the corresponding element of the declaration, and their conditional actions apply their statements
again over the new record, as they do over a new binding. Extended properties stay on every element.

A member of a `Group` whose key is missing from `data` takes the `originalValue` of the corresponding member of the
group's declaration: for a group that is its own declaration, the member's own baseline. `group.originalValue` holds
what the group sends, so it leaves a `'disabled'` member out, and `group.rebind(group.originalValue)` puts that
member back to its own baseline as well. For a row of a `List` the declaration is the item template, so a key the
new record leaves out takes the item template's baseline, not the value of the previous record. On a `List`, existing rows are reused by position, as in a whole-value
assignment (see [Scale](/api/list#scale)).

Inside an open `transaction()`, a change of the element that the commit has yet to announce is kept: the commit
announces the old and new values measured from the element's state when the transaction opened.

```typescript
const row = list.get(0)!;
row.rebind({ name: 'Jane', age: 25 });   // same instance, next record
```

`Field` has no `clear()`: an empty value depends on `T`, which the library cannot determine. Reset a field with
`rebind(field.originalValue)` or an explicit `rebind('')` (or `rebind(null)` where `T` allows it). See
[Clearing and resetting](/guide/cookbook#clearing-and-resetting-a-form) for `Group` and `List`, which do have a
structural "empty": `rebind(element.originalValue)` resets them and `rebind(null)` empties them.

### `registerAction(action): this`

Registers an action (validator or event handler) on this element. Returns `this` for chaining. On a `Group` or a
`List` the action is registered on the container itself, not on its children.

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

### `setExtendedValues(values): void`

Writes [extended properties](#extended-properties). `values` is a `Partial<X>` and is merged over the element's
current ones, so a call naming one property leaves the others unchanged, and no property is ever removed. The merged
set replaces the frozen object `extra` returns; this makes the write reactive and lets a rolled-back transaction
restore the previous set.

```typescript
field.setExtendedValues({ label: 'Given name' });
```

### `settled(): Promise<void>`

Resolves once nothing at or below the element is running: no asynchronous validation and no unsettled
`Action.execute()`, which is when `pending` turns `false`. It resolves immediately where `pending` is `false`. A
submit handler awaits it, because the click that runs the handler can start a validation in the same event (a
blur that commits a value), before the button's `:disabled` is re-rendered. [Submitting](/guide/cookbook#submitting)
shows it in a submit handler.

It reflects the state at the moment it resolves only: work started later makes the element run again. A caller
that acts on a settled tree reads what it needs immediately after awaiting.

### `triggerAction(actionClass, ...params): any`

Manually fires a specific action class on this element. `actionClass` is the class itself, not an instance; it is
looked up by its static `classIdentifier`, so abstract classes work too. Returns what the chain returns, `null`
when no action of that type is registered, and the [`AbortEventHandlingException`](/api/actions#aborteventhandlingexception)
instance where a handler threw one to end the run (a promise resolving to it where the chain went through an
asynchronous handler).

### `unregisterAction(action): boolean`

Removes `action` from this element and returns whether the element had it. The registration is shared with the
element's declaration and every binding made from it, so the action is removed from all of them: a `Required`
registered on a `List`'s item template applies to every row, and unregistering it from one row removes it from
every row. Elements of other declarations that the same instance is registered on keep it.

```typescript
const required = new Validators.Required();
const field = new Field({ value: '', validators: [required] });
field.valid;                      // false
field.unregisterAction(required); // true
field.valid;                      // true: the validator's error is removed with it
```

A `Validator` removes the errors it added to the elements it is removed from, so the validation result is that
of the validators the element still has; errors from other sources remain. Any other action releases what it
installed for each element through `unregisterFrom()`. A validation still in flight is cancelled and its result
discarded. Called inside a [transaction](/api/transactions), the unregistration is undone if the transaction rolls
back, and so is the cancellation: the run continues and its result is applied, so the element is never valid over a
value no validator checked.

### `validate(revalidate?): void`

Publishes the validity derived from the element's `errors`. Pass `revalidate: true` to first re-run every eager
action, validators included, over the element's current value. When the validity differs from the last published
one, it fires `ValidChangedAction` and notifies the parent container, so a field that becomes invalid is reflected in
the `Group` or `List` holding it. Called inside a [transaction](/api/transactions), it fires at the end of the
transaction, together with the transaction's other changes. [`Container`](/api/container#validate-revalidate-void)
overrides it to revalidate the children first.

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

## Comparing elements

A structural comparison of two elements (lodash `isEqual(fieldA, fieldB)`) compares identity. The element state is
in private class fields, which a structural comparison does not read, so without further measures it would return
`true` for any two instances of the same class. `FieldBase` has a `Symbol.toStringTag` accessor returning the
element's class name; a structural comparison reads the tag first and returns `false` for two distinct objects with a
tag it does not know.
Two elements are therefore equal only where they are the same element; compare their contents with
`isEqual(a.value, b.value)`. The accessor is defined on the prototype, so it adds nothing to each instance, and
`Object.prototype.toString.call(field)` returns `[object Field]`, not `[object Object]`. See
[Comparing elements](/guide/model#comparing-elements) for the package's own `isEqual`, the pitfalls it avoids and
the cases it does not cover.

### `isEqual(a, b): boolean`

Structural equality that treats a `FieldBase` anywhere in `a` or `b` as the value it holds. Two `FieldBase`
operands compare `a.value` against `b.value` directly; anything else is passed to lodash's `isEqual`, with a
`FieldBase` found at any depth unwrapped the same way. See
[Comparing elements](/guide/model#comparing-elements) for when to use it instead of `isEqual(a.value,
b.value)`.

---

> See also: [Field](/api/field), [Container](/api/container), [Group](/api/group), [List](/api/list),
> [Actions](/api/actions)
