# Field

`Field<T>` represents a single typed form value. It is constructed with `new`, like `Action`, `Group` and `List`,
and every read through it — `field.value`, `field.valid`, `field.errors` — is tracked by Vue from that moment on.

New to the library? [The model](/guide/model) describes how the pieces fit together before this page names them
one by one.

## Creating a field

```typescript
import { Field } from '@dynamicforms/vue-forms';

const name = new Field({ value: 'John' });
const age  = new Field<number>({ value: 30 });
```

## `new Field<T>(params?)`

`params` is an `IFieldParams<T, X>`, and omitting it entirely is allowed. It carries the members below, plus the
[extended properties](#extended-properties) the field's second type argument declares.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params.value` | `T` | `undefined` | Initial value. Leaving it out, or passing `undefined`, falls back to `originalValue`; an explicit `null` is kept as the value |
| `params.originalValue` | `T` | same as `value` | Baseline for `isChanged`, and the initial value when no `value` is given |
| `params.enabled` | `boolean` | `true` | Whether the field accepts input and serializes |
| `params.visibility` | `DisplayMode` | `DisplayMode.FULL` | Rendering visibility hint |
| `params.touched` | `boolean` | `false` | Initial interaction flag |
| `params.errors` | `ValidationError[]` | `[]` | Initial validation errors |
| `params.validators` | `FieldActionBase[]` | `[]` | Validator actions; each runs once over the constructed value |
| `params.actions` | `FieldActionBase[]` | `[]` | Additional actions to register |

`validators` and `actions` are registered before the remaining parameters are applied, and registration itself
fires nothing. An action that guards a property the same parameter object sets — an `EnabledChangingAction` next to
`enabled`, a `VisibilityChangingAction` next to `visibility` — is therefore in place for that assignment and can
rewrite or veto it, and the matching `EnabledChangedAction` / `VisibilityChangedAction` is notified of the result.
The single trigger closing the constructor runs every eager action — validators among them — exactly once, over the
finished value.

Those are the only accepted parameters: they are exactly the writable members of a field. Derived members
(`valid`, `validating`, `busy`, `fullValue`, `isChanged`) and the container back-references (`parent`, `fieldName`)
are rejected by the type checker. All seven are getter-only, so assigning any of them throws a `TypeError` — on a field
that belongs to no container as much as on one that does. The container installs `parent` and `fieldName`; there
is no way to write either from outside.

The first generic argument is inferred from `params.value`, so `new Field({ value: 'John' })` is a `Field<string>`
and `new Field()` is a `Field<any>`. Pass it explicitly when the initial value does not pin the type you want:
`new Field<number | null>({ value: null })`. The second one is never inferred — see
[extended properties](#extended-properties).

### `IFieldConstructorParams<T>`

The exported type of the members every form element takes, which `IFieldParams<T, X>` makes partial and adds the
extended properties to:

```typescript
type IFieldConstructorParams<T = any> = {
  value: T;
  originalValue: T;
  enabled: boolean;
  visibility: DisplayMode;
  touched: boolean;
  errors: ValidationError[];
} & IFieldConstructorActionsList;

interface IFieldConstructorActionsList {
  actions?: FieldActionBase[];
  validators?: FieldActionBase[];
}
```

Import it when you build a parameter object separately from the construction site:

```typescript
import { Field, IFieldConstructorParams } from '@dynamicforms/vue-forms';

const defaults: Partial<IFieldConstructorParams<string>> = { value: '', enabled: false };
const field = new Field(defaults);
```

### Extended properties

A field carries whatever properties you declare for it beyond the members above — a label, a hint, a css class, a
permission flag — so that a form whose shape arrives from a server has somewhere to put them and a UI layer has
somewhere to read them from. They are declared as the second type argument and reached through `extra`:

```typescript
interface Presentation {
  label: string;
  hint?: string;
}

const name = new Field<string, Presentation>({ value: 'John', label: 'First name', hint: 'as in your passport' });

name.extra.label;                                 // 'First name'
name.setExtendedValues({ label: 'Given name' });  // hint stays as it was
```

The declaration is what makes them legal: `X` is left out of type inference, so a parameter object naming a
property `X` does not declare is rejected as an excess property. State both arguments to declare properties for a
single field — `new Field<string, Presentation>(…)` — and the parameter object then accepts exactly the members of
`Presentation` alongside the ones every field takes. Where the second argument is left out, `X` is
[`Extras`](#extras).

A parameter naming a member the class itself declares is that member and not an extended property. `enabled` sets
`enabled`, and `valid` still throws a `TypeError`, on a field with extended properties as much as on one without.
`Action` declares `label` and `icon`, so those two reach an action's value; name an action's *other* presentation
properties something else, and see
[Widening the value in a subclass](/api/actions#widening-the-value-in-a-subclass) where a subclass reads `label` or
`icon` in a shape of its own — that is an accessor pair on the subclass, getter and setter together, not an
extended property. `List` declares `length` and `items`, both read-only, so a parameter of either name throws the
same `TypeError` as `valid`. In a subclass of your own, an accessor is such a member and a class field is not: class
fields are defined on the instance after the base constructor has applied the parameters, so a parameter named
after one becomes an extended property while the field keeps its initializer. Declare the member as an accessor
where a parameter of its name should reach it.

`validators` and `actions` state what to register on the element rather than what it carries, so neither becomes
an extended property — in a constructor or in a `bind()` override.

`extra` is read-only and the object it hands out is frozen: `setExtendedValues(values)` is the write path, and it
merges — a call naming one property leaves the others standing. The read is tracked like every other read through
an element, so a template rendering `field.extra.label` re-renders when the property is written, and a write inside
a `transaction()` that rolls back is put back with everything else.

Its type is `Readonly<Partial<X>>`, so a property reads as possibly `undefined` whatever `X` declares: a parameter
object carries as few of them as it likes, `setExtendedValues()` writes as few as it likes, and a property is there
once something has put it there.

```typescript
const bare = new Field<string, Presentation>({ value: 'John' }); // legal: every extended property is optional
bare.extra.label; // string | undefined
```

`Group`, `List` and `Action` take the same argument in the same position: `Group<Fields, X>`, `List<Fields, X>`,
`Action<Value, X>`.

### `Extras`

`X` defaults to `Extras`, an empty interface exported for augmentation. The layer that renders the forms declares
what it renders them with once, and every element in the application carries those properties — with no type
argument at any construction site:

```typescript
// in the UI layer
declare module '@dynamicforms/vue-forms' {
  interface Extras {
    label?: string;
    hint?: string;
    cssClass?: string;
  }
}

// in the application
const form = new Group({
  name: new Field({ value: '', label: 'First name' }),
  age: new Field({ value: 0, cssClass: 'w-25' }),
});

form.fields.name.extra.label; // string | undefined
```

The members of a `Group` declaration are what the default reaches that a type argument cannot: they are written
inline and carry the properties without being annotated one by one.

The interface is one per application. Two packages that declare a property of the same name have to give it the
same type, because declaration merging rejects a second declaration that differs — a library that augments
`Extras` therefore states in its own documentation what it puts there.

An element that states an `X` of its own **replaces** the default rather than adding to it. `Extras & Local` is
how it carries both:

```typescript
new Field<string, Extras & { badge: string }>({ value: 'a', label: 'Name', badge: 'new' });
```

`Action` is the one element whose default differs: it is `Extras` without the keys of
[`ActionValue`](/api/actions#the-action-class), because `label` and `icon` are members an action declares itself and a
parameter of either name reaches its value. An augmented `label` is therefore `action.label` and never
`action.extra.label`.

Because the default applies to `FieldBase<T>` as well, a validator or an action handler — both of which receive
their element as `FieldBase<T>` — reads the augmented properties without a cast.

### `IFieldParams<T, X>`

The exported type of the parameter object itself, taken by `new Field`, `new Action`, `new Group` and `new List`:

```typescript
type IFieldParams<T = any, X extends object = Extras> = Partial<IFieldConstructorParams<T>> & Partial<NoInfer<X>>;
```

The two halves are made partial separately rather than as `Partial<IFieldConstructorParams<T> & X>`, because `T`
is inferred through this type: inference through a mapped type over an intersection answers with one constituent
of a union rather than the union, and `new Field({ value: stringOrNumber })` would be a `Field<string>`.

### `IBindParams<T, X>`

The exported type of the second argument of `bind()`: the three members a binding takes over from the element it
was bound from, plus the extended properties.

```typescript
type IBindParams<T = any, X extends object = Extras> = Partial<
  Pick<IFieldConstructorParams<T>, 'originalValue' | 'enabled' | 'visibility'>
> &
  Partial<NoInfer<X>>;
```

`value` is what the first argument states. What else a constructor takes is left out because a binding cannot
honour it: `validators` and `actions` are carried from the declaration rather than supplied, and `touched` and
`errors` are what the binding establishes for itself as it validates. Naming any of them is a compile error.

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| `value` | `T` | yes | Current value. The setter is a no-op on a disabled field, and what a write settles on is [what is registered on the field](#writing-the-value). Values are compared by identity, so `ValueChangedAction` fires for a new object even when it is deeply equal to the old one, and not at all for the very object the field already holds — mutate a copy and assign it, rather than mutating in place. `isChanged` is separate and uses deep equality. |
| `originalValue` | `T` | yes | Value as provided at creation. Writable — assigning it rebaselines `isChanged` |
| `isChanged` | `boolean` | no | `true` when `value` differs from `originalValue` (deep equality) |
| `enabled` | `boolean` | yes | When `false`, the field ignores value changes and is excluded from `Group.value`. Writing what the element already holds is not a change: no `EnabledChangingAction` runs, nothing is enrolled in an open transaction, and no `EnabledChangedAction` fires |
| `effectiveEnabled` | `boolean` | no | `true` where this element and every container above it are enabled. A rendering layer binds this instead of walking the parent chain. It is a read: `enabled` on each element stays what was written to it, a write to a member of a disabled container is accepted as always, and what a container serializes is decided by the members' own `enabled` |
| `visibility` | `DisplayMode` | yes | Rendering visibility hint — does not affect serialization. Writing the mode the element already holds is not a change, the same way it is not for `enabled`. A write that is no [`DisplayMode`](/api/actions#displaymode) — a number that is none of the constants, or a string that names none — throws `Error('visibility must be a DisplayMode constant')`; a constant's name is accepted, case insensitive |
| `valid` | `boolean` | no | `true` when `errors` is empty. It is read over the live array, so it follows an error pushed in by hand without any call — what waits for `validate()` is the `ValidChangedAction` announcing the transition |
| `validating` | `boolean` | no | `true` while an asynchronous validation is in flight on this element **or on anything below it**, so a form answers for the whole tree it holds. An element counts its own runs — the library maintains that count through `beginValidating()` / `endValidating()`, which validators call around a returned promise — and a container keeps a tally of how many of its children answer `true` beside it, so the read costs nothing whatever the tree holds and a run that starts or settles costs the nesting depth |
| `busy` | `boolean` | no | `true` while an `Action.execute()` at or below the element has yet to settle. An `Action` answers for its own runs, a `Group` or `List` for the actions below it, and anything else answers `false` — an element that is not an action has nothing to execute. It states an execution and `validating` states a validation, so a submit gate reads both, or awaits [`settled()`](#settled-promise-void) instead |
| `validationEpoch` | `number` | no | Generation counter of the validators the field reads, raised by `clearValidators()` and by `unregisterAction()` on a validator. A `Validator` reads it to tell whether a result it is about to apply still belongs to the validators the field carries now |
| `errors` | `ValidationError[]` | yes | Current validation errors. Writable, and the array handed out is the one the element holds, so pushing into it works. `valid` follows immediately, on this field and on the containers above it; announcing the transition does not — call `validate()` for `ValidChangedAction` to fire. The array is reactive, so an error read back from it is a Vue proxy of the instance that produced it: `field.errors[0] === myError` is `false` for the very error a validator returned. Compare by content, or use `toRaw()` |
| `touched` | `boolean` | yes | Interaction flag. Nothing in the library sets it in response to input — your UI must assign `field.touched = true` (e.g. on blur). `Group`/`List` aggregate it from their children and propagate an assignment down |
| `parent` | `Group \| undefined` on a `Field` or an `Action`, `Group \| List \| undefined` on a `Group`, a `List` and `FieldBase` | no | Container the element belongs to, installed by that container and taken away again when the container releases the element — a `List` row dropped by `remove()`, `pop()`, `clear()` or a shortening `value` assignment has no `parent` and may be handed to another list. A container refuses an element that still carries one, so hand on the released instance or a `bind()` of it. A `List` holds rows and a row is a `Group`, so a field's container is a `Group` wherever there is one and the sibling lookup `field.parent?.fields.other` is typed on a field; an element that can itself be a row answers with either container, and reaching for `fields` through it is a compile error. Where you hold the element as a `FieldBase` — the type every action executor and `ValidationFunction` receives — narrow it: `(field.parent as Group)?.fields.other`, or name the sibling and let [`CompareTo`](/api/validators#compareto) resolve it. The read is tracked, so a template rendering off `field.parent` follows the element from one container to the next |
| `fieldName` | `string \| undefined` | no | Key name within the parent `Group` |
| `declaration` | `FieldBase` | no | The element this one was declared as: itself for an element built from parameters, and the element `bind()` was called on for a binding — transitively, so a binding of a binding answers with the same element. Every row a `List` builds from an item template is a binding of it, so `list.get(0).fields.a.declaration === template.fields.a`. It is what lets an action shared by every row tell one row's field from another's |
| `fullValue` | `T` | no | Identical to `value` on a plain `Field`. On a `Group` and a `List` it states what the element holds rather than what it serializes — see [`Group`](/api/group#properties) and [`List`](/api/list#properties) |
| `extra` | `Readonly<Partial<X>>` | no | The [extended properties](#extended-properties) the field carries, `{}` where none were declared. The object is frozen; write through `setExtendedValues()` |

## Writing the value

A write to `value` states what the caller wants the field to hold; what the field ends up holding is settled by
what is registered on it. A `ValueChangedAction` may write another value back — a rule that trims, rounds or caps —
a disabled field drops the write before it reaches the value slot, and a handler that throws unwinds the whole
write and rethrows, leaving the field holding what it held before. The write is observed rather than gated: there
is no `ValueChangingAction`, so nothing stands between a value and the slot the way an `EnabledChangingAction` or a
`VisibilityChangingAction` stands in front of those two members. Inside an open `transaction()` the handlers run at
the commit, so what the field settles on is settled once the outermost `transaction()` call returns.

Read the field back to learn what it took:

```typescript
field.value = typed;
if (field.value !== typed) {
  // the field settled on something other than what was written
}
```

### What a rendering layer sees

Where the field ends up holding something other than what was written, every read of it moves: a `computed` over
`field.value` answers the new value, an effect that reads it re-runs, and a control rendering from either repaints
on its own.

Where the field ends up holding the value it started with, nothing moves. A disabled field's setter reaches no slot
at all; a rule that puts back the five characters a six-character write exceeded, and a handler that throws, both
leave the slot holding what it held before. Either way a `computed` over `field.value` answers what it answered
last, so nothing rendering through one re-runs; an effect reading the field directly re-runs where the slot was
written and put back, and reads the same value both times.

The control, meanwhile, already carries what was typed: a native input holds the text in its own DOM before the
event that carries it to the field is dispatched at all. Nothing repaints it, so it goes on showing a value the
field does not hold and stays out of step with it until some unrelated change repaints it — the field refused the
sixth character and the user sees all six.

**A binding layer has to close that gap itself.** The read the control renders from has to move even where the
field did not, which means answering the written value for one tick and the field's value from the next one:

```typescript
import { computed, nextTick, shallowRef } from 'vue';

// inside a composable holding the element as field: FieldBase<T>
const pending = shallowRef<{ value: T } | null>(null);

const model = computed<T>({
  get: () => (pending.value ? pending.value.value : field.value),
  set: (newValue: T) => {
    try {
      field.value = newValue;
    } finally {
      if (field.value !== newValue) {
        pending.value = { value: newValue };
        nextTick(() => {
          pending.value = null;
        });
      }
    }
  },
});
```

Wherever the field settles on something other than what was written — another value, or the value it already held —
the read answers the written value for the rest of that tick and the field's value from the next one. The control
is repainted from that second move, so it ends up showing what the field holds whether or not the field moved. The
`finally` is what covers the handler that threw: the throw goes on to the caller and the read is corrected all the
same. `@dynamicforms/vuetify-inputs` does this in
[`useInputBase()`](https://github.com/dynamicforms/vuetify-inputs/blob/main/src/helpers/input-base.ts), which every
input in that library binds through.

### Disabling a section

`enabled` on a `Group` or a `List` states that the container is disabled and nothing further: the members keep the
`enabled` they were given, go on accepting writes, and go on serializing. What a rendering layer binds to draw a
whole section disabled is `effectiveEnabled`, which is `true` where the element and every container above it are
enabled:

```vue
<df-input :disabled="!field.effectiveEnabled" :control="field" />
```

The read is tracked like every other read through an element, so switching a group re-renders the inputs of every
member below it without anything walking the tree.

`effectiveEnabled` is the only member with a reading of this kind, and it is not a scheme the others follow.
`visibility` has none: `SUPPRESS` states that an element is absent from the value as well, so folding it down the
tree would decide serialization rather than report it. `value` has none: a container composes its own from its
members rather than passing one down. Anything else a rendering layer needs folded down its own tree is what
`provide` and `inject` are for — a section is a component wrapping its members, and the render tree's context
belongs to the render tree.

## Methods

### `registerAction(action): this`

Registers an action (validator or event handler). Returns `this` for chaining.

```typescript
field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('changed to', newValue);
  return supr(field, newValue, oldValue);
}));
```

An action instance registered on an element is carried by every binding of that element, so **an action registered on
a `List`'s item template fires for every row**. The first argument the executor receives is the element it fired
for, which is how a handler that cares about one row tells them apart:

```typescript
template.fields.amount.registerAction(new ValueChangedAction((field, supr, newValue) => {
  if (field.parent === list.get(0)) console.log('the first row changed to', newValue);
  return supr(field, newValue);
}));
```

Anything an action remembers between runs belongs to the element it ran over rather than to the action — see
[Writing custom actions](/api/actions#custom-actions).

The newest registration is the outermost handler: it runs first and reaches the ones registered before it through
`supr`. Registered inside a [transaction](/api/transactions), a registration is undone if the transaction unwinds.

### `registerActionBefore(action, before): this`

Registers `action` so that `before` wraps it: `before` runs first and reaches `action` through the `supr` it is
handed, instead of ending the run there. It is how an action is added to a chain someone else built and still sits
*inside* a handler already registered, which registration order alone cannot arrange. Returns `this`.

```typescript
// the audit handler already registered wraps this one, so it sees the value the trimming leaves behind
field.registerActionBefore(
  new ValueChangedAction((f, supr, newValue, oldValue) => supr(f, newValue.trim(), oldValue)),
  audit,
);
```

`before` has to be registered on this element and under the same `classIdentifier` as `action`; anything else
throws `Error('Action to register before is not registered under the same identifier')`.

### `unregisterAction(action): boolean`

Drops `action` from this element and answers whether the element held it. The instance goes on serving every other
element it was registered on — one `Required` registered on a `List`'s item template is carried by every row, and
unregistering it from one row leaves the others validating.

```typescript
const required = new Validators.Required();
const field = new Field({ value: '', validators: [required] });
field.valid;                      // false
field.unregisterAction(required); // true
field.valid;                      // true — the error the validator put there is withdrawn with it
```

A `Validator` withdraws the errors it put on the element as it goes, so the verdict left standing is the one the
validators the element still holds reach; errors from another source stay. Any other action releases what it
installed for this element through `unregisterFrom()`. A validation still in flight is cancelled and its verdict
dropped. Called inside a [transaction](/api/transactions), the unregistration is undone if the transaction unwinds,
and so is the cancellation: the run goes on and the verdict it reaches counts, so the field is never left reporting
itself valid over a value nothing checked.

### `bindingsOf(declaration): FieldBase[]`

Every element in this element's subtree, this element included, whose `declaration` is the one given. It answers
which rows a declared element stands for: `list.bindingsOf(template.fields.a)` is the `a` field of every row.

### `markRecordIncomplete(): void`

States that an eager action running over this element looked for a second element of the record and did not find
it, because the record was not assembled yet — a `List` row's members are bound before any of them holds the row.
The container that completes the record runs this element's eager actions again, and a container that takes the
record in afterwards does the same. Only an action implementation calls it; see
[Reading a second element of the record](/api/actions#reading-a-second-element-of-the-record).

### `triggerAction(actionClass, ...params): any`

Manually fires a specific action class on this field. `actionClass` is the class itself, not an instance — it is
looked up by its static `classIdentifier`, so abstract classes work too. Returns what the chain returns, `null`
when no action of that type is registered, and the [`AbortEventHandlingException`](/api/actions#aborteventhandlingexception)
itself where a handler threw one to end the run.

### `validate(revalidate?): void`

Announces the verdict the element's `errors` support. Pass `revalidate: true` to re-run every eager action —
the validators among them — over the value the element holds first. When the verdict differs from the one last
announced it fires `ValidChangedAction` and reports the change to the parent container, so a field turning invalid
on its own is reflected in the `Group` or `List` holding it. Called inside a [transaction](/api/transactions), it
settles with everything else the transaction did and announces at the end of it.

### `clearValidators(): void`

Removes the validators registered on this element, empties `errors` and recalculates `valid`. Every error goes,
including ones no validator contributed — errors pushed in from the outside, such as server-side ones. The verdict
goes through the same path as any other: a field that was invalid fires `ValidChangedAction` and its container
re-evaluates its own validity. A validation still in flight is cancelled, so it cannot push an error onto a field
that no longer carries the validator that produced it. A validator that installed a listener elsewhere —
`CompareTo`, on the field it compares against — has that listener released with the registration, and an operation
that unwinds puts both back, the cancelled run included: it goes on and the verdict it reaches counts.

Validators belong to the element's **declaration**, so the call names that: clearing the validators of one row of a
`List` clears the rule for every row, because the rule was the item template's. The `errors` of every element that
carried it are emptied with it. `unregisterAction()` drops a single validator instead of all of them, and withdraws
the errors that validator contributed, wherever it put them.

It does not descend into members. A `Group` or a `List` composes `valid` from its members as well, so
`group.clearValidators()` leaves `group.valid` at `false` while any member is still invalid — call
`clearValidators()` on the members whose validators you also want gone.

### `settled(): Promise<void>`

Resolves once nothing at or below the element is running — no asynchronous validation, no `Action.execute()` that
has yet to settle. It resolves immediately where nothing is running to begin with, so a submit path awaits it
instead of polling `validating` and `busy`.

```typescript
await form.settled();
if (!form.valid) return;
await form.fields.submit.execute();
```

It answers for the moment it resolves and promises nothing about the one after: work started later leaves the
element running again. A caller that has to act on a settled tree reads what it needs immediately after awaiting.

### `beginValidating(): void` / `endValidating(): void`

Raise and lower the async-validation counter that backs `validating`. `Validator` calls them around a validation
function that returns a promise; call them yourself only if you run asynchronous validation outside a `Validator`.
A call that moves the element between running and idle moves the tally the container above it keeps, so every
container up the tree follows. An `endValidating()` the element has no run for is a no-op: the counter never goes
below zero, and nothing above is told of a stop that never started.

Both counters are the state a rolled-back [transaction](/api/transactions) leaves alone — a run in flight cannot be
un-started, and putting the counts back would leave them out of step with the `endValidating()` calls still to
come.

### `setExtendedValues(values): void`

Writes [extended properties](#extended-properties). `values` is a `Partial<X>` and is merged over the ones the
field carries, so a call naming one property leaves the rest standing and none of them is ever taken away. The merged set replaces the frozen object
`extra` hands out, which is what makes the write reactive and what lets a rolled-back transaction put the previous
set back.

```typescript
field.setExtendedValues({ label: 'Given name' });
```

### `bind(data?, overrides?): this`

Returns a new reactive field over `data`, with the same registered actions and the same extended properties. It is
how a declared field is put to work over a record, and the field it is called on is what the new one answers
`declaration` with.

`data` of `undefined` is no data supplied and the new field carries the current value; an explicit `null` is data
and clears, so `bind(null)` gives a field holding `null`. `overrides` is an [`IBindParams<T, X>`](#ibindparams-t-x):
`originalValue`, `enabled`, `visibility` and the extended properties, and nothing else — anything a binding could
not honour is refused by the type rather than accepted and dropped. Extended properties it names are written over
the ones carried over from the field bound, and they are in place before the new field's eager actions run.
`originalValue` is read by key presence.

The new field is constructed through `this.constructor`, so a subclass of `Field` binds into its own class. It is
detached: it has no `parent` and no `fieldName`. `originalValue` is only carried over when you pass it explicitly
in `overrides` — otherwise it becomes the data bound, so `isChanged` starts out `false`.

```typescript
const row = template.bind({ name: 'John' });   // a group over one record
const copy = field.bind(field.value);          // another field holding what this one holds
```

### `rebind(data): this`

Exchanges the data the field holds for `data`, in place. The element is the same instance afterwards — its
identity, its actions, its extended properties and its place in whatever container holds it all stand — and it ends
up in the state `bind(data)` would have produced: the values are written, `originalValue` is baselined to them so
`isChanged` starts out `false`, `touched` goes back to `false` and the validators run over the new data. It is what
recycles one element across records, which is what a virtualised renderer does with the rows it keeps.

The element makes no statement of its own about the exchange: no `ValueChangedAction` fires for it, the way none
fires for an element that was just built. Its members do announce theirs — the fields of a rebound row report the
values they took on — and a verdict that moves is announced as always, so a rebound row that is invalid says so to
the list holding it.

A disabled `Field` refuses a value written to it, here as anywhere: it keeps what it holds and only its change
history starts over. A disabled `Group` or `List` writes through to its members, the same way an assignment to it
does.

Inside an open `transaction()`, a change the element is already owed an announcement for stands: the exchange does
not erase it, and what the commit announces is the pair measured from where the element stood when the transaction
opened.

On a `Group` the record need not name every member: a key it leaves out is taken from the element's `declaration`,
so a recycled row ends up as a fresh binding of the item template would, rather than as the record before it left
it.

```typescript
const row = list.get(0)!;
row.rebind({ name: 'Jane', age: 25 });   // same instance, next record
```

## Subclassing

`new` constructs a subclass of `Field`, `Action`, `Group` or `List`, and `bind()` constructs through
`this.constructor`, so a subclass binds into its own class. Two protected hooks shape a construction.

`init(params)`, on `Field` and `Action`, applies the constructor parameters; `Group` and `List` apply theirs in
their constructors. Override it where the subclass takes parameters of a shape of its own, and read nothing but
the parameters in it: it runs from the base constructor, so a member the subclass declares as a class field is
still `undefined` while it runs and anything it assigns to one is overwritten when the initializer runs.

`constructed(params)` is the last step of a construction, and all four classes call it — inside the transaction
the construction is, with the parameters applied and the value in place, before the element records what it was
built as. Override it to complete what the element was built with: a value member the caller need not state, a
baseline of its own, a member a container fills in. What it writes is part of the construction rather than a
change of it:

- no `ValueChangedAction` fires for the element;
- `isChanged` starts `false`, because a construction the parameters gave no `originalValue` is baselined on the
  value the hook leaves;
- a write to `_value` reaches the value slot of an element built `enabled: false`, which the `value` setter
  refuses;
- the eager actions and the validators run once, over the completed value.

```typescript
class Money extends Field<{ amount: number; currency?: string }> {
  protected constructed() {
    // the currency a caller need not state
    if (this._value?.currency === undefined) this._value = { ...this._value, currency: 'EUR' };
  }
}

const price = new Money({ value: { amount: 12 }, enabled: false });
price.value;      // { amount: 12, currency: 'EUR' }
price.isChanged;  // false
```

A container completes itself through its members, and a member carries a construction of its own: the write
reaches it the way any later write would, so the member announces its `ValueChangedAction` and reports itself
changed, while the container is baselined on the record the hook leaves. Baseline the member as well where it is
to start unchanged:

```typescript
class Address extends Group<{ street: Field<string>; country: Field<string> }> {
  protected constructed() {
    const country = this.fields.country;
    if (!country.value) {
      country.value = 'SI';
      country.originalValue = country.value;
    }
  }
}

const address = new Address({ street: new Field<string>({ value: 'Main 1' }), country: new Field<string>() });
address.value;                    // { street: 'Main 1', country: 'SI' }
address.isChanged;                // false
address.fields.country.isChanged; // false
```

## `NullableField<T>`

Type alias for `Field<T> | null`.

## `FieldBase<T>`

The exported abstract base of `Field`, `Action`, `Group` and `List`, and the type to use wherever you accept "any
form element": every library signature that takes a field — action executors, `ValidationFunction`,
`Group`'s `fields` map, `CompareTo`'s `otherField` — is typed `FieldBase`.

`T` is the type of `value`, and each subclass passes its own through: `Field<T>` and `Action<T>` extend
`FieldBase<T>`, `Group<T>` extends `FieldBase<GroupValue<T>>`, and `List<T>` extends `FieldBase<ListValue>`. `X`
is the second argument every one of them takes, the [extended properties](#extended-properties) the element
carries; it defaults to [`Extras`](#extras), which is what makes `FieldBase` on its own the type of any form
element, and what lets a validator or an action handler read the augmented properties off the element it receives.

It provides `originalValue`, `enabled`, `effectiveEnabled`, `visibility`, `valid`, `errors`, `validating`, `busy`,
`validationEpoch`, `isChanged`, `fullValue`, `parent`, `fieldName`, `extra`, `registerAction()`, `registerActionBefore()`,
`unregisterAction()`, `triggerAction()`, `validate()`, `clearValidators()`, `setExtendedValues()`, `rebind()`,
`beginValidating()` and `endValidating()` — which is why those work the same way on every form
element. `value`, `touched` and `bind()` are abstract and supplied by each subclass.

It holds every mutable member of an element in a reactive state object beside it, which is what makes every form
element reactive without a wrapper: reading `field.value` in a template or a `computed` subscribes to that one
slot, and assigning it re-renders whatever read it. The element itself is not a proxy, so `toRaw(field)` is
`field` — and `watch(field, cb)` with a bare element as the source never fires. Watch what you read:
`watch(() => field.value, cb)`.

A structural comparison of two elements answers identity: `isEqual(fieldA, fieldB)` reads nothing either element
holds — the state is in private class fields — so it would answer `true` for any two instances of the same class.
`FieldBase` carries a `Symbol.toStringTag` accessor naming the element's class, which is the first thing such a
comparison reads and a tag it does not know ends it there. Two elements are therefore equal only where they are
the same element, and what they hold is compared as `isEqual(a.value, b.value)`. The accessor sits on the
prototype, so an element carries nothing for it, and `Object.prototype.toString.call(field)` answers
`[object Field]`.

`instanceof FieldBase` is both the recommended type guard and the runtime check the library itself performs:
`new Group({...})` rejects a member that is not a `FieldBase` with `Error('Invalid fields object provided')`.

```typescript
import { FieldBase } from '@dynamicforms/vue-forms';

function isDirty(field: FieldBase): boolean {
  return field.isChanged;
}
```

---

> See also: [Basic Form example](/examples/basic-form), [Validators example](/examples/validators)
