# Migration from 0.5.x

This page covers the breaking changes between `@dynamicforms/vue-forms` 0.5.x and the current release, with the
before/after for each one. It is the only page that names the old API; everywhere else in this documentation only
the current one exists.

Most projects need three mechanical edits — `.create(` → `new `, dropping `reactiveValue`, and renaming `IField` /
`IFieldAction` in type positions. There is a [checklist](#upgrade-checklist) at the bottom.

## Fields are constructed with `new`

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

## `reactiveValue` is gone — read `.value`

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

## `IField` and `IFieldAction` are gone

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

## Constructor parameters accept only writable members

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

## `validating` is typed `boolean` and is read-only

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

## Value types resolve instead of collapsing to `any`

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

## What newly works

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

## Upgrade checklist

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
