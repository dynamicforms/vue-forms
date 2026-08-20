# Migration guide

If you are crossing several releases at once, read **[the whole journey](#the-whole-journey-0-6-1-to-0-12-x)**
first: it is those releases in one pass, ordered by how likely each change is to bite rather than by which version
produced it. The per-release sections follow it, newest first — take the ones above `v0.12.0` in that order for
the releases the journey does not cover, or a single one for a project crossing a single release.

This is the only page that names superseded APIs; everywhere else in this documentation only the current one
exists.

## The whole journey: 0.6.1 to 0.12.x

Six releases sit between those numbers. This is all of it in one pass, in the order worth doing it in.

### 1. The four silent breaks — do these first

Nothing is logged and nothing throws for any of them. Code that used them keeps compiling and simply stops
working, so they are the ones to search for before you upgrade rather than after.

**`watch(field, cb)` no longer fires.** A form element is no longer a Vue proxy of itself: its state lives in a
reactive object beside it, and the deep traversal Vue starts for a reactive watch source stops immediately. The
watcher registers and its callback is never called. Search for `watch(` with a field, group, list or action passed
directly, the array form included, and watch what you read instead.

```typescript
// before
watch(field, () => save());
watch([field, other], () => save());
watch(form.fields.people, () => recount());

// after
watch(() => field.value, () => save());
watch([() => field.value, () => other.value], () => save());
watch(() => form.fields.people.value, () => recount());
```

Every other read is unchanged: templates, `computed`, `watchEffect` and a getter passed to `watch` all track
element members exactly as before.

**`readonly(field)` no longer protects anything.** Vue's `readonly()` stops on the same flag and hands the element
straight back, so `readonly(field) === field`, `isReadonly()` on the result is `false`, and a write through it
reaches the field. Hand out the value — `field.value` and `group.value` are frozen — or a `computed` over it.

```typescript
// before: writes through the wrapper were refused, with a warning
const view = readonly(field);

// after
const view = computed(() => field.value);
```

**`isEqual` over two elements answers `true` for any two of the same class.** An element's state is held in
private class fields, so `Object.keys`, `Object.getOwnPropertySymbols`, `JSON.stringify` and lodash `isEqual` reach
none of it. From 0.15.0 the comparison throws rather than answering — see
[Comparing two elements throws](#comparing-two-elements-throws). Compare what the elements hold:

```typescript
// before
if (isEqual(rowA, rowB)) …

// after
if (isEqual(rowA.value, rowB.value)) …
```

**A lazy action under an eager action's identifier is no longer run by the eager pass.** `eager` used to be
tracked per `classIdentifier`, so one eager action carried every action registered under that identifier into
every eager run. A custom action that relied on it declares `get eager() { return true; }` for itself.

### 2. Three breaks the type checker finds for you

**`clone()` is `bind()`.** The data comes first and the rest of the overrides second, so `f.clone()` is
`f.bind(f.value)`, `f.clone({ value: x })` is `f.bind(x)` and `f.clone({ value: x, label: 'Name' })` is
`f.bind(x, { label: 'Name' })`. Everything else about it stands: the same class, the same action instances, the
same extended properties, `originalValue` read by key presence, and a `null` that clears where an `undefined`
counts as none supplied.

**The value objects a binding works over are frozen.** `group.value` and `list.value` hand out
one object per change, reused by every reader until the next one, and it is frozen — rows included. Writing into it
throws in strict mode and is silently dropped outside it. Assign a new value instead. `originalValue` holds a copy
of its own and is not frozen.

**`Action.execute(params?)` is asynchronous**, `params` is optional, and it answers what the `ExecuteAction` chain
returned rather than discarding it. Run the type checker and every `execute()` call site that used the return value
or wrapped the call in `try`/`catch` surfaces:

```typescript
// before
save.execute({ reason: 'toolbar' });                       // returned undefined
const stored = save.triggerAction(ExecuteAction, params);  // the only way to read the result
try { save.execute(); } catch (e) { report(e); }

// after
const stored = await save.execute({ reason: 'toolbar' });
try { await save.execute(); } catch (e) { report(e); }
save.execute().catch(report);
```

The chain is still entered synchronously, so a handler has already run by the time the call returns. What moves is
where a failure surfaces: a throwing handler rejects the promise, and a call that neither awaits nor catches leaves
an unhandled rejection, which under node's default settings ends the process. Template handlers need no change —
Vue attaches its own catch and routes the error to `app.config.errorHandler`.

**Custom action classes: two renamed hooks.** `boundToField(field)` is `boundToBinding(binding)` and
`unregister()` is `unregisterFrom(binding)`. Both are optional overrides, so an action that overrode neither needs
no change.

```typescript
// before
class MyAction extends FieldActionBase {
  boundToField(field) { this.fields.add(field); }
  unregister() { this.dead = true; }
}

// after
class MyAction extends FieldActionBase {
  private readonly elements = new WeakSet();
  boundToBinding(binding) { this.elements.add(binding); }
  unregisterFrom(binding) { this.elements.delete(binding); }
}
```

**Assigning `parent` or `fieldName` yourself now throws a `TypeError`.** Both are read-only accessors; the
container writes them.

### 3. Behaviour that changed under code you do not have to edit

Nothing here needs a source change. It changes what your handlers see, and what the form looks like after one of
them fails.

**Events are announced once, when the operation finishes.** Every mutating operation is a transaction; a single
write is a transaction of its own, so it still produces exactly one `ValueChangedAction`. What changes:

- repeated changes to one element coalesce — `list.value = rows` no longer announces a row member once per
  intermediate state, and an element that ends the operation holding what it started with announces nothing;
- handlers see the finished state. `insert(item, 5)` on a three-item list pads the gap and then announces three
  `ListItemAddedAction`s; a handler reading `list.value` in all three now sees six items, where it used to see
  four, then five, then six;
- the order within one operation is causal. An element announces its value first and the verdict formed over it
  second, and the deepest element announces before the container above it. A field carrying a validator used to
  announce its new verdict *before* its new value.

Wrap several writes to get one announcement instead of one per write:

```typescript
import { transaction } from '@dynamicforms/vue-forms';

transaction(() => {
  form.fields.firstName.value = 'Janez';
  form.fields.lastName.value = 'Novak';
});
```

`transaction()` throws a `TypeError` the moment its callback returns a thenable, so a transaction cannot cross an
`await`. Do the awaiting outside; an asynchronous validator settling later opens one of its own.

**A handler that throws now undoes the operation.** A `ValueChangedAction` that threw partway through
`group.value = {...}` used to leave the group half-applied. The operation now rolls back — every element it
modified goes back to what it held — and the error propagates as before. If you want the writes to stand, catch
inside the handler, or use `AbortEventHandlingException`, which still stops the chain without undoing anything.

**Cross-field rules inside a `List` start working.** A conditional action or a `CompareTo` registered on an item
template used to be dead or wrong in every row: the rows shared one result, and a comparison read the template's
own field. Each row now answers for itself, a row holding exactly the values its template holds included. **A form
that looked valid may now report the errors it always had**, and a field that never appeared may now appear in the
rows whose data calls for it. `clearValidators()` on one row likewise stops affecting the others.

```typescript
const row = new Group({ password: new Field(), confirmation: new Field() });
row.fields.confirmation.registerAction(
  new Validators.CompareTo(row.fields.password, (mine, other) => mine === other, 'Passwords must match'),
);
// every row of new List(row, …) compares its own two fields; before, they all compared the template's
```

**`label` and `icon` on an `Action` are ordinary value changes.** Both setters used to write into the value object
the action held, so nothing observed them. Each now assigns a new value object through the value setter:
`ValueChangedAction` fires, `isChanged` answers over them, and a disabled action refuses the write. If you kept a
reference to the object you passed as `params.value` and read your later writes to it back off the action, that
link breaks the first time either setter runs. `new Action({}).label = 'X'` threw a `TypeError` and now works.

**A `List` releases the rows it drops, and hands the dropped one back.** `remove()`, `pop()`, `clear()` and a
shortening assignment leave the row instance without a `parent`, so it can be pushed into another list or back into
this one. `remove()` and `pop()` answer with that instance itself, holding what it held in the list — its values,
its errors, and an `isChanged` that reports the edits made to it. An assignment of the same length reuses the row
objects positionally, so `list.get(0)` survives it and a keyed `v-for` stops remounting.

### 4. What newly works

- **`Action.busy`** — `true` from the call to `execute()` until the run settles, however it settles. Overlapping
  runs are counted. `<button :disabled="!save.enabled || save.busy">`.
- **`CompareTo` accepts a name or a callback**, so a cross-field rule needs no reference to the item template:
  `new Validators.CompareTo('password', (mine, other) => mine === other, '…')`.
- **`transaction(fn)` and `tx.rollback()`** — see [Transactions](/api/transactions).
- **`field.declaration`, `field.bindingsOf(declaration)` and `field.markRecordIncomplete()`** — what a shared
  action uses to tell one row's field from another's. [The model](/guide/model) describes the mechanism.
- **`FieldActionBase.state(key, init)`** — per-element memory for an action instance shared by every row.
- **`element.rebind(data)`** — the same element over the next record, in place: the instance, its actions and its
  extended properties all stand, and it announces no value change of its own. It is what recycles a row in a
  virtualised list.
- **Extended properties** — whatever your application attaches to an element beyond the members of its class,
  declared as its second type argument, read through `extra` and written with `setExtendedValues()`.
- **Lists got fast.** Filling a 1000-row list by `push()` went from 13.1 s to 0.20 s, writing one field from
  33 ms to 0.011 ms, and reading `list.valid` from 11.3 ms to microseconds.

### Checklist

1. Search for `watch(` with an element as the source and rewrite each to a getter.
2. Search for `readonly(` over an element and hand out the value or a `computed` instead.
3. Search for `isEqual` over elements and compare `.value` instead.
4. Run the type checker: rename every `clone(` to `bind(` and move the value out of the override object,
   `await` or `.catch()` every `execute()`, and rename `boundToField` / `unregister` on any custom action class.
5. Search for writes into a value object read back from `group.value` or `list.value` — it is frozen now.
6. Re-check any handler that relied on seeing a half-applied state, or on a validity event arriving before the
   value event that caused it.
7. Load every form that contains a `List` whose item template carries a `CompareTo` or a conditional action: those
   rules now apply, and the verdicts are the ones the data always called for.
8. Move onto Node 22 and Vue 3.5.2 or newer, and drop any bundler or test-runner configuration that pointed at
   the CJS build — the package is ESM-only.

<!-- New releases go directly below this comment, above the previous one, as `## Upgrading to vX.Y.Z (from vA.B.x)`. -->

## Upgrading to v0.16.0 (from v0.15.x)

Both breaks are about what a trigger answers with and who an action belongs to. The type checker finds neither, so
they are the ones to search for.

### `Operator.NOT` takes one operand

It reads its first operand alone and the constructor asked for a second one it never looks at, so the call needed a
placeholder. It does not any more:

```typescript
new Statement(field, Operator.NOT);          // what NOT means
new Statement(field, Operator.NOT, null);    // still accepted, still ignored
```

An operator held in a variable — what `Operator.fromString()` answers with — names both, because the compiler
cannot tell it from `NOT`.

### An abort is an answer, and refuses a `*Changing*` write

A trigger caught `AbortEventHandlingException` and answered `null`, which is also what it answers when nothing is
registered. It answers with the exception now:

```typescript
const answer = field.triggerAction(ExecuteAction, params);
// before: null, whether a handler ended the run or none was there
// after:  the exception where a handler ended it, null where none was there
if (answer instanceof AbortEventHandlingException) reportToUser(answer.message);
```

And in a `*Changing*` handler it now does what its name says. `EnabledChangingAction` and
`VisibilityChangingAction` are asked before the value is written, so ending the run there refuses the write:

```typescript
field.registerAction(new VisibilityChangingAction(() => {
  throw new AbortEventHandlingException('never suppressed');
}));
field.visibility = DisplayMode.SUPPRESS;
field.visibility;   // before: SUPPRESS — the write went through. after: unchanged
```

A handler that threw one to stop the rest of the chain while still letting the write happen has to say so: call
`supr` with the value it wants, or return that value, instead of throwing.


### An action belongs to the declaration

A binding read a copy of its declaration's actions, made when the binding was made. It reads the declaration's own
now, so a rule reaches every binding whenever it was registered:

```typescript
const template = new Group({ amount: new Field({ value: 0 }) });
const list = new List(template);
list.push({ amount: 1 });

template.fields.amount.registerAction(new Validators.Required());
list.get(0).fields.amount.valid;   // false — the row that already existed is validated too
```

Three things follow, and code that leaned on the old behaviour sees them:

- **Registering on one row registers on every row.** A row is a binding of the item template, so the rule is the
  template's. A handler meant for one row checks the element it is handed: `if (field.parent === list.get(0))`.
- **`unregisterAction()` and `clearValidators()` reach every row** for the same reason. Clearing the validators of
  one row clears the rule for all of them, and empties the errors it put on each.
- **A handler that does not call `supr` stops the whole chain.** The handlers of one declaration stand in one
  chain, so a handler watching one row and returning early silences the handlers registered before it — on every
  row. Pass `supr` along and filter on the element instead.


## Upgrading to v0.15.0 (from v0.14.x)

Every break here is announced by a throw or found by the type checker; nothing changes silently.

### `EmptyField` is gone

It was a singleton `Field` the package exported, shared by every caller, so writing to it in one place changed it
everywhere. A missing element is `null`:

```typescript
// before
const field = form.field(name) ?? EmptyField;

// after
const field = form.field(name);   // NullableField<T>, so null where the name names nothing
if (field) field.value = x;
```

### Validators are reached through the namespace alone

`Validator` and the types that go with it were exported from the package root as well as from `Validators`,
while every concrete validator was in the namespace only. One spelling now:

```typescript
// before
import { Validator, Validators } from '@dynamicforms/vue-forms';
class Even extends Validator<number> { /* … */ }

// after
import { Validators } from '@dynamicforms/vue-forms';
class Even extends Validators.Validator<number> { /* … */ }
```

`ValidationError`, `ValidationErrorText`, `ValidationErrorRenderContent`, `MdString` and `buildErrorMessage` are
unchanged and stay at the root: they are what a field hands back rather than what validates it.

### `DisplayMode` never falls back to `FULL`

A mode nobody defined used to resolve to `DisplayMode.FULL` — through `DisplayMode.fromString()`, through
`DisplayMode.fromAny()`, and through the `visibility` setter, which asked `isDefined()` and was told a misspelled
name was fine. All three refuse it now:

```typescript
DisplayMode.fromString('hidden');  // DisplayMode.HIDDEN — names are accepted, case insensitive
DisplayMode.fromString('hiden');   // Error: 'hiden' is not a DisplayMode constant
DisplayMode.fromAny(999);          // Error: 999 is not a DisplayMode constant
DisplayMode.fromAny(null);         // Error: null is not a DisplayMode constant

field.visibility = 'HIDEN';        // Error: visibility must be a DisplayMode constant
field.visibility = 999;            // Error: visibility must be a DisplayMode constant
```

Every error from `fromString()` and `fromAny()` reads `<value> is not a DisplayMode constant`; the setter keeps its
own `visibility must be a DisplayMode constant` and leaves the property at the value it held.

**Deserializing a payload is where this bites.** A response carrying `"visibility": "hiden"` — or a mode a newer
backend knows and this version does not — rendered the field fully and said nothing. It throws now, at the parse,
and the throw is not caught for you. Decide per call site what an unknown mode means:

```typescript
// keep going, and choose the default deliberately
const mode = DisplayMode.isDefined(payload.visibility)
  ? DisplayMode.fromAny(payload.visibility)
  : DisplayMode.FULL;

// or let it fail, and report the payload
field.visibility = DisplayMode.fromAny(payload.visibility);
```

`DisplayMode.isDefined()` is the member that does not throw: it answers `false` for a number that is no constant,
for a misspelled name, and for input of any other type, so it is what a parse asks before it commits.

An element whose parameters name no visibility still starts at `DisplayMode.FULL`. That is unchanged; what is gone
is anything resolving to it for input it could not read, so where you want it for bad input, write it yourself as
above.

### A disabled `List` is serialized where its rows compose something

`Group.value` leaves a disabled member out, with one exception: a disabled container is kept while its own value
is non-empty. That exception held for a nested `Group` and not for a nested `List`; it now holds for both.

```typescript
const rows = new List(template, { value: [{ a: 1 }], enabled: false });
const form = new Group({ name: new Field({ value: 'x' }), rows });

form.value;   // before: { name: 'x' }
              // after:  { name: 'x', rows: [{ a: 1 }] }
```

A disabled list that holds no rows is still left out, and a disabled `Field` is left out whatever it holds. Where
a payload must not carry the list, empty it — `rows.clear()` — or take the key out of the object you submit.

### `List.value` refuses a value that is not an array

Assigning anything but an array or `null` did nothing at all. It throws now:

```typescript
(list as any).value = 'not an array';   // TypeError: Invalid value provided: a list takes an array of rows, …
list.value = null;                      // fine — empties the list, as does clear()
```

The setter is typed, so the throw reaches a JavaScript caller, one writing through `as any`, and a value that
arrived from a server without being checked. `params.value` and `params.originalValue` are refused the same way.

### `parent` is typed per class

`FieldBase.parent` is `Group | List | undefined` - a row of a `List` gets the `List`, and the type says so now.
`Field` narrows it to `Group | undefined`, and `Action` inherits that narrowing: a `List` holds rows and a row is
a `Group`, so a field is never a `List`'s child.

```typescript
field.parent?.fields.other;   // unchanged: a field's container is a Group
row.parent?.fields;           // now a compile error: a row's container is the List
```

The type checker finds every site. Where you hold the element as a `FieldBase` - the type an action executor and a
`ValidationFunction` receive - narrow the container yourself:

```typescript
// before
new Validators.Validator((newValue, oldValue, field) => field.parent?.fields.dateFrom …);

// after
new Validators.Validator((newValue, oldValue, field) => (field.parent as Group)?.fields.dateFrom …);
```

Naming the sibling and letting `CompareTo` resolve it - `new Validators.CompareTo('dateFrom', …)` - needs no
narrowing at all.

### Writing what an element already holds runs nothing

`visibility` and `enabled` ran their `*Changing*` handler and fired their `*Changed*` event for every write,
including one of the value already there. They return before any of it now, which is what the value setter has
always done:

```typescript
field.enabled = field.enabled;   // no handler runs, no event fires, nothing enrols in an open transaction
```

Code counting events, or a `*Changing*` handler that answers with a value of its own regardless of what was
written, sees the difference. A handler meant to hold a value at a fixed mode is better written as a rule over the
field it depends on — a `ConditionalVisibilityAction` — since it then states the mode rather than intercepting
attempts to leave it.

### Comparing two elements answers identity

`isEqual(fieldA, fieldB)` answered `true` for any two elements of the same class: an element's state is in private
class fields, so a structural comparison reached none of it. It answers `false` now unless the two are the same
element:

```typescript
isEqual(rowA, rowB);              // false, where it was true
isEqual(rowA, rowA);              // true
isEqual(rowA.value, rowB.value);  // what to write to compare the data
```

`FieldBase` carries a `Symbol.toStringTag` accessor naming the element's class, which is the first thing a
structural comparison reads and a tag it does not know ends it there. The same accessor changes what a string
coercion produces: `` `${field}` `` and `String(field)` answer `[object Field]` where they answered
`[object Object]`, and so does a validator message naming the `{field}` placeholder.

### A `List` declared with `originalValue` alone holds those rows

A `Field` and a `Group` given an `originalValue` and no `value` take the value from it. A `List` did not: it was
built empty, read back `null` and reported itself changed against the value it was declared with.

```typescript
const list = new List(template, { originalValue: [{ a: 1 }] });

list.length;      // before: 0     after: 1
list.isChanged;   // before: true  after: false
```

An explicit `value: null` beside an `originalValue` still leaves the list empty — `null` is a value you mean.
Code that relied on the empty list can pass `value: null` to keep it.

## Upgrading to v0.14.0 (from v0.13.x)

Every break here is found by the type checker or announced by a throw. Nothing changes silently.

### `bind()` refuses what it never honoured

`IBindParams` used to name everything a constructor takes but the value, while `bind()` read only
`originalValue`, `enabled` and `visibility`. Four keys compiled and did nothing:

```typescript
// before: accepted, and silently ignored
field.bind(value, { validators: [required], touched: true });

// after: a compile error. Register on the declaration; a binding carries what it declared
declaration.registerAction(required);
const bound = declaration.bind(value);
```

`validators` and `actions` are carried from the declaration, and `touched` and `errors` are what the binding
establishes for itself as it validates.

### `bind()` on a subclass builds the subclass

`Group.bind()` and `List.bind()` construct through `this.constructor`, so `class Address extends Group {}` binds
into an `Address` rather than into a `Group`. Code that tested the result with `instanceof` starts answering
differently, in the direction it was written to expect.

A subclass whose constructor does not take `(fields, params)` — one that composes its own members and passes them
to `super` — never sees the members `bind()` hands over. That now throws instead of answering with the
declaration's data:

```typescript
class Fixed extends Group {
  constructor() { super({ city: new Field({ value: 'declared' }) }); }
}
new Fixed().bind({ city: 'Maribor' });   // TypeError
```

Give such a subclass a `(fields, params)` constructor, or override `bind()` and construct it yourself.

## Upgrading to v0.13.0 (from v0.12.x)

One break is silent and is the one to search for before you upgrade: `Required` trims. The rest throw or are found
by the type checker.


### `Required` trims, so whitespace alone is no longer a value

`Required` measures a string after trimming it, so a field holding `'   '` is empty and the field is invalid.
Nothing is logged and nothing throws: a form that used to accept a space stops accepting one, from the moment it
is built. A project with many `Required` usages becomes stricter everywhere at once.

```typescript
// a value of spaces used to pass; now
new Validators.Required();                  // '   ' fails
new Validators.Required({ trim: false });   // '   ' passes
```

The options stand beside a message or on their own, and the first two arguments are told apart by shape — a
string, an `MdString`, a function, a `Ref` and an object naming a component are messages, and any other object is
the options:

```typescript
new Validators.Required('Please enter a name');
new Validators.Required('Please enter a name', { trim: false });
```

`RequiredOptions` is exported. Only strings are trimmed; an array, an object or any other value is measured as it
stands.

What to do: search for `Required` and decide per field whether spaces are part of what it holds — a signature
line, a formatting-sensitive code — and pass `{ trim: false }` there. Everywhere else the new verdict is the one
the field always meant. `error.code === 'required'` now names the failure, so a sweep over your forms can
count exactly which fields the stricter verdict catches.

### `Statement` throws on an operand it cannot compare

An operand that is `undefined` or a function throws a `TypeError` from the constructor, naming the position it
was written at:

```typescript
new Statement(form.fields.usreName, Operator.EQUALS, true);
// TypeError: Statement operand 1 is undefined: an operand is a field, a nested statement or a literal, …

new Statement(() => form.fields.userName, Operator.EQUALS, true);
// TypeError: Statement operand 1 is a function: …
```

Both are what a mistake reaches the constructor with: a misspelled name off `group.fields`, and a field accessor
handed over uncalled. A statement built from either compared nothing and never fired, so the code it drove — a
conditional visibility, a conditional enablement — silently did nothing. The throw arrives where the name is
written.

Everything else stands as an operand: a field, a nested statement, `null`, `NaN`, `0`, `''`, an array, an object
with `includes`. `Operator.NOT` reads its first operand only, so the second position under it is not checked.
`group.field('typoName')` answers `null` rather than `undefined`, and `null` is a literal a statement may compare
against — reach for it where a name may legitimately be absent.

### Type tightenings the checker finds for you

**Five validators no longer take a type parameter**, because none of them ever read it: `Required`, `Pattern`,
`MinLength`, `MaxLength` and `LengthInRange`. Drop the argument.

```typescript
// before
new Validators.Required<string>();
new Validators.Pattern<string>(/^\d{4}$/);

// after
new Validators.Required();
new Validators.Pattern(/^\d{4}$/);
```

`InAllowedValues`, `MinValue`, `MaxValue`, `ValueInRange` and `CompareTo` keep theirs, where it types an argument
or a callback.

**`GroupValue<T>` is `Partial<FieldsToValues<T>> | null`.** A group leaves a disabled member out of the object it
builds, so every member of a read value is possibly `undefined` — which is what the runtime always handed out.
Code that reads a member off `group.value` and passes it on where the type is required needs a fallback or a
check:

```typescript
// before
const name: string = group.value!.firstName;

// after
const name: string = group.value?.firstName ?? '';
```

**`busy` is a member of every element**, so a parameter of that name is no longer an extended property:
`new Field({ busy: true })` throws a `TypeError`, the way `valid` and `validating` already did. A presentation
layer carrying a `busy` property of its own states it under another name.

### Behaviour that changed under code you do not have to edit

**`validating` answers for the whole subtree.** A group or a list reports `true` while an asynchronous validation
is in flight anywhere below it, where it used to answer for its own runs alone. A form asks one element what the
tree is doing:

```typescript
// before: every field, one by one
const pending = Object.values(form.fields).some((field) => field.validating);

// after
form.validating;
```

The answer is a pair of counters rather than a walk, so the read costs nothing and a run that starts or settles
costs the nesting depth. A guard that already read `form.validating` and found it always `false` now blocks while
a field below is being checked, which is what it was written to do.

**`group.fields` hands out a guarded view.** Reading it is unchanged; `Object.defineProperty(group.fields, …)`
now throws a `TypeError` alongside assignment and `delete`, and names `addField()` / `removeField()` as the way to
change the set.

### What newly works

- **`ValidationError.code`** — a kebab-case identifier of what failed, so a program reacting to one failure does
  not have to match message text that is translated and configurable. The built-in validators state theirs:
  `required`, `pattern`, `min`, `max`, `range`, `min-length`, `max-length`, `range-length`, `in-allowed-values`,
  `compare-to`, and `validation-failed` on the error a rejected validation promise leaves. Every error class takes
  it as its last constructor argument.
- **A `ValidationFunction` receives a fourth argument, `signal: AbortSignal`.** Hand it to the work the function
  commissions and that work is called off the moment the run's verdict stops counting — a newer run over the same
  field, a validator taken off the field, a transaction that was unwound. A cancelled run reaches no verdict, so a
  check that rejects on abort says nothing and reports nothing. A function with nothing to cancel ignores it.
- **`busy`** on every element — `true` while anything at or below it is still running, an asynchronous validation
  or an `Action.execute()` that has yet to settle. `<button :disabled="!form.valid || form.busy">`.
- **`Group.addField(name, field)` and `Group.removeField(name)`** — the member set changes after construction.
  Both are transactional; `addField` throws `Error` for a name the group already holds and `TypeError` for a field
  another container holds, and `removeField` hands the field back detached, answering `undefined` for a name the
  group does not hold. Neither rewrites the baseline behind `isChanged`.
- **`List.length` and `List.items`** — the row count, and a frozen array of the live rows built once per change of
  the set. `v-for="row in list.items"` replaces counting through `list.value`.
- **`InAllowedValues` takes `AllowedValues<T>`** — an array, a `Ref<T[]>` or a `() => T[]` — and reads the list at
  each validation, so a list that arrives from a server after the validator is built is the one the value is
  measured against and the one the message names.
- **`getConfig()`, `setConfig()` and `FormsConfig`** are exported from the package entry point beside the plugin,
  so the global options can be read and written without an app to install a plugin on.
- **`list.value = null` type-checks**, the write `group.value = null` makes into a nested list included.

### `busy` states an execution, and `fullValue` states what an element holds

`busy` is `true` while an `Action.execute()` at or below the element has yet to settle, and nothing else. An
asynchronous validation is what `validating` answers for. Code that read `busy` alone to decide whether the tree
was idle now misses a validation in flight:

```typescript
// before: busy answered for both
if (form.busy) return;

// after: two questions, or one await
if (form.busy || form.validating) return;
await form.settled();
```

`Group.fullValue` is typed `FieldsToFullValues<T>` where it answered `Record<string, any>`, so what was `any`
now carries the field's real type and the type checker starts reading it. `List.fullValue` changes what it
returns as well as its type: it maps its rows through their own `fullValue` instead of answering with `value`, so
a field disabled inside a row is in it, and an empty list reads back as `[]` rather than as `null`.

### Checklist for 0.13.0

1. Search for `Required` and pass `{ trim: false }` where whitespace is part of what the field holds.
2. Run the type checker: drop the type argument from `Required`, `Pattern`, `MinLength`, `MaxLength` and
   `LengthInRange`, and handle the now-optional members of a read `GroupValue`.
3. Rename any extended property called `busy`.
4. Load the forms that carry conditional actions: a `Statement` built over a misspelled name now throws where it
   used to do nothing.
5. Search for `busy`: where it gated on the whole tree being idle, read `validating` beside it or await
   `settled()`.
6. Search for `fullValue` on a `List`: it now carries the fields a row disables, and answers `[]` for an empty
   list.

## Upgrading to v0.12.0 (from v0.11.x)

Two of the breaks are about the shape of the published package. The third is the action store, and it only
reaches code that used `ActionsMap` directly.

### The package is ESM-only

One build ships, with one set of type definitions. The `require` condition of `exports`, the `main` field, the
UMD artifact and the `index.d.cts` copy of the declarations are gone, and so is the `DynamicFormsVueForms`
global the UMD build exposed. `lodash` leaves `dependencies`; `lodash-es` is the only runtime dependency left.

An `import` needs no change. A CommonJS consumer keeps working through `require()` of an ES module, which Node
supports from 20.19 and 22.12:

```javascript
const { Field, Group } = require('@dynamicforms/vue-forms');
```

A script tag that read the library off `window.DynamicFormsVueForms` has no replacement in the package. Load the
ESM build as a module instead:

```html
<script type="module">
  import { Field } from '/node_modules/@dynamicforms/vue-forms/dist/dynamicforms-vue-forms.js';
</script>
```

If a bundler or test runner was configured to reach for the CJS build — a Jest `moduleNameMapper` entry, a
`transformIgnorePatterns` exception, a Vite `resolve.alias` — remove that configuration. It now resolves to
nothing, and while it worked it was the way a program ended up holding two copies of the library, which made
`instanceof` answer `false` between them and produced `Invalid fields object provided` for a valid `Field`.

### Node 22 and Vue 3.5.2 are the floors

`engines.node` is `>=22` and the `vue` peer range is `^3.5.2`.

Node 18 has been end of life since April 2025, and `require()` of an ES module — what a CommonJS consumer now
depends on — is stable from 22.12.

The Vue floor is what the shipped declarations need, not what the source needs: `MessagesWidget` is emitted as a
`DefineComponent` with 20 type arguments, and the type accepts 19 through Vue 3.5.1. Below 3.5.2 a consumer
type-checking with `skipLibCheck: false` gets `TS2707` on that line; a consumer with `skipLibCheck: true`, and
anything at runtime, is unaffected either way.

### `ActionsMap` is no longer a `Map`

It groups the actions of one identifier in a list and walks them, instead of composing them into nested closures.
`registerAction()`, `triggerAction()` and `clearValidators()` on an element are unchanged, and so is the order
handlers run in — newest registration first, reaching the ones before it through `supr`. Only code holding an
`ActionsMap` and calling into it is affected:

| before | after |
|---|---|
| `map.get(identifier)` | `map.willTrigger(identifier)` answers whether anything stands there; there is no executor to fetch |
| `map.triggerChain(identifier, field, ...params)` | `map.trigger(ActionClass, field, ...params)` — `trigger()` no longer runs the eager pass with it |
| `map.cloneWithoutValidators()` | `field.clearValidators()`, or `map.unregister()` per validator from `map.validators` |
| `map.has(identifier)`, `map.set(...)`, iteration | `map.register()` / `map.unregister()` |

**`eager` is read per action.** It used to be tracked per `classIdentifier`, so a lazy action registered under the
same identifier as an eager one ran in every eager pass along with it. Now only the eager actions run. A custom
action that relied on being carried along has to declare `get eager() { return true; }` itself.

**`unregisterFrom(binding)` runs earlier.** It used to run once the operation that dropped the registration had
committed; it now runs inside that operation, and an operation that unwinds puts back both the registration and
whatever the action released. An override that only removes bookkeeping needs no change.

### New: dropping and placing an action

Neither was possible while a registration was a closure wrapping the one before it.

```typescript
const required = new Validators.Required();
const field = new Field({ value: '', validators: [required] });

field.unregisterAction(required);   // true; the error it put there goes with it
field.valid;                        // true

// the audit handler already registered now wraps this one and sees the trimmed value
field.registerActionBefore(new ValueChangedAction((f, supr, v, old) => supr(f, v.trim(), old)), audit);
```

`unregisterAction()` names one element: the same instance goes on serving every other element it was registered
on, so dropping a validator names the declaration that holds it. A rollback puts back what a
transaction registered or unregistered.


## Upgrading to v0.11.0 (from v0.10.x)

Two breaks, both about what an element is made from and what a `List` hands back.

### `clone()` is `bind()`, and there is now a `rebind()` beside it

`bind(data?, overrides?)` is what `clone(overrides?)` was, with the data it binds as the first argument instead of
a key of the override object. The type checker finds every call site.

```typescript
// before
const copy = field.clone();
const cleared = field.clone({ value: null });
const relabelled = field.clone({ value: 2, label: 'Full name' });

// after
const copy = field.bind(field.value);   // field.bind() is the same thing
const cleared = field.bind(null);
const relabelled = field.bind(2, { label: 'Full name' });
```

Everything the call does is unchanged: the same class through `this.constructor`, the same action and validator
instances, the same extended properties with the overrides written over them, `originalValue` read by key presence
in the second argument, and a `null` that clears where an `undefined` counts as no data supplied. The second
argument is typed `IBindParams<T, X>` — `IFieldParams<T, X>` without `value` — and goes on accepting `validators`
and `actions` without reading them.

`rebind(data)` is the new half of the pair: the same exchange made in place. The element stays the instance it was,
keeps its actions, its extended properties and its place in whatever container holds it, and comes out over the new
record with `originalValue` baselined to it, `touched` back to `false` and the validators run. It announces no
value change of its own — a rebound row's members announce theirs, and a verdict that moves is announced as always.
It is what recycles one row across records in a virtualised list:

```typescript
const row = list.get(0)!;
row.rebind(records[scrollIndex]);   // same instance, same component, next record
```

### `remove()` and `pop()` hand back the row itself

They used to answer with a copy of the removed row, which reported `isChanged` as `false` however the row had been
edited, and which was not the instance the list had held. They now answer with the row, released of the list:
`ListItemRemovedAction` receives the same instance, `list.get(index)` answered with it before the call, and it
holds what it held while it stood in the list — its values, its errors, and the change history behind `isChanged`.

```typescript
const removed = list.remove(0)!;
removed.isChanged;   // true where the row was edited; it was always false before
undoStack.push(removed);
list.push(removed);  // the very instance goes back in
```

Code that relied on the answer being detached needs no change — the row is released as it leaves, so it carries no
`parent` and any container will take it. Code that relied on it being a *copy*, with the list keeping a live row of
its own, was reading a row the list had already dropped.

## Upgrading to v0.10.0 (from v0.9.x)

Actions and validators now answer for the element they fired for rather than for the element they were written
against. Code that registers them and reads the results needs no change; code that writes its own action class, or
that relied on a conditional action or a `CompareTo` inside a `List` being inert, does.

### Cross-field rules inside a `List` start working

A conditional action or a `CompareTo` registered on a `List`'s item template used to be dead or wrong in every row:
the rows shared one result, and a comparison read the item template's field rather than the row's. Each row now
answers for itself — a row holding exactly the values its template holds included — so a form that looked valid
may now report the errors it always had, and a field that never appeared may now appear in the rows whose data
calls for it.

```typescript
const row = new Group({ password: new Field(), confirmation: new Field() });
row.fields.confirmation.registerAction(
  new Validators.CompareTo(row.fields.password, (mine, other) => mine === other, 'Passwords must match'),
);
// every row of new List(row, …) compares its own two fields; before, they all compared the template's
```

`clearValidators()` on one row likewise stops affecting the others.

### `CompareTo` accepts a name and a callback

The first constructor argument is now `FieldBase | string | ((field: FieldBase) => FieldBase | null | undefined)`.
Passing a field keeps working and is resolved within the record being validated. The two new forms save you a
reference to the template:

```typescript
new Validators.CompareTo<string>('password', (mine, other) => mine === other, 'Passwords must match');
new Validators.CompareTo<number>((field) => (field.parent as Group)?.fields.dateFrom, (to, from) => to >= from, '…');
```

### Custom actions: two renamed hooks

`boundToField(field)` is `boundToBinding(binding)` and `unregister()` is `unregisterFrom(binding)`. Both are
optional overrides, so an action that overrode neither needs no change; one that did keeps its body and takes the
new name. `unregisterFrom` names the element the validator was dropped from, because the instance goes on serving
the others.

```typescript
// before
class MyAction extends FieldActionBase {
  boundToField(field) { this.fields.add(field); }
  unregister() { this.dead = true; }
}

// after
class MyAction extends FieldActionBase {
  private readonly elements = new WeakSet();
  boundToBinding(binding) { this.elements.add(binding); }
  unregisterFrom(binding) { this.elements.delete(binding); }
}
```

`boundToBinding` runs once per element the action comes to serve — the element it was registered on, and every
clone of that element as the clone takes it on — so the set an action keeps this way is the set of elements it
actually drives, and a rule registered on one row of a `List` stays that row's rule. Keep the elements weakly:
recording them in a `Set` grows without bound over a list that churns rows.

An action instance is shared by every clone of the element it was registered on, so anything else it keeps on
itself is shared by every row too. `protected state(key, init)` keeps it per element instead, and `unregisterFrom`
is where a per-element release belongs.

## Upgrading to v0.9.0 (from v0.8.x)

Only the `Action` class changes. Everything else — `Field`, `Group`, `List`, validators, transactions — keeps its
signatures and its behaviour.

### `execute()` answers a promise

`Action.execute(params?)` is `async`. It returns what the `ExecuteAction` chain returned, where it used to discard
that value, and `params` is now optional.

```typescript
// before
save.execute({ reason: 'toolbar' });                      // returned undefined
const stored = save.triggerAction(ExecuteAction, params);  // the only way to read the result

// after
const stored = await save.execute({ reason: 'toolbar' });
```

The chain is still entered synchronously, so a handler has already run by the time the call returns and code that
ignores the answer keeps working. What changes is where a failure surfaces: a handler that throws now rejects the
promise instead of throwing out of the call.

```typescript
// before: the throw arrived here
try { save.execute(); } catch (e) { report(e); }

// after: await it, or attach a catch
try { await save.execute(); } catch (e) { report(e); }
save.execute().catch(report);
```

A call that does neither leaves an unhandled rejection, which under node's default settings ends the process.
Template handlers need no change — Vue attaches its own catch to the promise an event handler returns, and routes
the error to `app.config.errorHandler`.

### `label` and `icon` are value changes

Both setters used to write into the value object the action held, so nothing observed them: no
`ValueChangedAction`, `isChanged` permanently `false`, and a disabled action accepted the write. Each now assigns a
new value object through the value setter, so all three behave as they do for any other field.

If you registered a `ValueChangedAction` on an action and wrote its label, you now receive an event you did not
receive before, and a form containing the action reports itself changed. If you kept a reference to the object you
passed as `params.value` and read your later writes to it back off the action, that link breaks the first time
either setter runs — the action holds a copy from then on.

`new Action({}).label = 'X'` threw a `TypeError` and now works.

### `Action.busy`

```vue
<button :disabled="!save.enabled || save.busy" @click="save.execute()">{{ save.label }}</button>
```

`busy` is `true` from the call to `execute()` until the run it started settles, however it settles. It is form
state, not part of the action's value, so it is neither serialized nor restored by a transaction rollback: a
rollback cannot un-start a submit that is already running.

## Upgrading to v0.8.0 (from v0.7.x)

Nothing you call changes name or signature. What changes is **when** your handlers run and **how many times**,
and what a form looks like after a handler throws. Read [Transactions](/api/transactions) for the model; this
section is only the differences.

### An operation announces once, at its end

Every mutating operation is a transaction, and a transaction announces what it did when it finishes. A single
write is a transaction of its own, so it still produces exactly one `ValueChangedAction` and at most one
`ValidChangedAction` per level — that part is unchanged. Three things do change:

- **Repeated changes to one element coalesce.** `list.value = rows` no longer announces a row member once per
  intermediate state; an element that ends the operation holding what it started with announces nothing.
- **Handlers see the finished state.** `insert(item, 5)` on a three-item list pads the gap and then announces
  three `ListItemAddedAction`s. A handler reading `list.value` inside them now sees six items in all three,
  where it used to see four, then five, then six. Additions and removals are still announced one by one, in
  order, and are never compared away.
- **The order within one operation is causal.** An element announces its value first and the verdict formed over
  it second, and the deepest element announces before the container above it. A field carrying a validator used
  to announce its new verdict *before* its new value; if you relied on that order — reading `field.value` from a
  `ValidChangedAction` and expecting the old one — the value you read is now the new one.

If you write several fields together and want one announcement rather than one per field, wrap them:

```typescript
import { transaction } from '@dynamicforms/vue-forms';

transaction(() => {
  form.fields.firstName.value = 'Janez';
  form.fields.lastName.value = 'Novak';
});
```

### A handler that throws now undoes the operation

Previously, a `ValueChangedAction` that threw partway through `group.value = {...}` left the group half-applied:
some members written, some not, and the group's own verdict never recomputed. The operation now rolls back —
every element it modified goes back to what it held — and the error propagates as before.

Handlers written to fail loudly on bad input therefore stop being a way to accept part of an assignment. If you
wanted the writes to stand, catch inside the handler, or use `AbortEventHandlingException`, which still stops the
handler chain without undoing anything.

### A transaction cannot cross an `await`

`transaction()` throws a `TypeError` the moment its callback returns a thenable. Do the awaiting outside and open
a transaction for each synchronous part. An asynchronous validator settling later opens one of its own, so
nothing about async validation needs changing.

## Upgrading to v0.7.0 (from v0.6.x)

### `watch(field, ...)` with a bare element as the source no longer fires, and `readonly(field)` no longer protects one

These are the two changes that are invisible at runtime: nothing is logged and nothing throws. The watcher
registers and its callback is simply never called. Search your project for `watch(` with a field, group, list or
action passed directly — including the array form — and rewrite each to watch what you actually read.

```typescript
// before: fired on any change inside the field
watch(field, () => save());
watch([field, other], () => save());
watch(form.fields.people, () => recount());

// after: watch the value, or whichever member you care about
watch(() => field.value, () => save());
watch([() => field.value, () => other.value], () => save());
watch(() => form.fields.people.value, () => recount());
```

A form element is no longer a Vue proxy of itself: its mutable state lives in a reactive object beside it, and
the element carries `__v_skip`. Every read through the element — `field.value`, `group.valid`, `list.errors` —
is tracked exactly as before, in a template, in a `computed`, in a `watchEffect` and in a getter passed to
`watch`. What Vue can no longer do is take a bare element as a watch source and walk it: it starts a deep
traversal, the traversal stops on `__v_skip`, and the watcher ends up subscribed to nothing.

`watchEffect(() => save(field.value))` was never affected and needs no change.

`readonly(field)` fails the same way. Vue's `readonly()` stops on `__v_skip` too, so it hands the element straight
back: `readonly(field) === field`, `isReadonly(readonly(field))` is `false`, and a write through the value it
returned goes through and changes the field. Nothing warns. Where you were handing a wrapped element out to keep a
consumer from writing to it, hand out the value — `field.value`, `group.value` — which is frozen, or a `computed`
over it.

```typescript
// before: writes through the wrapper were refused, with a warning
const view = readonly(field);
view.value = 'x'; // now: assigns to the field itself

// after
const view = computed(() => field.value);
```

Two further consequences are visible only to code that inspects the object itself: `toRaw(field)` returns `field`,
and an element's whole state — `parent` and `fieldName` among it — is held in private class fields rather than in
own properties. `Object.keys(field)`, `Object.getOwnPropertySymbols(field)`, `JSON.stringify(field)` and lodash
`isEqual` reach none of it. Assigning `field.parent` yourself now throws a `TypeError` instead of being silently
accepted; the container sets it. `isEqual` over two elements answers `true` for any two instances of the same
class, because it has nothing left to read — compare `a.value` with `b.value` instead. From 0.15.0 that
comparison throws rather than answering, and says so.

## Upgrading to v0.6.0 (from v0.5.x)

Most projects need three mechanical edits — `.create(` → `new `, dropping `reactiveValue`, and renaming `IField` /
`IFieldAction` in type positions. There is a [checklist](#checklist-for-0-6-0) at the end of this section.

### Fields are constructed with `new`

`Field.create()` and `Action.create()` are gone, and so is the constructor guard that made `new Field()` throw a
`TypeError`. All four element classes are now constructed the same way.

```typescript
// before
const name = Field.create({ value: 'John' });
const age = Field.create<number>({ value: 30 });
const save = Action.create({ value: { label: 'Save' } });

// after
const name = new Field({ value: 'John' });
const age = new Field<number>({ value: 30 });
const save = new Action({ value: { label: 'Save' } });
```

`Group` and `List` are unchanged — they always used `new`.

Type inference is unchanged too: `new Field({ value: 'a' })` is a `Field<string>`, `new Field()` is a
`Field<any>`, and an explicit type argument still wins. In most codebases the whole change is a search and replace
of `Field.create(` → `new Field(` and `Action.create(` → `new Action(`, including the generic forms
`Field.create<T>(` → `new Field<T>(`.

A subclass of `Field` no longer needs a factory of its own. Give it a constructor, or override the protected
`init(params)` hook when all you want is different parameter handling. `bind()` constructs through
`this.constructor`, so a subclass binds into its own class either way.

`init` runs from `Field`'s constructor, that is, during your subclass's `super()` call and therefore **before**
your own class-field initializers — read only the constructor parameters in it, never members you initialize on
the subclass. This is the one ordering the factory hid: `Field.create()` used to run `init` after the instance
was fully constructed, so a subclass field initializer ran first and `init` saw it.

```typescript
class Currency extends Field<number> {
  suffix = ' EUR'; // runs after init(), so init() sees undefined

  protected init(params?: Partial<IFieldConstructorParams<number>>) {
    super.init(params);
    console.log(this.suffix); // undefined
  }
}
```

A subclass field initializer also wins over anything `init` assigned to the same member, so
`class Sub extends Field<string> { protected _value = 'x' }` now ends up with `'x'` whatever `value` the caller
passed. If your subclass needs its own initialized state during setup, assign it inside the overridden `init`
instead of as a class field.

### `reactiveValue` is gone — read `.value`

Every read through a form element is tracked from construction onwards, so `value` is directly reactive and needs
no computed wrapper.

```vue
<!-- before -->
<template>
  <pre>{{ formOutput }}</pre>
</template>

<script setup>
const formOutput = personForm.reactiveValue;
</script>
```

```vue
<!-- after -->
<template>
  <pre>{{ personForm.value }}</pre>
</template>
```

The same applies outside templates: `watch(() => form.value, ...)` and `computed(() => form.value)` track it, and
`form.fields.age.enabled = false` re-renders whatever read `enabled`. Delete the intermediate constant; there is no
replacement member to bind to.

### `IField` and `IFieldAction` are gone

Both interfaces are removed. Use the classes in type positions:

| Before | After |
|--------|-------|
| `IField` | `FieldBase` |
| `IField<T>` | `FieldBase<T>` |
| `IFieldAction` | `FieldActionBase` |

```typescript
// before
import { IField, IFieldAction } from '@dynamicforms/vue-forms';

function isDirty(field: IField): boolean { return field.isChanged; }
function register(field: IField, actions: IFieldAction[]) { /* ... */ }

// after
import { FieldActionBase, FieldBase } from '@dynamicforms/vue-forms';

function isDirty(field: FieldBase): boolean { return field.isChanged; }
function register(field: FieldBase, actions: FieldActionBase[]) { /* ... */ }
```

`FieldBase` and `FieldActionBase` are the classes the library checks at runtime — `new Group({...})` rejects a
member that is not `instanceof FieldBase`, and `registerAction()` rejects an action that is not `instanceof
FieldActionBase`. Anything hand-rolled to satisfy the old interface structurally, rather than derived from the
class, was already failing at runtime and has to become a real subclass:

```typescript
// before: compiled, then threw Error('Invalid action type') on registration
field.registerAction({ execute: (f, supr, ...p) => supr(f, ...p) } as IFieldAction);

// after
const MyActionClassIdentifier = Symbol('MyAction');

class MyAction extends FieldActionBase {
  static get classIdentifier() { return MyActionClassIdentifier; }
}
field.registerAction(new MyAction((f, supr, ...p) => supr(f, ...p)));
```

The same substitution applies wherever the old name appeared in a library signature you were typing against:
`ValidationFunction`'s third parameter, `Group`'s `fields` map, `CompareTo`'s `otherField`, and the `field`
parameter of every action executor.

### Constructor parameters accept only writable members

`IFieldConstructorParams<T>` now lists exactly `value`, `originalValue`, `enabled`, `visibility`, `touched`,
`errors`, `validators` and `actions`. Passing a derived member used to type-check and then throw a `TypeError` on
the reactive proxy; it is a compile error now.

```typescript
// before: compiled, threw at runtime
Field.create({ value: 1, valid: true });

// after: TS2353 at the call site
new Field({ value: 1, valid: true });
```

If you were setting `valid`, set `errors` instead — `valid` is `errors.length === 0`. `isChanged` follows from
`value` and `originalValue`, and `fullValue` from `value`. `parent` and `fieldName` are installed by the container.

`clone()` takes the same type, so `f.clone({ valid: true })` is rejected there as well. Of the keys it does accept,
`clone()` reads only `value`, `originalValue`, `enabled` and `visibility` — `errors`, `touched`, `validators` and
`actions` type-check and are ignored.

The other exported half of that type changed with it: `IFieldConstructorActionsList<T>` → `IFieldConstructorActionsList`.
It lost its type parameter, which it never used for anything, and both its members are typed `FieldActionBase[]`.
A written-out `IFieldConstructorActionsList<MyValue>` now fails with TS2315 — drop the argument.

### `validating` is typed `boolean` and is read-only

`validating` was a literal-`false` property, which made the documented guard `field.validating === true` report
TS2367 in consumer code. It is a getter over the number of asynchronous validators still running, and its declared
type is `boolean`.

```typescript
// before: TS2367 - "This comparison appears to be unintentional"
if (field.validating === true) disableSubmit();

// after: compiles, and is true while an async validator is pending
if (field.validating) disableSubmit();
```

If you run asynchronous validation of your own, bracket it with the new `beginValidating()` / `endValidating()`
pair rather than assigning the flag:

```typescript
field.beginValidating();
try {
  field.errors = await checkOnServer(field.value);
} finally {
  field.endValidating();
}
```

### Value types resolve instead of collapsing to `any`

`Group.value` and `List.value` carry their real types. Every member of the value object used to come out `any`;
each one is now the type of the field it came from, and a nested `Group` or `List` contributes its own value shape.
This is not a source change, but it turns previously silent mistakes into compile errors:

```typescript
const form = new Group({
  name: new Field({ value: '' }),
  addr: new Group({ city: new Field({ value: '' }) }),
});

const name: number = form.value!.name;   // TS2322 - it is a string. Was accepted as any
const city = form.value!.addr!.city;     // string. addr was any, so .city was unchecked
```

The types behind it are exported: `FieldsToValues<T>` maps a fields interface to its value object, `GroupValue<T>`
and `GroupValueInput<T>` are the group's read and write types, and `ListValue` is `Record<string, any>[] | null`.

`Group.value`'s setter takes a `Partial` — keys you leave out are not touched, which is what it always did at
runtime. `List.value`'s setter takes an array; use `clear()` to empty a list.

### What newly works

Reads through a group or a list are tracked, the same as reads through a field. Three things the UI could not
observe before are now plain reactive reads:

- **Group-level validation errors.** A validator registered on a `Group` writes to `group.errors`; rendering
  `group.errors` or `group.valid` repaints when it fires.
- **Conditional visibility and enablement on a `Group`.** `group.visibility` and `group.enabled` are tracked, so a
  `ConditionalVisibilityAction` or `ConditionalEnabledAction` registered on a group shows and hides the whole
  section.
- **Structural changes to a `List`.** `push()`, `insert()`, `remove()`, `pop()` and `clear()` are tracked, so a
  `v-for` over `list.value` re-renders on its own.

If your project worked around any of these — a manual `ref` bumped after every list mutation, a `key` forced to
change, an explicit `triggerRef`, a `computed` re-reading `JSON.stringify(group.value)` — the workaround can go.

Two constructions that used to raise are also available now:

- **Cloning an empty `List`** yields an empty list. It used to throw a `TypeError`, and with it every operation
  that clones internally: `Group.clone()` on a group holding an empty list, and `push()`, `insert()` or
  construction with a `value` on a list whose item template holds one.
- **A group field named after an `Object.prototype` member**, such as `new Group({ toString: new Field() })`. It
  used to be reported as a duplicate name.

### Checklist for 0.6.0

1. Replace `Field.create(` with `new Field(` and `Action.create(` with `new Action(`, generic forms included.
2. Delete every `reactiveValue` read; bind `.value` directly and remove the intermediate constant.
3. Rename `IField` → `FieldBase` and `IFieldAction` → `FieldActionBase` in every type position, and drop them from
   your imports.
4. Turn any structurally implemented action into a subclass of `FieldActionBase` with a static `classIdentifier`.
5. Run the type checker. Constructor and `clone()` calls that pass a derived member (`valid`, `isChanged`,
   `fullValue`, `validating`, `parent`) now fail — set `errors` instead of `valid`, and drop the rest. Drop the
   type argument from any written-out `IFieldConstructorActionsList<T>` as well.
6. Fix the errors the resolved `Group.value` / `List.value` types surface — wrong value types and unchecked reads
   through a nested group that used to pass as `any`.
7. Replace assignments to `validating` with `beginValidating()` / `endValidating()`, and simplify any cast that
   existed only to compare it against `true`.
8. Remove reactivity workarounds around groups and lists, and the `try`/`catch` or `{ value: [] }` guards around
   cloning an empty list.
9. For every subclass of `Field`, replace its factory with a constructor or an `init` override, and check its
   class fields: `init` now runs before them, so an initializer overwrites what `init` assigned and `init` reads
   such a member as `undefined`.

---

> See also: [The model](/guide/model), [Getting Started](/guide/getting-started), [Field](/api/field),
> [Group](/api/group), [List](/api/list)
