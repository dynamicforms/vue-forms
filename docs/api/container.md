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

`Group` holds named members and `List` holds rows by position. Everything below is what the two share; reaching a
child — `group.fields.name`, `list.get(0)` — is each class's own and is described on its page.

## Properties and methods

| Member | Type | Description |
|--------|------|-------------|
| `valid` | `boolean` | `true` where the container's own errors are empty and every child it counts is valid. A `'disabled'` child sends nothing and is not counted, whatever errors it carries — see [What a container serializes](#what-a-container-serializes). The read is composed over the children and memoised, so an error written into a child without a `validate()` call shows here as well |
| `busy` | `boolean` | `true` while an `Action.execute()` in any child has yet to settle |
| `touched` | `boolean`, writable | `true` where any child is touched. Assigning it assigns every child |
| `validate(revalidate?)` | `void` | With `revalidate: true`, every child is revalidated first and the container forms its own verdict afterwards, over the finished set, so it announces one net transition of its validity at most |
| `notifyValueChanged()` | `void` | Records that a child changed what it holds or sends, so that the [transaction](/api/transactions) in progress works out at commit what the container holds and sends and announces each once. The mutation methods call it themselves; you rarely need to |

Every other member — `value`, `fullValue`, `errors`, `access`, `bind()`, `rebind()` and the rest — is the
[`FieldBase`](/api/field#fieldbase-t) one, with the value shape of the container that holds it.

## What a container serializes

::: tip
The [Cookbook](/guide/cookbook) applies these rules to the cases a form meets: fields that depend on a type, an
optional section, loading a record, submitting.
:::

A container has two values. `value` is what the form sends: the payload a save hands to the server. `fullValue`
is what the form holds: every child's own `fullValue`, whatever its access. One member of each child decides what it
contributes to `value`, and with it whether the child is validated: its `access`.

| `access` | Accepts input | Contributes to `value` | Validated |
|---|---|---|---|
| `'editable'` | yes | its value | over its value |
| `'readonly'` | no | its value | over its value |
| `'disabled'` | no | nothing: the key, or the row, is left out | no |
| `'disabled-null'` | no | `null` in its place | over `null` |

The values follow HTML: a `readonly` input is submitted with its value and a `disabled` one is left out.

A container's access applies to everything inside it, and `effectiveAccess` states the result on each element. A
container that is `'disabled'` or `'disabled-null'` sends none of its children, whatever they hold, so every element
below it is `'disabled'` there: none of them is validated, and none carries an error from a validator. Below a
`'readonly'` container an `'editable'` element is `'readonly'`. Anywhere else an element's own access applies.

The rule is stated once, in `FieldBase.serializesAs(purpose)`, and every container composes `value` by asking each
child. It applies to the members of a `Group` and the rows of a `List` alike. The method is protected: a subclass of
an element that contributes by a rule of its own overrides it, and every container holding that element follows.

An element keeps what it holds whatever its access. Making it `'editable'` again brings its value back into the
container's, and `bind()` carries it into a binding, so a rule that switches what is sent never destroys what was
entered. `visibility` plays no part here: it states how a rendering layer draws the element and nothing else.

### Validation follows what is sent

An element's validators run over what it sends — its value, or `null` for `'disabled-null'` — and only where it is
sent at all. A container counts the verdict of every child that sends something, `null` included; a `'disabled'`
child is not counted, so an error written into it by hand — one the server returned, say — stays on the child and
holds nothing back. So a `Required` on a section that is sent as `null` refuses it, while the required fields inside that
section are not checked until the section is sent again; a section switched off leaves no error behind and holds no
submit button back. A switch of access runs the validators again on the element and on every element below it whose
`effectiveAccess` moved.

### Where `null` comes from

`null` appears in a container's value in exactly two ways: a child whose own value is `null`, or a child that is
`'disabled-null'`. A container itself is never `null`. Where nothing inside it contributes — every member disabled, a
list without rows — a `Group` reads `{}` and a `List` reads `[]`. Assigning `null` to a container empties it: a
`Group` writes `null` into every member, a `List` releases every row.

| The form states | Declare it as |
|---|---|
| a value | a child with that value, `'editable'` or `'readonly'` |
| "this holds nothing" — the server clears it | a child with value `null`, or a child that is `'disabled-null'` |
| "this is not part of the form" — the server leaves it alone | a child that is `'disabled'` |

The two ways to send `null` differ in what the form keeps. `value = null` empties the child, and what it held is
gone. `'disabled-null'` sends `null` while the child keeps its values, which is what a section switched off by a
toggle wants: switching it back on brings back what was entered.

```typescript
const billing = new Group({ street: new Field({ value: '' }), city: new Field({ value: '' }) });
const form = new Group({ customer: new Field({ value: 'Ada' }), billing });

billing.access = 'disabled-null';   // billed to the delivery address
form.value;                         // { customer: 'Ada', billing: null }
billing.access = 'editable';        // the address holds what was typed into it
```

Writing a value is not part of these rules: an assignment reaches the element whatever its access, and `value` is
composed from what the elements hold at the moment it is read. The order in which a form's rules change access
therefore never loses data.

Reading a record back into the form is plain assignment, and it does not touch access: `form.value = record` writes
every member, disabled ones included, and `{ billing: null }` empties the billing address. What is sent is decided by
the rules of the form — a type field, a toggle — not by the data.

### Reading the values

`value` is for sending: every key is optional, because a `'disabled'` member is left out, and nullable, because a
`'disabled-null'` one is `null`. Hand it to the server as it is.

`fullValue` is for reading what the form holds, every member included whatever its access, and its keys carry the
members' own types:

```typescript
form.value.billing;       // null while the billing address is 'disabled-null'
form.fullValue.billing;   // what the address holds, sent or not
```

### What a change announces

A container announces two things, and a change can move either without the other.
[`ValueChangedAction`](/api/actions#valuechangedaction) reports what the container holds — its `fullValue` — and
[`ContributionChangedAction`](/api/actions#contributionchangedaction) reports what it sends to its own container —
its `value` where its access sends it, `null`, or `undefined` for nothing. A write into a `'disabled'` field changes
what the form holds and not what it sends; a switch of access changes what it sends and not what it holds.

### A container that follows its children

A container is not disabled on its own when its children are. Where a form wants that, one effect states it:

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

The first leaves the key out of the parent's value, the second sends it as `null` — the two outcomes the table
above tells apart.

## `parent`

Every element's `parent` is a `Container | undefined`: a `Group` holds its members and a `List` its rows, and an
element does not know which of the two it sits in. `Container` names no children, so a sibling lookup states the
container it expects:

```typescript
// checked: the branch runs only where the parent is a Group
if (field.parent instanceof Group) field.parent.fields.other.validate(true);

// stated: where the structure guarantees the parent is a Group
(field.parent as Group | undefined)?.fields.other.validate(true);
```

A cast checks nothing at runtime: where the parent turns out to be a `List`, `fields` reads `undefined` and the
lookup after it throws. Naming the sibling and letting [`CompareTo`](/api/validators#new-validators-compareto-otherfield-isvalidcomparison-message) resolve it needs
neither.
