# Container

`Container` is the abstract base of `Group` and `List`: a form element that holds other elements and composes its
own state out of theirs. It is also the type of every element's `parent`.

```typescript
import { Container, DisplayMode, Field, Group } from '@dynamicforms/vue-forms';

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
| `valid` | `boolean` | `true` where the container's own errors are empty and every child it counts is valid: a child that is `HIDDEN` or `SUPPRESS` is not counted — see [What a container serializes](#what-a-container-serializes). The read is composed over the children and memoised, so an error written into a child without a `validate()` call shows here as well |
| `busy` | `boolean` | `true` while an `Action.execute()` in any child has yet to settle |
| `touched` | `boolean`, writable | `true` where any child is touched. Assigning it assigns every child |
| `validate(revalidate?)` | `void` | With `revalidate: true`, every child is revalidated first and the container forms its own verdict afterwards, over the finished set, so it announces one net transition of its validity at most |
| `notifyValueChanged()` | `void` | Records that a child changed its value, so that the [transaction](/api/transactions) in progress works out at commit what the container's own value became and announces it once. The mutation methods call it themselves; you rarely need to |

Every other member — `value`, `fullValue`, `errors`, `enabled`, `bind()`, `rebind()` and the rest — is the
[`FieldBase`](/api/field#fieldbase-t) one, with the value shape of the container that holds it.

## What a container serializes

::: tip
[Handling null and empty values](/guide/null-and-empty) applies these rules recipe by recipe: what to declare
for the payload you want.
:::

A container has two values. `value` is what the form sends: the payload a save hands to the server. `fullValue`
is what the form holds, for a view to read. Two members of each child decide what it contributes to both, and each
answers one question.

**`enabled` — is the child sent?** A disabled child is left out of its container's `value`; `fullValue` carries it
all the same. A disabled container is the one exception: it is kept in `value` while what its own children compose
is not empty, because an enabled child inside it still holds something the form has to send. `enabled` does not
stop a write: a disabled field takes an assignment like any other, so a record loaded into the form reaches every
member whatever state the rules of the form have left it in.

**`visibility` — does the child take part in the form?**

| `visibility` | Rendered | Contributes to `value` and `fullValue` | Counted in `valid` |
|---|---|---|---|
| `FULL` | yes | its own value (in `value`, only where it is enabled) | yes |
| `HIDDEN` | `display: none` | `null` in its place (in `value`, only where it is enabled) | no |
| `SUPPRESS` | no | nothing: the key, or the row, is left out | no |

The rule is stated once, in `FieldBase.serializesAs(purpose)`, and every container composes `value` and `fullValue`
— and decides which children count in `valid` — by asking each child. It applies to the members of a `Group` and the
rows of a `List` alike. The method is protected: a subclass of an element that contributes by a rule of its own
overrides it, and every container holding that element follows.

A hidden or suppressed child keeps what it holds. Setting it back to `FULL` brings its value back into the
container's, and `bind()` carries it into a binding, so the choice of what to show never destroys what was entered.
A change of visibility is a change of the container's value and is announced as one.

### Where `null` comes from

`null` appears in a container's value in exactly two ways: a child whose own value is `null`, or a child that is
`HIDDEN`. A container itself is never `null`. Where nothing inside it contributes — every member disabled or
suppressed, a list without rows — a `Group` reads `{}` and a `List` reads `[]`. Assigning `null` to a container
empties it: a `Group` writes `null` into every member, a `List` releases every row.

| The form states | Declare it as |
|---|---|
| a value | a child with that value, `FULL` |
| "this holds nothing" — the server clears it | a child with value `null`, or a child that is `HIDDEN` |
| "this is not part of the form" — the server leaves it alone | a child that is `SUPPRESS`, or one that is disabled |

The two ways to send `null` differ in what the form keeps. `value = null` empties the child, and what it held is
gone. `HIDDEN` sends `null` while the child keeps its values, which is what a section switched off by a toggle
wants: switching it back on brings back what was entered.

```typescript
const club = new Group({ name: new Field({ value: '' }), city: new Field({ value: '' }) });
const form = new Group({ member: new Field({ value: 'Ada' }), club });

club.visibility = DisplayMode.HIDDEN;   // no club selected
form.value;                             // { member: 'Ada', club: null }
club.visibility = DisplayMode.FULL;     // the club's fields hold what they held
```

Reading a record back into the form is plain assignment, and it does not touch visibility: `form.value = record`
writes every member, hidden or disabled ones included, and `{ club: null }` empties the club. Which members are
shown is decided by the rules of the form — a type field, a toggle — not by the data.

### A container that follows its children

A container is not disabled on its own when its children are. Where a form wants that, one effect states it:

```typescript
import { watchEffect } from 'vue';

// left out of the parent's value while no member is enabled
watchEffect(() => {
  address.enabled = Object.values(address.fields).some((field) => field.enabled);
});

// sent as null while no member is enabled
watchEffect(() => {
  const any = Object.values(address.fields).some((field) => field.enabled);
  address.visibility = any ? DisplayMode.FULL : DisplayMode.HIDDEN;
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
lookup after it throws. Naming the sibling and letting [`CompareTo`](/api/validators#compareto) resolve it needs
neither.
