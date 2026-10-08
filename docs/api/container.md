# Container

`Container` is the abstract base of `Group` and `List`: a form element that holds other elements and composes its
own state out of theirs. It is also the type of every element's `parent`.

```typescript
import { Container, Field, Group } from '@dynamicforms/vue-forms';

const name = new Field({ value: 'Ada' });
const form = new Group({ name });

form instanceof Container; // true
name.parent === form;      // true; name.parent is typed Container | undefined
```

`Group` holds named members and `List` holds rows by position. This page describes what the two share. Child
access (`group.fields.name`, `list.get(0)`) is specific to each class and is described on its page.

## Properties

| Property<br>Type<br>Writable | Description |
|---|---|
| <a id="prop-busy"></a>**`busy`**<br>`boolean`<br>read-only | Overrides [`FieldBase.busy`](/api/field-base#prop-busy): `true` while an `Action.execute()` in any child has not settled, composed over the children and memoised. Pending validation is reported by `validating`, not `busy`; `pending` covers both |
| <a id="prop-touched"></a>**`touched`**<br>`boolean`<br>writable | Overrides [`FieldBase.touched`](/api/field-base#prop-touched): `true` where any child is touched. Assigning it assigns every child |
| <a id="prop-valid"></a>**`valid`**<br>`boolean`<br>read-only | Overrides [`FieldBase.valid`](/api/field-base#prop-valid): `true` where the container's own errors are empty and every child it counts is valid. A `'disabled'` child sends nothing and is not counted, whatever errors it carries; see [What a container serializes](#what-a-container-serializes). The value is composed over the children and memoised, so an error written into a child without a `validate()` call is reflected here as well |

## Methods

### `notifyValueChanged(): void`

Records that a child changed what it holds or sends, so that the open [transaction](/api/transactions) computes at
commit what the container holds and sends, announces each once, fires `ValueChangedAction` where the value differs
from the value last announced, and recomputes validity. The mutation methods call it when a child's value changes,
so a direct call is rarely needed.

### `validate(revalidate?): void`

Overrides [`FieldBase.validate()`](/api/field-base#validate-revalidate-void). With `revalidate: true`, every child
is revalidated first and the container then computes its own validity over the result, so it announces at most one
net transition of its validity. A child that becomes valid while a later child is still unchecked produces no
notification on the container.

## Inherited from FieldBase

`value`, `fullValue`, `bind()` and the other inherited members are typed with the container's value shape.
`value` and `bind()` are abstract here and implemented by `Group` and `List`.

| Member | Description |
|--------|-------------|
| [`access`](/api/field-base#prop-access) | Whether the element accepts input, what it sends to its container, and whether it is validated |
| [`beginValidating() / endValidating()`](/api/field-base#beginvalidating-void-endvalidating-void) | Increment and decrement the asynchronous validation counter behind `validating` |
| [`bind(data?, overrides?)`](/api/field-base#bind-data-overrides-fieldbase-t-x) | Returns a new element of the same class over `data`, with the same actions and extended properties |
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
| [`fullValue`](/api/field-base#prop-fullValue) | What the element holds; identical to `value` except on `Group` and `List` |
| [`isChanged`](/api/field-base#prop-isChanged) | `true` when `value` differs from `originalValue` (deep equality) |
| [`markRecordIncomplete()`](/api/field-base#markrecordincomplete-void) | Marks that an eager action did not find a second element of a record not yet assembled |
| [`originalValue`](/api/field-base#prop-originalValue) | Baseline for `isChanged`; writable |
| [`parent`](/api/field-base#prop-parent) | Container the element belongs to |
| [`pending`](/api/field-base#prop-pending) | `validating \|\| busy` |
| [`rebind(data)`](/api/field-base#rebind-data-this) | Replaces the data the element holds, in place |
| [`registerAction(action)`](/api/field-base#registeraction-action-this) | Registers an action on the element; returns `this` |
| [`registerActionBefore(action, before)`](/api/field-base#registeractionbefore-action-before-this) | Registers `action` inside an existing chain, wrapped by `before` |
| [`setExtendedValues(values)`](/api/field-base#setextendedvalues-values-void) | Merges extended properties into `extra` |
| [`settled()`](/api/field-base#settled-promise-void) | Resolves once `pending` is `false` |
| [`triggerAction(actionClass, ...params)`](/api/field-base#triggeraction-actionclass-params-any) | Fires an action class on the element and returns what the chain returns |
| [`unregisterAction(action)`](/api/field-base#unregisteraction-action-boolean) | Removes an action from the element's declaration and its bindings |
| [`validating`](/api/field-base#prop-validating) | `true` while an asynchronous validation is in flight on the element or below it |
| [`validationEpoch`](/api/field-base#prop-validationEpoch) | Generation counter of the element's validators |
| [`value`](/api/field-base#prop-value) | Current value; writable |
| [`visibility`](/api/field-base#prop-visibility) | How a rendering layer shows the element; writable |

## What a container serializes

::: tip
The [Cookbook](/guide/cookbook) applies these rules to common cases: fields that depend on a type, an optional
section, loading a record, submitting.
:::

A container has two values. `value` is what the form sends: the payload a save passes to the server. `fullValue`
is what the form holds: every child's own `fullValue`, regardless of access. A child's `access` determines what it
sends to `value` and whether it is validated.

| `access` | Accepts input | Sends to `value` | Validated |
|---|---|---|---|
| `'editable'` | yes | its value | over its value |
| `'readonly'` | no | its value | over its value |
| `'disabled'` | no | nothing: the key, or the row, is left out | no |
| `'disabled-null'` | no | `null` in its place | over `null` |

The values follow HTML: a `readonly` input is submitted with its value and a `disabled` one is left out.

A container's access applies to everything inside it, and `effectiveAccess` holds the result on each element. A
container that is `'disabled'` or `'disabled-null'` sends none of its children, regardless of what they hold, so
every element below it has `effectiveAccess` `'disabled'`: none of them is validated, and none carries an error from
a validator. Below a `'readonly'` container an `'editable'` element is `'readonly'`. Elsewhere an element's own
access applies. Each child keeps the access it was given.

The rule is implemented in `FieldBase.serializesAs(purpose)`, and every container composes `value` by calling it on
each child. It applies equally to the members of a `Group` and the rows of a `List`. The method is protected: a
subclass of an element that sends by a different rule overrides it, and every container holding that element uses
the override.

An element keeps its value regardless of its access. Making it `'editable'` again puts its value back into the
container's value, and `bind()` copies it into a binding, so a rule that changes what is sent never discards entered
data. `visibility` has no effect here: it only controls how a rendering layer draws the element.

### Validation follows what is sent

An element's validators run over what it sends (its value, or `null` for `'disabled-null'`), and only when it is
sent. A container counts the validity of every child that sends something, `null` included. A `'disabled'` child is
not counted, so an error written into it directly (for example one returned by the server) stays on the child and
does not make the container invalid. A `Required` on a section sent as `null` therefore fails, while the required
fields inside that section are not checked until the section is sent again. A disabled section leaves no error and
does not block a submit button. A change of access reruns the validators on the element and on every element below
it whose `effectiveAccess` changed.

### Where `null` comes from

`null` appears in a container's value in exactly two cases: a child whose own value is `null`, or a child that is
`'disabled-null'`. A container's own value is never `null`. Where no child sends anything (every member disabled, a
list without rows), a `Group` reads `{}` and a `List` reads `[]`. Assigning `null` to a container empties it: a
`Group` writes `null` into every member, a `List` releases every row.

| Meaning | Declare it as |
|---|---|
| a value | a child with that value, `'editable'` or `'readonly'` |
| "this holds nothing": the server clears it | a child with value `null`, or a child that is `'disabled-null'` |
| "this is not part of the form": the server leaves it unchanged | a child that is `'disabled'` |

The two ways to send `null` differ in what the form keeps. `value = null` empties the child and discards its
previous value. `'disabled-null'` sends `null` while the child keeps its values. This suits a section switched off by
a toggle: switching it back on restores what was entered.

```typescript
const billing = new Group({ street: new Field({ value: '' }), city: new Field({ value: '' }) });
const form = new Group({ customer: new Field({ value: 'Ada' }), billing });

billing.access = 'disabled-null';   // billed to the delivery address
form.value;                         // { customer: 'Ada', billing: null }
billing.access = 'editable';        // the address holds what was typed into it
```

These rules do not apply to writes: an assignment is applied to the element regardless of its access, and `value`
is composed from what the elements hold when it is read. The order in which a form's rules change access therefore
never loses data.

Loading a record into the form is a plain assignment and does not change access: `form.value = record` writes
every member, disabled ones included, and `{ billing: null }` empties the billing address. What is sent is determined
by the form's rules (a type field, a toggle), not by the data.

### Reading the values

`value` is for sending: every key is optional, because a `'disabled'` member is left out, and nullable, because a
`'disabled-null'` one is `null`. Pass it to the server unchanged.

`fullValue` is for reading what the form holds, including every member regardless of access, and its keys have the
members' own types:

```typescript
form.value.billing;       // null while the billing address is 'disabled-null'
form.fullValue.billing;   // what the address holds, sent or not
```

### What a change announces

A container announces two things, and a change can affect either one without the other.
[`ValueChangedAction`](/api/actions#valuechangedaction) announces what the container holds (its `fullValue`), and
[`ContributionChangedAction`](/api/actions#contributionchangedaction) announces what it sends to its own container
(its `value` where its access sends it, `null`, or `undefined` for nothing). A write into a `'disabled'` field changes
what the form holds and not what it sends; a change of access changes what it sends and not what it holds.

### A container that follows its children

A container is not disabled automatically when its children are. Where a form needs that, one effect sets it:

```typescript
import { watchEffect } from 'vue';

// left out of the parent's value while no member is enabled
watchEffect(() => {
  address.access = Object.values(address.fields).some((field) => field.enabled) ? 'editable' : 'disabled';
});

// sent as null while no member is enabled
watchEffect(() => {
  address.access = Object.values(address.fields).some((field) => field.enabled) ? 'editable' : 'disabled-null';
});
```

The first leaves the key out of the parent's value, the second sends it as `null`, matching the two rows of the
table above.

## `parent`

Every element's `parent` is typed `Container | undefined`: a `Group` holds its members and a `List` its rows, and
the type does not specify which of the two holds the element. `Container` declares no child accessors, so a sibling
lookup must name the container type it expects:

```typescript
// checked: the branch runs only where the parent is a Group
if (field.parent instanceof Group) field.parent.fields.other.validate(true);

// cast: where the structure guarantees the parent is a Group
(field.parent as Group | undefined)?.fields.other.validate(true);
```

A cast is not checked at runtime: where the parent is a `List`, `fields` reads `undefined` and the lookup after it
throws. Passing the sibling's name to [`CompareTo`](/api/validators#new-validators-compareto-otherfield-isvalidcomparison-options),
which resolves it, needs neither.
