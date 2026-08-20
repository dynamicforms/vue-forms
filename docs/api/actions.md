# Actions

Actions are event handlers attached to fields, groups, or lists via `registerAction()`. They form a chain: each handler receives a `supr` function to call the next handler in the chain.

The chain runs in reverse registration order: the action registered last executes first, and its `supr` calls the previously registered action of the same type. If that outermost handler does not call `supr`, none of the remaining handlers run.

```typescript
import { ValueChangedAction } from '@dynamicforms/vue-forms';

field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log(newValue);
  return supr(field, newValue, oldValue); // call the rest of the chain
}));
```

::: tip Calling supr
Always call `supr(field, newValue, oldValue)` unless you deliberately want to stop the action chain. Validators are also actions and sit in the same chain.
:::

## A handler is synchronous

A handler runs inside the write that triggered it — `field.value = x` returns once the chain has run — so a
handler that returns a promise hands back something nobody waits for. The chain passes it along and the setter
discards it. Two things follow, and neither is reported as an error by the library:

- **A rejection is unhandled.** It surfaces the way any unhandled rejection does, through the runtime rather than
  through the form: the browser console, or Node's `unhandledRejection`. The element carries no error and no
  handler downstream is told.
- **Everything after the first `await` runs outside the transaction.** The write has committed by then, so a
  rollback cannot take that work back, and a value the continuation writes opens a transaction of its own.

```typescript
// the rejection is lost to the form: the setter returned before the fetch resolved
field.registerAction(new ValueChangedAction(async (f, supr, newValue, oldValue) => {
  await fetch('/api/log', { method: 'POST', body: newValue });
  return supr(f, newValue, oldValue);
}));

// state the intent instead: the handler stays synchronous and owns what it starts
field.registerAction(new ValueChangedAction((f, supr, newValue, oldValue) => {
  fetch('/api/log', { method: 'POST', body: newValue }).catch(reportToUser);
  return supr(f, newValue, oldValue);
}));
```

Where the work has to be part of the form's state, the library offers two paths that do wait for it:
[an asynchronous `ValidationFunction`](/api/validators#asynchronous-validation), which holds `validating` while it
runs and reports a rejection as an error on the field, and [`Action.execute()`](#executeaction), which
holds `busy` and answers with a promise the caller awaits.

`supr` has the exported type `FieldActionExecute<T>`:

```typescript
type FieldActionExecute<T = any> = (field: FieldBase<T>, ...params: any[]) => any;
```

At the end of every chain sits a handler that returns `null`, so `supr` is always a function.

### One action, many elements

An action instance is registered on an element, and every binding of that element carries the same instance — so an
action registered on a `List`'s item template fires for **every row of the list**. The element the executor
receives as its first argument is the one it fired for, and it is what a handler that cares about a single row
checks. The same holds for validators, which are actions: one `Required` instance validates every row's field.

Actions belong to the **declaration**, and a binding reads the declaration's. A row of a list is a binding of the
item template, so registering on a row registers on the template and the rule applies to every row — the ones that
already exist as much as the ones added later, and whichever element the call named:

```typescript
list.push({ amount: 1 });
// registered on a row that already exists, and every row is driven by it, this one included
list.get(0).fields.amount.registerAction(new Validators.Required());
```

`unregisterAction()` and `clearValidators()` read the same way: they name the declaration, so they reach every row.
What stays per row is the **data** — the value, the errors the rule produces there, the verdict.

A handler that means to answer for one row checks the element it was handed, and one that does not care answers for
all of them:

```typescript
template.fields.amount.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  if (field.parent === list.get(0)) console.log('the first row changed');
  return supr(field, newValue, oldValue);
}));
```

A handler that does not call `supr` ends the run for **every** handler registered before it, on that declaration
and therefore on every row — the handlers of one declaration stand in one chain.

An action that has to remember something between runs keeps it against the element it ran over, not on itself —
see [Writing custom actions](#custom-actions). Anything it keeps on itself is shared by every row.

### `AbortEventHandlingException`

Throwing `AbortEventHandlingException` from a handler ends the run it is in. It never escapes the setter: the
trigger catches it and **answers with it**, so a caller tells a run a handler ended from one that reached no
handler at all. All other exceptions propagate to the caller.

```typescript
import { AbortEventHandlingException, ValueChangedAction } from '@dynamicforms/vue-forms';

field.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  if (newValue == null) throw new AbortEventHandlingException('no value to report');
  return supr(field, newValue, oldValue);
}));

const answer = field.triggerAction(ExecuteAction, params);
if (answer instanceof AbortEventHandlingException) {
  // a handler ended the run, and said why
  console.log(answer.message);
}
```

| what happened | the trigger answers |
|---|---|
| a handler threw `AbortEventHandlingException` | that exception |
| a handler returned `null`, or none is registered | `null` |

**In a `*Changing*` handler it refuses the write.** `EnabledChangingAction` and `VisibilityChangingAction` are
asked before the value is written, so ending the run there means the setter writes nothing and announces nothing —
no `*Changed*` event, no enrolment in an open transaction. Returning the old value refuses the write just as well;
the exception is the form that also says why, and that stops the handlers registered before it from running.

```typescript
field.registerAction(new VisibilityChangingAction((f, supr, newValue, oldValue) => {
  if (newValue === DisplayMode.SUPPRESS) throw new AbortEventHandlingException('this field is never suppressed');
  return supr(f, newValue, oldValue);
}));
```

**In a `*Changed*` handler it does not.** `ValueChangedAction` and its kind fire *after* the value is written, so
ending the run stops the handlers below it and nothing else — the change stands. To undo the change as well, throw
an ordinary error: a throw out of a handler rolls the whole [transaction](/api/transactions) back and rethrows.

## Value events

### `ValueChangedAction`

Fires when `field.value` changes (after the new value is set). Also fires on `Group` and `List` when any descendant changes.

It fires when the [transaction](/api/transactions) carrying the change commits, over the value the element ends
that transaction holding: `oldValue` is what the element last announced, so a value that goes `A → B → A` within
one transaction announces nothing at all. An operation you open no transaction around is a transaction of its own,
so a single write announces exactly one change, as it always has.

```typescript
new ValueChangedAction((field, supr, newValue, oldValue) => {
  // handle the change
  return supr(field, newValue, oldValue);
})
```

| Callback param | Type | Description |
|----------------|------|-------------|
| `field` | `FieldBase` | The field that changed |
| `supr` | function | Next handler in the chain |
| `newValue` | `T` | The new value |
| `oldValue` | `T` | The previous value |

On a `Group` or a `List` the two values are the container's own serialized value after and before the change, so
the very first change of a member reports the value the container was constructed with as `oldValue`.

---

## Enabled events

### `EnabledChangingAction`

Fires **before** `field.enabled` changes. The return value becomes the new value of `enabled` — return `true` to prevent disabling, or `false` to prevent enabling.

```typescript
new EnabledChangingAction((field, supr, newValue, oldValue) => {
  // return true to prevent disabling, false to prevent enabling
  return supr(field, newValue, oldValue);
})
```

If the action returns `null` or `undefined`, `newValue` is used instead. The default end of the chain returns `null`, so plainly returning `supr(...)` means "no change to `newValue`". If the resulting value is not a boolean, the setter throws `Error('Enabled value must be boolean')`.

The setter asks it only where the write is a change. Assigning the value the element already holds runs no handler and fires no event, so a handler that answers with a value of its own is never reached by such a write — `field.enabled = field.enabled` leaves the element exactly as it stands. The same holds for `VisibilityChangingAction`.

### `EnabledChangedAction`

Fires **after** `field.enabled` has been updated.

```typescript
new EnabledChangedAction((field, supr, newValue, oldValue) => {
  console.log('enabled is now', newValue);
  return supr(field, newValue, oldValue);
})
```

---

## Visibility events

### `VisibilityChangingAction`

Fires **before** `field.visibility` changes. Return value replaces `newValue`.

```typescript
new VisibilityChangingAction((field, supr, newValue, oldValue) => {
  return supr(field, newValue, oldValue);
})
```

If the action returns `null` or `undefined`, `newValue` is used instead. A result the setter cannot read as a `DisplayMode` makes it throw `Error('visibility must be a DisplayMode constant')` and leaves `field.visibility` as it was: a number that is none of the constants, and a string that names none of them, are refused alike. A constant's name is accepted, case insensitive — `'hidden'` and `'HIDDEN'` both set `DisplayMode.HIDDEN`.

### `VisibilityChangedAction`

Fires **after** `field.visibility` has been updated.

---

## Validation events

### `ValidChangedAction`

Fires when `field.valid` transitions between `true` and `false`.

```typescript
new ValidChangedAction((field, supr, newValue, oldValue) => {
  console.log('validity changed to', newValue);
  return supr(field, newValue, oldValue);
})
```

A `Group` and a `List` compose their validity from their members, so the action fires on the container whenever a
member's verdict flips it — including when no value changed, as with an asynchronous validator settling or a
`clearValidators()` that leaves a previously invalid member valid. Writing to `member.errors` from the outside
moves `valid` on the member and on every container above it at once, but announces nothing: the member's
`validate()` is what announces the transition and makes the container announce its own. The notification climbs no
further than the first ancestor whose own validity stays the same.

Verdicts are announced when the [transaction](/api/transactions) carrying the change commits, and after the value
changes of that same transaction: the deepest element first, so a container is heard from only once the member
that caused the change has spoken. One assignment to a container's `value` therefore produces at most one
notification on that container — the members are written first and the container evaluates afterwards, so it
announces the net transition and never the verdict of a half-applied value. The same holds for an assignment to a
single member, and for `validate(true)` on a container, which revalidates the members first and forms its own
verdict once over the finished set.

---

## Manual trigger

### `ExecuteAction`

A generic action that does not fire automatically. Trigger it explicitly via `field.triggerAction(ExecuteAction, payload)`.

```typescript
import { ExecuteAction } from '@dynamicforms/vue-forms';

field.registerAction(new ExecuteAction((field, supr, params) => {
  console.log('manually triggered with', params);
  return supr(field, params);
}));

field.triggerAction(ExecuteAction, { reason: 'submit' });
```

`triggerAction()` returns whatever the chain returns, or `null` when no action of that type is registered on the field. `Action.execute(params)` on the `Action` class triggers the same action and answers the same value, wrapped in a promise.

### The `Action` class

`Action` is a `Field` whose value is an `ActionValue` (`{ label?, icon? }`) — it represents a button or menu entry that runs an `ExecuteAction` chain.

::: tip Action is the one part of this library that is not UI-agnostic, deliberately
Everything else here describes data and behaviour and says nothing about rendering. `Action` names a label and an
icon because it exists as a *concept* — the element a form's submit, cancel and delete hang on — and that minimal
pair is what makes the concept legible; without it, `Action` would be indistinguishable from `Field`.

The shape is minimal because **a UI library is expected to extend it**. `Action<T extends ActionValue>` takes a
wider value type, so a subclass adds accessors reading `this.value.X` for the members it added and keeps everything
the base class does. `label` and `icon` are accessors the base class declares, and a subclass reading either in a
shape of its own narrows the getter and declares the setter beside it —
[Widening the value in a subclass](#widening-the-value-in-a-subclass) has both rules.
`@dynamicforms/vuetify-inputs` widens the value with render options and per-breakpoint variants and adds
`renderAs`, `showLabel`, `showIcon`, confirmation defaults and passthrough attributes on top; its
[df-actions page](https://docs.velis.si/dynamicforms/vuetify-inputs/examples/df-actions.html) shows what that
renders as. `busy` is form state on the same principle: the library counts the runs, and what that renders as
stays yours.
:::

```typescript
import { Action, ExecuteAction } from '@dynamicforms/vue-forms';

const save = new Action({ value: { label: 'Save', icon: 'save' } });

save.registerAction(new ExecuteAction(async (field, supr, params) => {
  await submitForm(params);
  return supr(field, params);
}));

await save.execute({ reason: 'toolbar' }); // save.busy is true until this settles
```

| Member | Description |
|--------|-------------|
| `new Action(params?)` | Creates a reactive `Action`. Same parameters as `new Field()` — an `IFieldParams<T, X>` — applied in the same order: `validators` and `actions` are registered first, so one guarding `enabled` or `visibility` is in place for the assignment the same object makes, and each eager action runs once over the finished value. [Extended properties](/api/field#extended-properties) work as on any element, except that `label` and `icon` are members `Action` declares itself and therefore reach its value — `X` accordingly defaults to [`Extras`](/api/field#extras) without those two keys |
| `label` | Reads `value.label`; writing it assigns a new value object carrying the new label |
| `icon` | Reads `value.icon`; writing it assigns a new value object carrying the new icon |
| `execute(params?)` | Triggers `ExecuteAction` on this action and answers what the chain returned, as a promise. A handler that throws rejects that promise rather than throwing out of the call — see [Handling a failed run](#handling-a-failed-run) |
| `busy` | `true` from the call to `execute()` until the run it started settles. Overlapping runs are counted. A container holding the action counts this in its own `busy`, so a form reports that a run is in flight below it. An asynchronous validation of the action itself is reported by `validating` |

#### Handling a failed run

`execute()` answers with a promise, so a handler that throws rejects it. The answer is the caller's, and awaiting it
is how a failure is reported:

```typescript
try {
  await form.fields.save.execute();
  showSaved();
} catch (error) {
  showFailed(error);
}
```

A call that neither awaits the answer nor attaches a `.catch()` leaves the rejection unhandled — it surfaces
through the runtime rather than through the form, and the action carries no trace of it. `busy` is cleared either
way, on the rejection as on the success.

The place this is easy to miss is a template, where an event handler is not awaited:

```vue
<!-- the rejection has nowhere to go -->
<button @click="save.execute()" :disabled="save.busy">Save</button>

<!-- state what happens when it fails -->
<button @click="onSave" :disabled="save.busy">Save</button>
```

```typescript
async function onSave() {
  try {
    await save.execute();
  } catch (error) {
    showFailed(error);
  }
}
```

`ActionValue` is the exported shape of the value: `{ label?: string; icon?: string }`. `Action<T extends
ActionValue = ActionValue>` accepts a wider value type, so a subclass value carrying extra members is inferred from
`params.value` the same way `Field`'s is.

An `Action`'s value is always a shaped object, never `undefined`: `new Action()` starts out as
`{ label: undefined, icon: undefined }`. A value object states something when any member it carries holds
something other than `null` or `undefined`, so a subclass value naming a name, a render style or a set of
per-breakpoint options states something whether or not it names a label or an icon. A `params.value` that states
something is the action's value, kept as the object you passed; one that states nothing — `{}`, or members all
`null`/absent — is replaced, by a copy of `params.originalValue` where that states something and by the pair of
`undefined`s otherwise.

`params.originalValue` becomes the baseline where it states something: a frozen copy of itself, carrying exactly
the members it was declared with. Where it states nothing the baseline is the value the construction ends on, that
object itself. `isChanged` is a structural comparison and reads own-key sets, so a baseline shaped like the value
it baselines is what makes an action declared with a value and a matching `originalValue` read as unchanged from
construction, and every `Group` and `List` above it read as unchanged too.

`label` and `icon` write through the value setter, so each is an ordinary value change: `ValueChangedAction` fires,
`isChanged` answers over it, and a disabled action refuses the write. The value object the action holds is replaced
rather than written into, so an object you passed as `params.value` and kept a reference to no longer follows the
action once either setter has run. Writing the value the action already holds is not a change: it announces
nothing and leaves the value of every container above untouched. Assigning `undefined` clears the member out of
the value object rather than leaving a key holding `undefined`, so an action whose icon was never set reads as
unchanged after `action.icon = undefined`.

`execute()` is asynchronous. The chain is entered synchronously — a handler has already run by the time `execute()`
returns — and the promise settles with what the chain produced, awaiting it where the handler returned a promise of
its own. `busy` stands for that whole span, on the action rather than in its value, and is cleared whether the run
resolves or rejects; overlapping runs are counted, so it stands until the last of them settles.

::: warning
A handler that throws rejects the promise instead of throwing out of the `execute()` call, so a caller that
neither awaits the answer nor attaches a `.catch()` leaves the rejection unhandled — which under node's default
settings ends the process. A template handler such as `@click="save.execute()"` is safe: Vue attaches its own
catch to the promise an event handler returns and routes the error to `app.config.errorHandler`.
:::

```vue
<button :disabled="!save.enabled || save.busy" @click="save.execute()">{{ save.label }}</button>
```

An action declared, enabled by the form's validity, executed and reporting `busy` through an asynchronous submit is
worked through end to end in the [Action example](/examples/action).

#### Widening the value in a subclass

`Action<T extends ActionValue>` takes a wider value type, so a subclass declares accessors over the members it added
and keeps everything the base class does — the `ExecuteAction` chain, `busy`, `enabled`, `visibility`, the
conditional actions, the transaction semantics. `label` and `icon` are members `Action` declares, and both reach its
value, so a subclass wanting a differently shaped read of either narrows the getter and declares the setter beside
it, delegating to the base:

```typescript
import { Action, ActionValue } from '@dynamicforms/vue-forms';

interface RenderOptions extends ActionValue {
  name?: string;
  showLabel?: boolean;
  showIcon?: boolean;
}

class RenderedAction extends Action<RenderOptions> {
  get name() {
    return this.value.name;
  }

  // the read is filtered by showLabel, so an action rendering icon-only answers undefined while carrying a label
  get label() {
    return this.value.showLabel ? this.value.label : undefined;
  }

  set label(newValue: string | undefined) {
    super.label = newValue;
  }

  get icon() {
    return this.value.showIcon ? this.value.icon : undefined;
  }

  set icon(newValue: string | undefined) {
    super.icon = newValue;
  }
}
```

The setter is what keeps the write path alive. A class body stating `get label()` and nothing else defines the whole
property from that body, so the property the subclass carries has no setter at all, and the base class's setter, one
prototype further up, is shadowed rather than inherited alongside the narrowed getter. A write to a property that
has a getter and no setter throws a `TypeError` in strict code, which module code always is, so
`action.label = 'Save'` — the documented way to change either member — fails on such a subclass.
TypeScript reads the getter-only accessor as read-only and refuses the assignment where the reference is typed as
the subclass; a reference typed as `Action` compiles and throws at runtime. `super.label = newValue` calls the base
setter with `this` bound to the action, so the write stays an ordinary value change: `ValueChangedAction` fires,
`isChanged` answers over it, and a disabled action refuses it.

A narrowed read and an unnarrowed write do not answer each other. The setter reaches `value.label` whatever the
getter filters on, so an action whose filter answers `undefined` still answers `undefined` right after a label has
been written to it. `value.label` is the unfiltered read — `action.value.label` on any subclass — and it is what to
read where the answer has to be the label the action carries rather than the one it renders.

Naming an action's presentation property something else is the separate rule about
[extended properties](/api/field#extended-properties), and it applies to a property that is neither `label` nor
`icon`: a construction parameter of either name reaches the value rather than `extra`. A subclass reading either
member differently narrows the accessor pair above instead of taking a name of its own.

The same rule sets an action's extended properties apart from every other element's. `Action` declares
`X extends object = Omit<Extras, keyof ActionValue>`, so a `label` or an `icon` that something augmented
[`Extras`](/api/field#extras) with is absent from `action.extra` — the members above are where an action's label
and icon are, on an action that declares no extended properties and on one that does.

### `NullableAction`

Type alias for `Action | null`.

---

## List events

### `ListItemAddedAction`

Fires on a `List` when an item is inserted via `push()` or `insert()`.

```typescript
new ListItemAddedAction((field, supr, item, index) => {
  console.log('item added at', index, item);
  return supr(field, item, index);
})
```

`index` is the position `item` occupies in the list, which is also what `insert()` returns. A negative index handed
to `insert()` is resolved the way `Array.prototype.splice` resolves it and announced resolved, so it is never
negative here. `insert()` past the end of the list pads it first, and each padding item is announced with its own
index before the final trigger for the inserted item.

Additions and removals state operations rather than states, so they have no net over a
[transaction](/api/transactions) and are never compared away: every one of them is announced, in the order the
operations happened, before the value change they add up to. A handler reading `list.value` therefore sees the set
the transaction finished on, not the one that stood when its own item was added.

### `ListItemRemovedAction`

Fires on a `List` when an item is removed via `pop()` or `remove()`.

```typescript
new ListItemRemovedAction((field, supr, item, index) => {
  console.log('item removed from', index, item);
  return supr(field, item, index);
})
```

`item` is the removed row itself, released of the list (so without `parent`) and holding everything it held while it stood in the list — its values, its errors and the change history behind `isChanged`. It is the instance `remove()` answers the caller with, and the one `list.get(index)` answered with before the call. `pop()` delegates to `remove()`, so it behaves identically.

---

## Conditional actions

Conditional actions automatically toggle a field property when a `Statement` evaluates to a different boolean.

Conditional actions are eager: `registerAction()` evaluates the statement immediately and sets the field property right away. A conditional action handed to a constructor through `params.actions` does the same once the element is built, over its finished value. After that, the executor only runs when the result of the statement changes (`true` → `false` or `false` → `true`), not on every value change. The executor is applied to the fields the action is bound to, not to the fields appearing in the statement.

Registered on a `List`'s item template, a conditional action serves every row, and **each row holds a result of its
own**. A statement built from the template's fields reads the fields of the row it is evaluated over, so two rows
disagreeing about the condition show two different verdicts, and a change in one row reaches that row alone. A
field outside the rows — one the whole form holds — is read where it stands, and a change to it re-evaluates every
row.

```typescript
const row = new Group({ kind: new Field({ value: 'standard' }), detail: new Field({ value: '' }) });
row.fields.detail.registerAction(
  new ConditionalVisibilityAction(new Statement(row.fields.kind, Operator.EQUALS, 'other')),
);

const lines = new List(row, { value: [{ kind: 'other' }, { kind: 'standard' }] });
lines.get(0).fields.detail.visibility; // DisplayMode.FULL
lines.get(1).fields.detail.visibility; // DisplayMode.SUPPRESS
```

### `Statement`

A logical or comparison expression built from fields, constants, and an `Operator`.

```typescript
import { Statement, Operator } from '@dynamicforms/vue-forms';

const stmt = new Statement(activeField, Operator.EQUALS, true);
// Nested statements
const combined = new Statement(stmt, Operator.AND, new Statement(ageField, Operator.GE, 18));
```

`evaluate(scope?): boolean` always hands back a real boolean: the logical operators coerce their operands, so
`new Statement(0, Operator.AND, true).evaluate()` is `false` and not `0`, and a conditional executor therefore
always receives a boolean `currentResult`.

`scope` names an element whose record the field operands are read in — a row of a `List`, or the form itself.
`statement.evaluate(list.get(1))` reads the second row's fields even where the statement was built from the item
template's, which is what makes one statement serve every row. An operand belonging to another record is read
where it stands, so a form-level field compared against a row's field means the same field for every row, and an
operand taken from an *enclosing* item template is that template's own field rather than the field of the
enclosing row a nested list sits in. Called without an argument, the statement reads exactly the fields it was
built from.

`EQUALS` / `NOT_EQUALS` compare with loose `==`, so `'1'` and `1` are equal, and so are `null` and `undefined`.

Each operand has the exported type `OperandType` — a nested `Statement`, a `FieldBase` whose current `value` is
compared, or a literal of any type. Because the union includes `any`, the type checker accepts anything there; the
three cases are told apart at evaluation time by `instanceof`.

The constructor refuses the two shapes that are no operand at all, **throwing a `TypeError`** that names the
position the operand was written at:

- `undefined` — what `group.fields.typoName` answers with. Compare against `null` to test for an unset value;
  `group.field('typoName')` answers `null`, and `null` is a literal a statement may compare against;
- a **function** — a field accessor handed over uncalled. State the field it answers with: `group.field('name')`.

Everything else stands: a field, a nested statement, `null`, `NaN`, `0`, `''`, an array, an object with
`includes`.

`Operator.NOT` reads its first operand alone and is stated with one:

```typescript
new Statement(field, Operator.NOT);                   // what NOT means
new Statement(field, Operator.EQUALS, 'admin');       // every other operator compares two
```

A second operand under `NOT` is accepted and never read. An operator held in a variable — what
`Operator.fromString()` answers with, and the form a condition arriving from a server takes — needs both, because
the compiler cannot tell it from `NOT`:

```typescript
const operator = Operator.fromString(fromServer);
new Statement(field, operator, other);   // state both, whichever operator it turns out to be
```

```typescript
new Statement(form.fields.typo, Operator.EQUALS, 1);
// TypeError: Statement operand 1 is undefined: an operand is a field, a nested statement or a literal, …
```

`Statement` itself is passive: it computes its value only when you call `evaluate()`. Reactivity comes from the conditional action you pass it to: its constructor uses `collectFields()` to gather every field appearing in the statement and registers a `ValueChangedAction` on each of them, so the statement is re-evaluated whenever any of those fields changes. This happens when you write `new ConditionalVisibilityAction(stmt)`, before the action is registered on any field. One handler is registered per field however many rows read it, and the handler re-evaluates the record the change happened in.

`collectFields(): Set<FieldBase>` is public: it walks the statement and its nested statements and returns the field
instances themselves, which is useful when you want to attach your own handlers to the same set.

`operand1Value` and `operand2Value` read the two operands the way `evaluate()` does — a nested statement is
evaluated, a field contributes its `value`, a literal is itself — over the fields the statement was built from.
Neither takes a record, so on a statement serving a `List` they answer for the item template.

### `Operator`

Enum of supported operators:

| Group | Values |
|-------|--------|
| Logic | `NOT`, `OR`, `AND`, `XOR`, `NAND`, `NOR` |
| Comparison | `EQUALS`, `NOT_EQUALS`, `LT`, `LE`, `GE`, `GT` |
| Membership | `IN`, `NOT_IN` — evaluate `operand2.includes(operand1)` (array or string) and coerce its result to a boolean. `NOT_IN` is the negation of `IN`, so an `operand2` without a callable `includes` gives `IN` `false` and `NOT_IN` `true` |
| Substring | `INCLUDES`, `NOT_INCLUDES` — `operand1` contains the substring `operand2`; both operands must be strings, otherwise `INCLUDES` is `false` and `NOT_INCLUDES` `true` |

Use `Operator.fromString('and')` to parse a string at runtime. It is case insensitive and also accepts hyphen and space variants (`'not equals'`, `'not-in'`, `'not_includes'`); an unrecognised string throws an `Error`. `DisplayMode.fromString` refuses an unrecognised string the same way.

### `ConditionalVisibilityAction(statement)`

Sets `field.visibility` to `DisplayMode.FULL` when `statement` is `true`, `DisplayMode.SUPPRESS` when `false`.

```typescript
import { ConditionalVisibilityAction, Statement, Operator } from '@dynamicforms/vue-forms';

targetField.registerAction(new ConditionalVisibilityAction(
  new Statement(showField, Operator.EQUALS, true)
));
```

### `ConditionalEnabledAction(statement)`

Sets `field.enabled` to `true` when `statement` is `true`, `false` otherwise.

### `ConditionalValueAction(statement, trueValue)`

Sets `field.value = trueValue` when `statement` transitions to `true`. Does nothing on `false`.

The value is set only on the transition from `false`/`undefined` to `true`: if you later change the value manually, the action will not restore it until the statement goes back to `false` and becomes `true` again. On a disabled field (`enabled === false`) setting the value has no effect.

### `ConditionalStatementAction(statement, executorFn)`

Base class for all conditional actions. Use when the derived classes don't cover your case.

```typescript
import { ConditionalStatementAction, Statement, Operator } from '@dynamicforms/vue-forms';

targetField.registerAction(new ConditionalStatementAction(
  new Statement(sourceField, Operator.GT, 0),
  (field, currentResult, previousResult) => {
    field.touched = currentResult;
  }
));
```

| Callback param | Type | Description |
|----------------|------|-------------|
| `field` | `FieldBase` | The field this action is registered on |
| `currentResult` | `boolean` | Current evaluation of the statement |
| `previousResult` | `boolean \| undefined` | Previous result (`undefined` on first run) |

---

## Custom actions

For actions that are not conditional, derive from the exported `FieldActionBase`. Every action class must declare a static `classIdentifier` — it is the key under which `ActionsMap` stores the chain. Without it the base class throws `Error('classIdentifier must be declared')` on registration.

```typescript
import { FieldActionBase } from '@dynamicforms/vue-forms';

const MyActionClassIdentifier = Symbol('MyAction');

class MyAction extends FieldActionBase {
  static get classIdentifier() {
    return MyActionClassIdentifier;
  }
}

field.registerAction(new MyAction((field, supr, ...params) => supr(field, ...params)));
field.triggerAction(MyAction, 'some param');
```

Deriving from `FieldActionBase` is the only way to write an action: `registerAction()` checks
`instanceof FieldActionBase` and rejects anything else with `Error('Invalid action type')`, so a hand-rolled object
with a matching `execute` method does not work.

Optional overrides:

| Member | Description |
|--------|-------------|
| `get eager()` | Return `true` to have the action executed immediately on `registerAction()`, and on every `ValueChangedAction` trigger and `validate(true)`. Defaults to `false`, and it is read per instance: a lazy action standing under the same `classIdentifier` as an eager one is not run by the eager pass |
| `boundToBinding(binding)` | Called once for every element this action comes to serve: the element it is registered on, and every binding of that element as the binding takes the action on. Use it to record the elements the action answers for |
| `unregisterFrom(binding)` | Called by `unregisterAction()` and by `clearValidators()`, naming the element the action was dropped from. Override it to release what the action installed for that element — `CompareTo` stops answering for it, and `Validator` withdraws the errors it put there. It runs inside the operation that dropped the registration, so a rollback puts back both the registration and what this took back |

State an action keeps between runs belongs to the element it ran over, because the instance is shared by every
binding of the element it was registered on. `protected state<S>(key, init): S` holds it: the key is the element, or
the record the element belongs to where the fact is about the whole record, and the entry is released with the key.

```typescript
class CountingAction extends ValueChangedAction {
  static get classIdentifier() { return CountingActionClassIdentifier; }

  constructor() {
    super((field, supr, newValue, oldValue) => {
      const counter = this.state(field, () => ({ writes: 0 }));
      counter.writes += 1;
      return supr(field, newValue, oldValue);
    });
  }
}
```

### Reading a second element of the record

An eager action that reads a second element — a validator comparing two fields, a statement over another field of
the row — can run before the record it reads exists: a `List` row is built by binding the item template member by
member, and a member's eager pass runs while the member is still on its own. Where the lookup reaches nothing,
call `field.markRecordIncomplete()` and reach no verdict. The container that finishes the record runs the pass
again over the record it then has, and a pass that still reaches nothing says so again, so the container above —
the `List` taking the row into the form — answers for it in turn. `CompareTo` and the conditional actions do
exactly this, which is how a row that holds the very values its template holds still carries its own verdict.

`element.declaration` and `container.bindingsOf(declaration)` are what such an action resolves with: the first
tells a row's field from the item template's field it was declared as, the second answers with every element of a
subtree that was declared as a given one.

### `ActionsMap`

The actions one element has registered, grouped by `classIdentifier`. It is the type of `FieldBase`'s internal
action store and is exported so that type can be named; `registerAction()`, `registerActionBefore()`,
`unregisterAction()`, `triggerAction()` and `clearValidators()` on the field are the supported way to drive it. Its
own surface is `register()`, `unregister()`, `trigger()`, `triggerEager()`, `triggerEagerFor()`, `willTrigger()`,
`hasEager`, `validators`, `clone()` and `bindTo()`.

Within a group the actions stand in registration order and are run from the end backwards, so the newest
registration is the outermost handler and reaches the ones before it through the `supr` it is handed.

`register(action, before?)` appends `action` to its group, or — where `before` is given — puts it in that action's
place, so `before` wraps it. `before` has to be registered under the same identifier; anything else throws.
`unregister(action)` drops it and answers whether the map held it. The group is replaced rather than written, so a
run already walking one finishes on the list it started with and the removal takes effect from the next trigger.

`trigger(ActionClass, field, ...params)` runs the group registered under that class and answers with what its
outermost handler returned. `triggerEager(field, ...params)` runs the eager actions of every identifier, each group
on its own, and `triggerEagerFor(identifier, field, ...params)` runs those of one identifier.
`willTrigger(identifier)` answers whether anything stands under that identifier and `hasEager` whether any eager
action is registered at all, so a caller that has to build the parameters first can skip building them.

`clone()` returns a copy holding the same action instances, and `bindTo(owner)` tells each of them that it now
serves `owner`. Binding an element does both, which is what makes an action registered on an item template serve
every row.

A handler reaches the one before it by calling `supr`, so a chain is walked on the call stack and its depth is
bounded by it: about 1300 handlers under one identifier on one element, after which firing it throws a
`RangeError`. Registrations spread over several identifiers or several elements do not add up.

---

## `DisplayMode`

Used by visibility properties.

| Constant | Value | Meaning |
|----------|-------|---------|
| `DisplayMode.FULL` | `10` | Render normally (default) |
| `DisplayMode.INVISIBLE` | `8` | Render but hide with `display: none` |
| `DisplayMode.HIDDEN` | `5` | Render as `<input type="hidden">` |
| `DisplayMode.SUPPRESS` | `1` | Do not render at all |

```typescript
import { DisplayMode } from '@dynamicforms/vue-forms';

field.visibility = DisplayMode.HIDDEN;

DisplayMode.fromString('suppress'); // → DisplayMode.SUPPRESS
DisplayMode.fromString('nonsense'); // → Error: 'nonsense' is not a DisplayMode constant

DisplayMode.fromAny(5);             // → DisplayMode.HIDDEN
DisplayMode.fromAny(999);           // → Error: 999 is not a DisplayMode constant
DisplayMode.fromAny(null);          // → Error: null is not a DisplayMode constant

DisplayMode.isDefined('HIDDEN');    // → true
DisplayMode.isDefined('HIDEN');     // → false
DisplayMode.isDefined(999);         // → false
```

Nothing in `DisplayMode` falls back to `DisplayMode.FULL`. `fromString` resolves a constant's name, case insensitive, and throws for anything else. `fromAny` takes a number or a name and throws for a number that is none of the constants, a string that names none, and input that is neither. Every one of those errors reads `<value> is not a DisplayMode constant`, so a caller recognises one wherever it was raised. `Operator.fromString` refuses an unrecognised string the same way.

`DisplayMode.isDefined` is the way to ask without raising, and the one the `visibility` setter asks: a number is a `DisplayMode` when it is one of the constants, a string when it names one, case insensitive. The setter takes a `DisplayMode`, so a string reaches it from JavaScript, through a cast, or as a `VisibilityChangingAction`'s result — a name is set, a misspelled name throws.

A form element whose parameters name no visibility starts at `DisplayMode.FULL`. That is a starting value, not a fallback for input a parse could not read. The package exports it as `defaultDisplayMode`, so code choosing a mode for itself names the same constant the library starts at:

```typescript
import { defaultDisplayMode, DisplayMode } from '@dynamicforms/vue-forms';

const mode = DisplayMode.isDefined(fromServer) ? DisplayMode.fromAny(fromServer) : defaultDisplayMode;
```

---

> See also: [The model](/guide/model), [Action example](/examples/action),
> [Conditional statements example](/examples/conditional-statement), [Field API](/api/field)
