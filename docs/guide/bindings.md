# Bindings and records

This page describes how one declaration serves many elements: what an action author keeps per element, how a rule
shared by every row finds the elements of its own row, and what an element costs in memory.
[The model](/guide/model) describes the elements, declarations and bindings this page builds on.

## State an action keeps per element

An action registered on a declaration fires for every binding of it
([One action instance, many elements](/guide/model#one-action-instance-many-elements)), so state stored on the
action instance is shared by every element the action serves. Per-element state goes into
`protected state(key, init)`, keyed by the element or by its record, and is released together with the key.

| Hook | Called |
|---|---|
| `boundToBinding(binding)` | once for every element the action is attached to |
| `unregisterFrom(binding)` | once for every element the action is removed from |
| `resetBinding(binding)` | when a binding is reset to a new binding of its declaration (a member of a bound group, a reused `List` row) |

An override of `resetBinding()` drops the state the action keeps about the element, which
`protected forgetState(key)` does with a rollback restoring it. The element's eager actions other than the
validators then run again over the new record, before its baseline is recorded. The members and hooks are listed
in [Custom actions](/api/actions#custom-actions).

## Records: how a shared rule finds the right element

A rule that reads a second element (a `CompareTo`, a `Statement` over another field) is one instance serving every
row, so it must determine which second element applies to the row it runs over. Two inputs determine it: the
element the rule was declared against, and the **record** the rule runs in.

A record is the `List` row that holds an element or, where no row holds it, the top of its container chain. A `Group`
holds every member under a name; a `List` holds rows without a name. A record therefore begins at an element that
its container holds without a name.

```typescript
const row = new Group({ password: new Field(), confirmation: new Field() });
row.fields.confirmation.registerAction(
  new Validators.CompareTo(row.fields.password, (mine, other) => mine === other, {
    code: 'passwords_mismatch',
    detail: 'Passwords must match',
  }),
);

const users = new List(row, { value: [{ password: 'a', confirmation: 'a' }] });
// row 0's confirmation compares against row 0's password
```

The second element can be given in three ways, all resolved within the record being validated:

- **the element itself**: resolved to the member at the same position in the record. An element that belongs to a
  different record (for example a form field the rows read) is read where it is, and a change to it applies to every
  row;
- **a name** (`CompareTo` only): looked up in the nearest container above the validated field that holds it, so a
  row is searched before the form the list is in;
- **a callback** (`CompareTo` only): receives the field being validated and returns the element.

`Statement.evaluate(scope)` takes the record as an argument, so one statement serves every row:
`statement.evaluate(list.get(1))` reads the second row's fields.

### A rule that runs before its record exists

A row is built member by member: each member is bound separately, the bindings are passed to a `Group`, and the
group then receives the row's data. A member's eager actions run when the member is bound, before it has siblings
or a row, so a rule that reads a second element finds nothing at that point.

A rule that finds nothing produces no validation result; this is not the same as valid. An action that finds
nothing calls `field.markRecordIncomplete()` and returns without a result. The container that completes the record
runs that element's eager actions again: the `Group` after it has received its members and written its data, the
`List` after it has inserted the row into the form. If the second run also finds nothing, it calls
`markRecordIncomplete()` again, and the next container above runs the actions. `CompareTo` and the conditional
actions do this themselves; a hand-written rule does it as shown in
[A rule that reads another field of the record](/guide/cookbook#a-rule-that-reads-another-field-of-the-record).

## Memory per element

Every value is an element: it holds its state (value, baseline, access, visibility, errors, validity counters), its
actions and, once read, cached computations of its validity and its value. Approximate heap use in Node, production
build:

| what | per instance |
|---|---|
| a `Field` | 0.4 KB |
| a `Group` of three fields, `value` and `valid` read | 6 KB |
| `reactive({ a, b, c })` | 0.5 KB |

In development the devtools also record where each root element was built, about 2.4 KB per root element; a
member and a binding, such as a row of a `List`, keep nothing, and a production build leaves the devtools out
([Vue devtools](/api/devtools#what-is-listed)).

The cost is per element, not per value: a `Field` that holds an array of ten thousand rows is one element. State that
is read and replaced as a whole, such as rows fetched for a table that is only displayed, fits one `Field` or a
`shallowRef`. State where each value needs its own rules, validation, access or change tracking fits elements; a
[`List`](/api/list#scale) is designed to hold thousands of rows.
