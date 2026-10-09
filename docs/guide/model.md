# The model

This page describes the whole library in one place. The [API reference](/api/field) documents each symbol: every
signature, default and thrown error. This page describes how those symbols fit together.

## Elements

A form is a tree of **elements**. There are four classes, and they share one base, `FieldBase`:

| Class | What it holds |
|-------|---------------|
| `Field<T>` | one value |
| `Action<T>` | one value of the shape `{ label?, icon?, defaultConfirm?, defaultReject? }`, plus `execute()`, `busy` and `executable`; it sends nothing to its container |
| `Group<T>` | a named map of member elements; its value is an object |
| `List<R>` | an ordered set of rows of type `R` (a `Group`, a `Field` or another `List`); its value is an array of the rows' values |

`Group` and `List` are elements, so a group nests in a group, a list nests in a group, and any element can be a row
of a list. Both extend [`Container`](/api/container), which composes `valid`, `busy` and `touched` over the children
and is the type of every element's `parent`. Everything below applies at every level.

Every element has the same members, whatever its class: `value`, `originalValue`, `errors`, `valid`,
`access`, `effectiveAccess`, `enabled`, `visibility`, `touched`, `validating`, `busy`, `pending`, `settled()`, `isChanged`, `parent`
and `fieldName`. A container adds its own: `fields`, `field()`, `addField()` and `removeField()` on a `Group`;
`length`, `items`, `get()`, `push()`, `insert()`, `remove()` and `clear()` on a `List`. Any additional data the
application stores on an element goes in `extra`, the element's
[extended properties](/api/field-base#extended-properties). They are declared once by augmenting
[`Extras`](/api/field-base#extras) or per element as its second type argument, given at construction, written with
`setExtendedValues()`, and read like every other member.

```typescript
import { Field, Group, List } from '@dynamicforms/vue-forms';

const line = new Group({ description: new Field({ value: '' }), amount: new Field({ value: 0 }) });
const invoice = new Group({
  customer: new Field({ value: '' }),
  lines: new List(line),
});
```

A `Group`'s members are the ones passed to its constructor. `addField(name, field)` and `removeField(name)` change
the set afterwards, for example to add a field the server describes or to remove one a condition no longer needs.
A field added with `addField()` is held the same way as a constructor member. `removeField()` returns the removed
field detached, and another container can take it.

### Reactivity

An element's mutable state is held in a reactive object beside it. Every read through the element
(`field.value`, `group.valid`, `list.errors`, `field.parent`) is tracked, so a template, a `computed`, a
`watchEffect` and a getter passed to `watch` all follow it, and an assignment re-renders whatever read it. There is
no `ref` to unwrap and no computed mirror to maintain.

The element itself is not a Vue proxy. `watch(field, cb)` and `readonly(field)` have no effect and raise no error:

```typescript
watch(field, cb);              // subscribes to nothing, silently
watch(() => field.value, cb);  // watch what you read

readonly(field);               // returns the element unchanged, silently
computed(() => field.value);   // expose the value, or a computed over it
```

## Declarations and bindings

`new Field({ … })`, `new Group({ … })` and `new List(template)` build a **declaration**: an element that defines
validators, actions and defaults. `bind(data)` creates another element of the same class that holds the given data.

A binding takes over **data, not behaviour**. It holds the same action and validator *instances* as the element it
was bound from (the same objects, not copies), and its own `value`, `access`, `visibility` and extended
properties. It starts detached: no `parent`, no `fieldName`, and `originalValue` set to the data it was bound to,
so `isChanged` is `false`.

```typescript
const template = new Field({ value: '', validators: [new Validators.Required()] });
const copy = template.bind('John');
// one Required instance now validates both
```

`rebind(data)` does the same **in place**: the element remains the same instance, keeps its actions, its extended
properties and its position in its container, and holds the new record with its change history reset. It is used to
recycle a row across records, for example by a virtualised renderer that keeps one component per visible row and
rebinds it as the data scrolls. `rebind()` announces no value change for the element itself. The members of a
rebound group announce their value changes, and a change of validity is announced as usual.

`declaration` is the element a family was declared as. For an element built from parameters it is the element
itself. For a binding it is the declaration of the element it was bound from, transitively, so a binding of a
binding returns the same declaration:

```typescript
copy.declaration === template;         // true
copy.bind().declaration === template;  // true
```

`element.bindingsOf(declaration)` returns every element in the subtree that was declared as the given declaration.
`list.bindingsOf(template.fields.a)` is the `a` field of every row.

### One action instance, many elements

A binding holds the same instances, not copies, so **an action registered on an element fires for every binding of
that element**. The first argument the executor receives is the element it fired for:

```typescript
template.registerAction(new ValueChangedAction((field, supr, newValue) => {
  if (field.parent === list.get(0)) console.log('the first row');
  return supr(field, newValue);
}));
```

For action authors: state stored on the action instance is shared by every element the action serves. Per-element
state goes into `protected state(key, init)`, keyed by the element or by its record, and is released together with
the key. `boundToBinding(binding)` is called once for every element the action is attached to, and
`unregisterFrom(binding)` once for every element it is removed from. `resetBinding(binding)` is called when a
binding is reset to a new binding of its declaration (a member of a bound group, a reused `List` row); an override drops the
state it keeps about the element, which `protected forgetState(key)` does with a rollback restoring it. The
element's eager actions other than the validators then run again over the new record, before its baseline is
recorded.

An action belongs to the declaration, and a binding reads the declaration's actions directly. Registering an action
on one row of a list therefore registers it on the item template, and it applies to every row, existing and added
later. For the same reason `unregisterAction()` and `clearValidators()` apply to every row. Per row are only the
data: the value, the errors the rule produces for that row, and the validity.

## How a `List` builds rows

The element passed to `new List(template)` is not a row. It is the item template every row is built from, and
every row is a binding of it, including its members, validators and actions.

| Operation | What it does with rows |
|---|---|
| `new List(tpl, { value: [...] })` | one binding per item, each over that item's data |
| `push(item)` / `insert(item, index)` | one binding, inserted into the list at that position |
| `insert(item, index)` past the end | bindings of the item template, holding the item template's own values, fill the gap |
| `push(element)` / `insert(element, …)` | an existing element is inserted as it is, not bound |
| `list.value = rows` | where the list has an item template and the item is plain data, the existing row at that position is **reused** and reset; otherwise a new binding replaces it. Surplus rows are released |
| `remove(index)` / `pop()` | the row itself is released and returned: it loses its `parent`, can be inserted into another list, and keeps all of its state |
| `clear()` | every row is released |

A list without an item template builds each row from its own item (a `Group` from a plain object, a `List` from an
array, a `Field` from any other value), so its rows can differ in kind and in members.

An assignment reuses row objects, so `list.get(0)` returns the same row after `list.value = rows` when the new array
has the same length, and a keyed `v-for` does not remount. A reused row is reset to the state a newly built row at
that position would have: a member with no key in the new item takes the item template's value, and
`originalValue`, `isChanged`, `touched` and `errors` are reset.

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
  new Validators.CompareTo(row.fields.password, (mine, other) => mine === other, 'Passwords must match'),
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

## Transactions: when events fire

**Every mutating operation is a transaction.** Where no transaction is open, the operation is its own transaction,
so a single write is atomic.

Writes are applied to the elements immediately; only the **announcement** is deferred. At the end of the
transaction, each element's net transitions are compared with what it last announced, and each transition is
announced once.

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
| `VisibilityChangingAction`, `AccessChangingAction`, `EnabledChangingAction` | at the write: a *Changing* action may alter or refuse the value, so it cannot be deferred |
| `AccessChangedAction`, `EnabledChangedAction`, `VisibilityChangedAction` | at commit, before the value announcements, with the net change |
| `ValueChangedAction` | at commit, with the value the element holds at the end of the transaction |
| `ValidChangedAction` | at commit, after the value announcements, with the element's final validity |
| `ListItemAddedAction` / `ListItemRemovedAction` | at commit, in the order the operations happened |

Validators run inside the transaction because the commit announces the validity they produce. A validator
therefore reads the **working** state: a validator that reads a sibling sees the sibling's new value, which is
required for cross-field rules. Vue effects are scheduled after the current tick, so a render sees the committed
state.

The announcement runs **deepest first** (field, then row, then list), the order in which the change propagated.
Value transitions coalesce: a value that goes `A → B → A` announces nothing. Additions and removals are operations,
not states, so they have no net value and are emitted in order.

A transaction cannot span an `await`: `transaction()` throws a `TypeError` when its callback returns a thenable. A
nested call joins the open transaction.

**A throw rolls back and rethrows.** The first time a transaction modifies an element, it records the element's
entire mutable state; a rollback restores all of it and announces nothing. A rollback cannot undo side effects,
such as a server call a handler already made.

The full contract, including `tx.rollback()`, is in [Transactions](/api/transactions).

## Where validity comes from

An element is valid when its `errors` array is empty and, for a container, every member is valid. Validity is
computed along two paths.

- **The read path.** `element.valid` reads the members' live `errors` arrays, memoised by Vue. An error pushed into
  a member directly is reflected immediately, without any call, in the member's `valid` and in its container's.
- **The event path.** Each container counts how many of its members last *announced* themselves invalid. The commit
  settles the deepest element first, so a container computes its validity over a complete count, and
  `ValidChangedAction` fires once for each element whose validity changed.

```typescript
field.errors.push(new ValidationError('rejected', {}, 'Rejected by the server', 'server'));
field.valid;      // false already
group.valid;      // false already
// no ValidChangedAction has fired
field.validate(); // now it does, and the container recomputes its validity
```

`validate()` recomputes the validity and announces a change of it. `validate(true)` also re-runs the eager actions,
including the validators, over the element's current value; on a container it does this for every member first and
then computes the container's own validity once, over the complete set.

`clearValidators()` removes the validators of an element's declaration, removes the errors they added on every
element that uses them, empties the `errors` of the element it is called on (errors from other sources included),
and announces the resulting validity changes. Called on one row of a list, it therefore clears the rule
for every row, because the rule belongs to the declaration. It does not descend into members. `unregisterAction()`
removes a single action (a validator, for example) and removes the errors that validator added, from every
element it added them to.

Validators are **eager**: they run once at construction, once at registration, on every value change, on
`validate(true)`, and once more where a run produced no result because its record was not yet assembled. A field
is therefore often invalid before the user has interacted with it. `touched` is the flag the UI sets and reads to
decide when to show errors.

An asynchronous validator returns a promise. `validating` counts the runs in progress on the element and on every
element below it, so a form's `validating` covers the whole tree. Only the newest run determines that validator's
result on a field. A rejected promise makes the field invalid with a `validation_failed` error
(`Validation could not be completed`). When a run's result is no longer used, the `AbortSignal` passed to its
validation function is aborted, so the work behind it can be cancelled.

`busy` is `true` while an `Action.execute()` at or below the element has not settled, and `false` otherwise.
`busy` does not include validation, and `validating` does not
include execution. `pending` is `validating || busy`, and `settled()` is the promise that resolves when `pending` is
`false`.

## Where a value comes from

A `Field` holds its value and accepts a write regardless of its access: `access` determines what the container
above sends for the element and whether a rendering layer accepts input into it, not whether a write is applied.
Values are compared by identity, so assigning the object the field already holds announces nothing, while a new
object announces a change even when it is deeply equal to the old one. To change an object value, modify a copy and
assign it. The library treats an object held by a field as a single value: a write into it (`field.value.push(item)`
on a `Field<string[]>`) runs outside any transaction and announces nothing, and neither the field nor any container
above it registers a change.

A write sets the value the caller requests, which is not necessarily the value the field ends up holding: a
`ValueChangedAction` may write another value back, and a handler that throws reverts it. Where the field ends up
holding its original value, nothing a rendering layer reads changes. The case the rendering layer must handle itself
is described in [Writing the value](/api/field#writing-the-value).

A container composes its value from its members and returns a **frozen** object, reused until the next change:

```typescript
group.value === group.value;     // true until something below changes
Object.isFrozen(group.value);    // true; assign a new value instead of writing into it
```

The freeze covers the objects the containers build. An array or object that a `Field` holds as its value is not
frozen. The field's value is one unit, and a change of it is an assignment to `value`. A write into the object the
field holds is outside that contract: no transaction records it, no `ValueChangedAction` fires and the validators do
not run. Where `originalValue` is the same object as the value, which it is when the field was built without a
separate `originalValue` and after `rebind()`, the write changes the baseline as well: `isChanged` stays `false` and
`rebind(originalValue)` does not put the old content back. Assign a new array or object instead:

```typescript
address.value.city = 'Bled';                         // outside the contract
address.value = { ...address.value, city: 'Bled' };  // a change of the field
```

The [tracking plugin](/api/plugins#tracking) makes a write into the value a change of the field.

A `Group` sends each member according to its `access`: an `'editable'` or `'readonly'` member with its value, a
`'disabled-null'` member as `null`, and a `'disabled'` member not at all. Its value is `{}` when no member is sent.
A `List` sends its rows by the same rule, and its value is `[]` when no row is sent. A container's value is never
`null`. `fullValue` is everything the container holds: every member's own `fullValue`, regardless of access.

A container's access applies to everything inside it: nothing below a `'disabled'` or `'disabled-null'` container
is sent, and therefore nothing there is validated. An element's validators run over what it sends, and only where
it is sent. `visibility` is presentation only and affects neither. The full rule, with what to declare for each
outcome, is in [What a container serializes](/api/container#what-a-container-serializes). The
[Cookbook](/guide/cookbook) applies it in individual recipes.

The composed object is cached behind a version counter that a write increments along its own branch. A container
does not traverse its members again while nothing below it has changed, and writing one field costs the depth of
the nesting, not the size of the tree.

`originalValue` is the baseline `isChanged` compares against, and assigning it resets that baseline. On a container
it is a separate copy, not the frozen object `value` returns, so it is writable where the value is not.

## Memory per element

Every value is an element: it holds its state (value, baseline, access, visibility, errors, validity counters), its
actions and, once read, cached computations of its validity and its value. Approximate heap use in V8, production
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

## Comparing elements

An element's state is private, so a structural comparison of two elements cannot read it: `isEqual(fieldA,
fieldB)` is `false` unless the two are the same element. Compare `isEqual(fieldA.value, fieldB.value)` instead.
`value` unwraps a container fully, so plain lodash `isEqual(list.value, other.value)` needs nothing further.

`items`, unlike `value`, returns the rows themselves (live `Group` instances, not their data), so comparing two such
arrays has the same limitation as comparing two fields directly. The package's own `isEqual(a, b)`, built on
`lodash-es` (already a dependency), handles this case: it treats a `FieldBase` anywhere in `a` or `b` as its
`value`, so `isEqual(list.items, other.items)` compares row by row without a loop.

## Where to read next

| Question | Page |
|---|---|
| every member every element has | [FieldBase](/api/field-base) |
| what `Field` implements, writing a value | [Field](/api/field) |
| members, serialization, `fields` | [Group](/api/group) |
| loading, submitting, resetting, optional sections, type-dependent fields | [Cookbook](/guide/cookbook) |
| a group or a list read as plain data | [view()](/api/view) |
| rows, mutations, cost | [List](/api/list) |
| a command: execute, submit, reset, confirm and reject | [Action](/api/action) |
| every event, the action chain, conditionals | [Actions](/api/actions) |
| a write into an object a field holds, other plugins | [Plugins](/api/plugins) |
| built-in rules, custom and asynchronous validators | [Validators](/api/validators) |
| `transaction()`, rollback, announcement order | [Transactions](/api/transactions) |
| upgrading an existing project | [Migration guide](/guide/migration) |
