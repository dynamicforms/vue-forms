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

## Properties and methods

| Member | Type | Description |
|--------|------|-------------|
| `valid` | `boolean` | `true` where the container's own errors are empty and every child it counts is valid. A `'disabled'` child sends nothing and is not counted, whatever errors it carries; see [What a container serializes](#what-a-container-serializes). The value is composed over the children and memoised, so an error written into a child without a `validate()` call is reflected here as well |
| `busy` | `boolean` | `true` while an `Action.execute()` in any child is pending |
| `touched` | `boolean`, writable | `true` where any child is touched. Assigning it assigns every child |
| `validate(revalidate?)` | `void` | With `revalidate: true`, every child is revalidated first and the container then computes its own validity over the result, so it announces at most one net transition of its validity |
| `notifyValueChanged()` | `void` | Records that a child changed what it holds or sends, so that the open [transaction](/api/transactions) computes at commit what the container holds and sends and announces each once. The mutation methods call it, so a direct call is rarely needed |

All other members (`value`, `fullValue`, `errors`, `access`, `bind()`, `rebind()` and the rest) are inherited from
[`FieldBase`](/api/field#fieldbase-t), typed with the container's value shape.

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
access applies.

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
throws. Passing the sibling's name to [`CompareTo`](/api/validators#new-validators-compareto-otherfield-isvalidcomparison-message),
which resolves it, needs neither.
