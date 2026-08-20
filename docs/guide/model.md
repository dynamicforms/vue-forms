# The model

This page describes the whole of what the library does, in one place. The [API reference](/api/field) carries the
per-symbol truth — every signature, default and thrown error; this is the shape those symbols belong to. Read it
once and the reference pages become lookups.

## Elements

A form is a tree of **elements**. There are four classes and they share one base, `FieldBase`:

| Class | What it holds |
|-------|---------------|
| `Field<T>` | one value |
| `Action<T>` | one value of the shape `{ label?, icon? }`, plus `execute()` and `busy` |
| `Group<T>` | a named map of member elements; its value is an object |
| `List<T>` | an ordered set of `Group` rows; its value is an array of objects |

`Group` and `List` are elements themselves, so a group nests in a group, a list nests in a group, and a group is a
row of a list. Everything below applies at every level.

Every element carries the same members, whatever its class: `value`, `originalValue`, `errors`, `valid`,
`enabled`, `visibility`, `touched`, `validating`, `busy`, `settled()`, `isChanged`, `parent` and `fieldName`. A container adds
its own — `fields`, `field()`, `addField()` and `removeField()` on a `Group`, `length`, `items`, `get()`,
`push()`, `insert()`, `remove()` and `clear()` on a `List`. Anything your application needs an element to carry
beyond those goes in `extra`, the element's
[extended properties](/api/field#extended-properties): declared as its second type argument, given at
construction, written with `setExtendedValues()` and read like every other member.

```typescript
import { Field, Group, List } from '@dynamicforms/vue-forms';

const line = new Group({ description: new Field({ value: '' }), amount: new Field({ value: 0 }) });
const invoice = new Group({
  customer: new Field({ value: '' }),
  lines: new List(line),
});
```

A `Group`'s members are usually the ones its constructor was given, and `addField(name, field)` and
`removeField(name)` change the set afterwards — a form that grows a field because a server said so, or drops one a
condition took away. A field a group takes in is held exactly as a constructed member is, and the field
`removeField()` hands back is detached and free to be taken by another container.

### Reactivity

An element's mutable state is held in a reactive object beside it. Every read through the element —
`field.value`, `group.valid`, `list.errors`, `field.parent` — is tracked, so a template, a `computed`, a
`watchEffect` or a getter passed to `watch` all follow it, and an assignment re-renders whatever read it. There is
no `ref` to unwrap and no computed mirror to maintain.

The element itself is not a Vue proxy. Two forms therefore do nothing, silently:

```typescript
watch(field, cb);              // subscribes to nothing, silently
watch(() => field.value, cb);  // watch what you read

readonly(field);               // hands the element straight back, silently
computed(() => field.value);   // hand out the value, or a computed over it
```

## Declarations and bindings

`new Field({ … })`, `new Group({ … })` and `new List(template)` build a **declaration**: an element that states
what something is — its validators, its actions, its defaults. `bind(data)` puts it to work over one record: it
produces another element of the same class, holding that data.

What a binding takes on is **data, not behaviour**. It carries the action and validator *instances* the element it
was bound from holds — the very same objects — and its own `value`, `enabled`, `visibility` and extended
properties. It starts detached: no `parent`, no `fieldName`, and `originalValue` baselined to the data it was
bound to, so `isChanged` is `false`.

```typescript
const template = new Field({ value: '', validators: [new Validators.Required()] });
const copy = template.bind('John');
// one Required instance now validates both
```

`rebind(data)` is the same exchange made **in place**: the element stays the very instance it was, keeps its
actions, its extended properties and its place in whatever container holds it, and comes out holding the new
record with its change history started over. It is what recycles a row across records — a virtualised renderer
keeping one component per visible row rebinds it as the data scrolls past — and it announces no value change of
its own, though the members of a rebound group announce theirs and a verdict that moves is announced as always.

`declaration` names the element a family was declared as. It answers itself for an element built from parameters
and the element it was bound from for a binding, transitively — so a binding of a binding names the same one:

```typescript
copy.declaration === template;         // true
copy.bind().declaration === template;  // true
```

`element.bindingsOf(declaration)` answers with every element of a subtree that was declared as the given one, which
is how a declaration is turned back into the elements standing for it: `list.bindingsOf(template.fields.a)` is the
`a` field of every row.

### One action instance, many elements

Because a binding takes on the instances rather than copies of them, **an action registered on an element fires
for every binding of that element**. The element the executor receives as its first argument is the one it fired for:

```typescript
template.registerAction(new ValueChangedAction((field, supr, newValue) => {
  if (field.parent === list.get(0)) console.log('the first row');
  return supr(field, newValue);
}));
```

The consequence for anyone writing an action: what the instance keeps on itself is shared by every element it
serves. What belongs to one element goes into `protected state(key, init)`, keyed by that element or by the record
it belongs to, and is released with the key. `boundToBinding(binding)` is called once for every element the action
comes to serve, and `unregisterFrom(binding)` once for an element the action is dropped from.

An action belongs to the declaration, and a binding reads the declaration's actions rather than a copy of them.
Registering on one row of a list therefore registers on the item template, and the rule drives every row: the rows
that already exist as much as the ones added later. `unregisterAction()` and `clearValidators()` reach every row for
the same reason. What stays per row is the data — the value, the errors the rule produces there, the verdict.

## How a `List` builds rows

The `Group` handed to `new List(template)` is not a row. It is the declaration every row is built from, and every
row is a binding of it — its members, its validators and its actions included.

| Operation | What it does with rows |
|---|---|
| `new List(tpl, { value: [...] })` | one binding per item, each over that item's data |
| `push(item)` / `insert(item, index)` | one binding, taken into the list at that position |
| `insert(item, index)` past the end | bindings of the template, carrying the template's own values, fill the gap |
| `push(group)` / `insert(group, …)` | an existing `Group` is taken as it stands, not bound |
| `list.value = rows` | where the list has an item template and the item is plain data, the row already standing at that position is **reused** and reset; otherwise a binding takes its place. Surplus rows are released |
| `remove(index)` / `pop()` | the row itself is released — it loses its `parent`, can be handed to another list, and holds everything it held in the list — and it is what the call answers with |
| `clear()` | every row is released |

A list without an item template builds each row with `Group.createFromFormData(item)`, so its rows need not carry
the same members.

Because an assignment reuses row objects, `list.get(0)` survives `list.value = rows` when the new array is the
same length, and a keyed `v-for` does not remount. A reused row is reset to the state the row built for that
position would have been in: a member the new item carries no key for takes the template's value, and
`originalValue`, `isChanged`, `touched` and `errors` all start over.

## Records: how a shared rule finds the right element

A rule that reads a second element — a `CompareTo`, a `Statement` over another field — is one instance serving
every row, so it has to be told which second element it means for the row it is running over. The structure
answers: the element the rule was declared against, and the **record** it is running in, name it between them.

A record is the `List` row that holds an element, or the top of its container chain where no row does. A `Group`
names every member it holds; a `List` holds a row without a name — so the element its container gave no name to is
where a record begins.

```typescript
const row = new Group({ password: new Field(), confirmation: new Field() });
row.fields.confirmation.registerAction(
  new Validators.CompareTo(row.fields.password, (mine, other) => mine === other, 'Passwords must match'),
);

const users = new List(row, { value: [{ password: 'a', confirmation: 'a' }] });
// row 0's confirmation compares against row 0's password
```

Three ways to name the second element, all of which answer within the record being validated:

- **the element itself** — resolved to the member the record holds at the same position. An element belonging to
  another record — a form field the rows read — is read where it stands, and one change there speaks for every row;
- **a name** (`CompareTo` only) — looked up in the nearest container above the validated field that holds it, so a
  row is searched before the form the list sits in;
- **a callback** (`CompareTo` only) — handed the field being validated, working it out itself.

`Statement.evaluate(scope)` takes the record explicitly, so one statement serves every row:
`statement.evaluate(list.get(1))` reads the second row's fields.

### A rule that runs before its record exists

A row is built member by member: every member is bound on its own, the bindings are handed to a `Group`, and the
group is then handed the row's data. A member's eager actions run at the moment it is bound, when it holds neither
its siblings nor its row — so a rule reading a second element reaches nothing there.

Reaching nothing is **no verdict**, not a pass. An action that finds nothing says so with
`field.markRecordIncomplete()` and returns without a verdict. The container that completes the record runs that
element's eager actions again — the `Group` once it has written its members, the `List` once it has taken the row
into the form — and a pass that still reaches nothing says so again, so the next container above answers for it.
`CompareTo` and the conditional actions do this themselves; a hand-written rule that reads a sibling does the same:

```typescript
new Validators.Validator((newValue, oldValue, field) => {
  // the callback receives a FieldBase, whose container is typed as either kind, and the members below are a
  // Group's: a field is never a List's child, so the narrowing holds
  const row = field.parent as Group | undefined;
  if (!row) {
    field.markRecordIncomplete();
    return null;
  }
  return row.fields.quantity.value > 0 && newValue == null
    ? [new ValidationErrorText('Unit price is required when quantity is above zero')]
    : null;
});
```

## Transactions: when events fire

**Every mutating operation is a transaction.** Where you open none, the operation is the transaction, so a single
write is atomic without anything at the call site.

Writes land in the elements as they are made; only the **announcement** waits. At the end of the transaction the
net transitions are measured against what the elements last announced, and each is announced once.

```typescript
import { transaction } from '@dynamicforms/vue-forms';

transaction(() => {
  form.fields.firstName.value = 'Janez';
  form.fields.lastName.value = 'Novak';
});
// one ValueChangedAction on the form, not two
```

| What | When it runs |
|---|---|
| validators | while the transaction is open, at the write that triggers them |
| `VisibilityChanging`/`Changed`, `EnabledChanging`/`Changed` | at the write — a *Changing* action may alter or refuse the value, so it cannot wait |
| `ValueChangedAction` | at commit, over the value the element ends the transaction holding |
| `ValidChangedAction` | at commit, after the value announcements, over the verdict the element ends with |
| `ListItemAddedAction` / `ListItemRemovedAction` | at commit, in the order the operations happened |

Validators run inside the transaction because the verdict they reach is what the commit announces. A validator
therefore reads the **working** state: one reading a sibling sees the sibling's new value, which is what makes
cross-field rules work at all. Vue effects are scheduled after the turn, so a render sees the committed state.

The announcement runs **deepest first** — field, then row, then list — which is the order the change travelled in.
Value transitions coalesce: a value that goes `A → B → A` announces nothing. Additions and removals state
operations rather than states, so they have no net and are emitted in order.

A transaction may not cross an `await`: `transaction()` throws a `TypeError` the moment its callback returns a
thenable. A nested call joins the transaction it found.

**A throw rolls back and rethrows.** The first time a transaction modifies an element it records the whole of that
element's mutable state, and a rollback puts all of it back and announces nothing. What a rollback cannot take back
are side effects — a handler that called a server already did.

The full contract, including `tx.rollback()`, is in [Transactions](/api/transactions).

## Where validity comes from

An element is valid when its `errors` array is empty and, for a container, every member is valid too. That verdict
is reached along two paths, and knowing which is which explains everything `valid` does.

- **The read path.** `element.valid` walks the members' live `errors` arrays, memoised by Vue. It follows an error
  pushed into a member by hand, immediately and without any call, and a container's `valid` follows with it.
- **The event path.** Each container keeps a tally of how many of its members last *announced* themselves invalid.
  The commit settles the deepest element first, so a container forms its own verdict over a finished tally, and
  `ValidChangedAction` fires once per element whose verdict actually changed.

```typescript
field.errors.push(new ValidationErrorText('from the server'));
field.valid;      // false already
group.valid;      // false already
// no ValidChangedAction has fired
field.validate(); // now it does, and the container re-forms its verdict
```

`validate()` re-forms the verdict and announces a transition of it. `validate(true)` also re-runs the eager
actions — the validators among them — over the value the element holds; on a container it does that for every
member first and forms the container's own verdict once, over the finished set.

`clearValidators()` drops the validators of an element's declaration, empties the `errors` of every element that
reads them, and announces the verdicts that leave. Called on one row of a list it therefore clears the rule for
every row, because the rule was the declaration's. It does not descend into members. `unregisterAction()` drops a
single action — a validator among them — and withdraws the errors that validator contributed, wherever it put
them.

Validators are **eager**: they run once at construction, once at registration, at every value change, on
`validate(true)`, and once more where a run reached no verdict because its record was not assembled yet. A field
is therefore often invalid before anyone has touched it — which is what `touched` is for, as the flag your UI
sets and reads to decide when to show errors.

An asynchronous validator returns a promise. `validating` counts the runs in flight — on the element itself and on
everything below it, so a form answers for the whole tree — only the newest run decides that validator's verdict on
a field, and a rejection leaves the field invalid with a `Validation could not be completed` error rather than
reading as a pass. A run whose verdict stops counting has the `AbortSignal` its validation function was handed
aborted, so the work behind it can be called off.

`busy` asks the other question: true while an `Action.execute()` at or below the element has yet to settle. An
element that is not an action executes nothing and answers false, so `busy` never speaks for a validation and
`validating` never speaks for an execution. A form that gates on the tree being idle reads both — or awaits
`settled()`, which resolves once neither answers true and is what a submit path uses instead of polling.

## Where a value comes from

A `Field` holds its value, and a **disabled** field refuses writes to it. Values are compared by identity, so
assigning the very object the field already holds announces nothing, while a new object announces a change even
when it is deeply equal to the old one — mutate a copy and assign it. `enabled` on a `Group` or a `List` does not
refuse anything; there it only decides whether the container above serializes it.

A write states what the caller wants the field to hold rather than what it ends up holding: a `ValueChangedAction`
may write another value back, a disabled field drops the write, and a handler that throws unwinds it. Where the
field ends up holding the value it started with, nothing a rendering layer reads moves — the case that layer has
to handle itself is worked through in [Writing the value](/api/field#writing-the-value).

A container composes its value from its members, and the object it hands out is **frozen** and reused until the
next change:

```typescript
group.value === group.value;     // true until something below changes
Object.isFrozen(group.value);    // true — assign a new value instead of writing into it
```

A `Group` serializes its **enabled** members only, and reads back `null` when nothing serializes. A disabled
nested container is the one exception: a `Group` or a `List` that is disabled is still included while its own
value is non-empty, and left out where it is empty. `fullValue` is the same object built without the `enabled`
rule — but a `List` does not override it, so values a disabled field hides inside a row stay hidden there.

A `List` serializes every row regardless of the row's own `enabled` flag, and each row's object follows the group
rule. It reads back `null` while the list is empty.

The composed object is cached behind a version counter that a write raises along its own branch, so a container
does not walk its members again while nothing below it has moved, and a write of one field costs the depth of the
nesting rather than the size of the tree.

`originalValue` is the baseline `isChanged` compares against, and assigning it rebaselines the comparison. On a
container it is a copy of its own, never the frozen object `value` reads back, so it is writable where the value
is not.

## Where to read next

| Question | Page |
|---|---|
| every member of `Field` and `FieldBase` | [Field](/api/field) |
| members, serialization, `fields` | [Group](/api/group) |
| rows, mutations, cost | [List](/api/list) |
| every event, the action chain, `Action`, conditionals | [Actions](/api/actions) |
| built-in rules, custom and asynchronous validators | [Validators](/api/validators) |
| `transaction()`, rollback, announcement order | [Transactions](/api/transactions) |
| upgrading an existing project | [Migration guide](/guide/migration) |
