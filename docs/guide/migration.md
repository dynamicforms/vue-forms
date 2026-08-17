# Migration guide

Every breaking release has its own section below, newest first. If you are crossing several releases at once,
work from the bottom of the page upwards.

This is the only page that names superseded APIs; everywhere else in this documentation only the current one
exists.

<!-- New releases go directly below this comment, above the previous one, as `## Upgrading to vX.Y.Z (from vA.B.x)`. -->

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
new Validators.CompareTo<number>((field) => field.parent?.fields.dateFrom, (to, from) => to >= from, '…');
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
accepted; the container sets it. `isEqual` over two elements now answers `true` for any two instances of the same
class, because it has nothing left to read — compare `a.value` with `b.value` instead.

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
`init(params)` hook when all you want is different parameter handling. `clone()` constructs through
`this.constructor`, so a subclass clones into its own class either way.

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

Every form element is a Vue reactive object from construction onwards, so `value` is directly reactive and needs no
computed wrapper.

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

Groups and lists are reactive objects, the same as fields. Three things the UI could not observe before are now
plain reactive reads:

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

> See also: [Getting Started](/guide/getting-started), [Field](/api/field), [Group](/api/group), [List](/api/list)
