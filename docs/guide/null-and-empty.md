# Handling null and empty values

A form holds what was entered and sends what the server should receive, and the two are not always the same: a
section that is switched off still holds what was typed into it, and a field that does not apply to the record
being edited should not reach the server at all. This page is about the second: what ends up in `value`, and what
to declare to get the payload you want. [What a container serializes](/api/container#what-a-container-serializes)
states the rules; this page applies them.

## The three outcomes

For every key in the payload there are three things a form can mean, and one way to declare each:

| The server should | The key in `value` | Declare the element |
|---|---|---|
| store this value | the value | `FULL` and enabled — the default |
| clear what it has | `null` | holding `null`, or `HIDDEN` |
| leave what it has alone | absent | `SUPPRESS`, or disabled |

Nothing else puts `null` in a payload or takes a key out of one. In particular, a container never turns into `null`
by itself: a group none of whose members contributes reads `{}`, and a list without rows reads `[]`.

Writing a value is not one of the things that decides this. An assignment always reaches the element — a disabled
field, a hidden one and a suppressed one take a write like any other — and `value` is composed from what the elements
hold at the moment it is read. What the rules of the form do to `enabled` and `visibility`, and in which order they
do it, never loses data.

## Recipes

### An empty list is `[]`

```typescript
const tags = new List(new Field<string>());
tags.value;          // []
form.value.tags;     // [] — no `?? []` needed
```

### A field that does not apply to the record

A form whose fields depend on a type — a label element that is text or an image, a payment that is card or
transfer — suppresses the fields that do not apply. They are neither shown nor sent, and they keep what they hold,
so switching the type back brings them back as they were.

```typescript
watchEffect(() => {
  const image = form.fields.kind.value === 'image';
  form.fields.src.visibility = image ? DisplayMode.FULL : DisplayMode.SUPPRESS;
  form.fields.text.visibility = image ? DisplayMode.SUPPRESS : DisplayMode.FULL;
});
```

Where the server should instead clear what it holds for such a field, use `HIDDEN`: the field is sent as `null`.

A field that is shown but must not be edited is a different case: disable it. It is shown, the rendering layer
does not accept input into it, and it is left out of the payload.

### An optional section

A section the user switches on and off — a club that may or may not be selected, an invoice address that may be the
same as the delivery one — is `HIDDEN` while it is off. It is sent as `null`, so the server clears it, and the
section keeps what was entered, so switching it back on does not ask for it again.

```typescript
const club = new Group({ name: new Field({ value: '' }), city: new Field({ value: '' }) });
const form = new Group({ member: new Field({ value: 'Ada' }), club });

const hasClub = ref(false);
watchEffect(() => {
  club.visibility = hasClub.value ? DisplayMode.FULL : DisplayMode.HIDDEN;
});

form.value;   // { member: 'Ada', club: null } while hasClub is false
```

A hidden section is not counted in the form's validity either, so a required field inside it does not block the
submit while the section is off.

### Loading a record

Assign it. Every member takes its value, whatever is enabled or shown at that moment:

```typescript
form.value = record;
```

The record does not decide visibility: `{ club: null }` empties the club's fields, and the club stays shown or hidden
as the form's own rule has it. Where the form should follow the data — a section shown because the record has one —
state that in the rule:

```typescript
form.value = record;
hasClub.value = record.club != null;
```

Use `rebind(record)` instead of an assignment where the loaded record should also become the baseline `isChanged`
compares against — see [Clearing and resetting](/guide/model#clearing-and-resetting).

### A container that follows its children

A container is not switched off when every child is. Where the form wants that, one effect states it, and which one
depends on what the payload should say:

```typescript
// the key is left out while no member is enabled
watchEffect(() => {
  address.enabled = Object.values(address.fields).some((field) => field.enabled);
});

// the key is sent as null while no member is enabled
watchEffect(() => {
  const any = Object.values(address.fields).some((field) => field.enabled);
  address.visibility = any ? DisplayMode.FULL : DisplayMode.HIDDEN;
});
```

### Clearing a form

`group.rebind(null)` writes `null` into every member and baselines the result; `list.rebind(null)` releases every
row. The group then reads `{ name: null, … }` and the list `[]`. A `Field<string>` cleared this way holds `null`
although its type says `string` — declare the fields such a form reaches as `T | null`, or reset them one by one to
a value of their own type. [Clearing and resetting](/guide/model#clearing-and-resetting) covers both.

## Reading the values

`value` is for sending: every key is optional, because a disabled or suppressed member is left out, and nullable,
because a hidden one is `null`. Hand it to the server as it is.

`fullValue` is for reading what the form holds, disabled members included. Visibility applies to it as it does to
`value`, so a view reading it never shows data from a section that is switched off:

```typescript
form.fullValue.club;          // null while the club is hidden
form.fields.club.fullValue;   // what the club's fields hold, shown or not
```

The second line is the way to reach what a hidden or suppressed element holds: read the element itself rather than
its container.

In TypeScript, both carry the possibility in their types. A key of `value` is `T | null | undefined`, a key of
`fullValue` the same, and code that needs a definite value states which outcome it expects:

```typescript
const city = form.fullValue.address?.city ?? '';
```
