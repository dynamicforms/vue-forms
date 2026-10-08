# Action

`Action` is a [`Field`](/api/field) whose value is an `ActionValue`:

```typescript
interface ActionValue {
  label?: unknown;
  icon?: unknown;
  defaultConfirm?: boolean; // the action a container's confirm() executes
  defaultReject?: boolean;  // the action a container's reject() executes
}
```

It represents a command, such as a button or a menu entry, that runs an `ExecuteAction` chain. An action sends
nothing: it is not in its container's `value` or `fullValue`, it does not affect the container's `isChanged` or
validity, its validators do not run, and assigning or rebinding the container does not change it. A container whose
members are all actions sends nothing either. It extends `Field`, which extends
[`FieldBase`](/api/field-base); the table below lists what `Action` adds or overrides.

::: tip Action is not UI-agnostic, deliberately
The library describes data and behaviour; the few members that concern the user interface are listed in
[Rationale](/guide/rationale#what-the-library-carries-for-the-interface). `Action` has a label and an icon because it represents a *concept*: the element a form's submit, cancel and delete are attached to. The label and icon
identify that concept; without them, `Action` would be indistinguishable from `Field`.

The shape is minimal because **a UI library is expected to extend it**, and both members are typed `unknown` for
that reason: `Action` defines the concept and the rendering library defines what a label and an icon are. A
subclass declares its value type with either member in the shape it renders (`string | MdString`, a
per-breakpoint object), and the accessors the base class declares return that type, because they take it from the
value type.
[Widening the value in a subclass](#widening-the-value-in-a-subclass) has the rules.
`@dynamicforms/vuetify-inputs` widens the value with render options and per-breakpoint variants and adds
`renderAs`, `showLabel`, `showIcon` and passthrough attributes; its
[df-actions page](https://docs.velis.si/dynamicforms/vuetify-inputs/examples/df-actions.html) shows how these
render. `busy` is form state for the same reason: the library counts the runs, and how that is rendered is up to
the application.
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

## Members

| Member | Description |
|--------|-------------|
| `new Action(params?)` | Creates a reactive `Action`. Same parameters as `new Field()` (an `IFieldParams<T, X>`), applied in the same order: `validators` and `actions` are registered first, so an action guarding `access` or `visibility` applies to the assignment from the same object, and each eager action runs once over the final value. [Extended properties](/api/field-base#extended-properties) work as on any element, except that `label` and `icon` are members `Action` declares itself and therefore go to its value; `X` accordingly defaults to [`Extras`](/api/field-base#extras) without those two keys |
| `busy` | Overrides [`FieldBase.busy`](/api/field-base#prop-busy): `true` from the call to `execute()` until the run it started settles. Overlapping runs are counted. A container holding the action includes this in its own `busy`, so a form reports that a run is in progress below it. An asynchronous validation of the action itself is reported by `validating` |
| `contribution` | Overrides [`FieldBase.contribution`](/api/field-base#prop-contribution): always `undefined`, because an action sends nothing |
| `defaultConfirm` | `value.defaultConfirm`, `false` where it is not set: whether a container's [`confirm()`](/api/container#confirm-params-promise-any-undefined) executes this action |
| `defaultReject` | `value.defaultReject`, `false` where it is not set: whether a container's [`reject()`](/api/container#reject-params-promise-any-undefined) executes this action |
| `executable` | `true` while the action accepts input (`effectiveEnabled`), is shown (`visibility` is `'full'`), is not running (`busy` is `false`) and every `ExecuteAction` registered on it returns `true` from [`canExecute()`](/api/actions#executeaction). Reactive, so a button binds `:disabled="!action.executable"`. `confirm()` and `reject()` execute only an executable action; `execute()` does not check it |
| `execute(params?)` | Triggers `ExecuteAction` on this action and returns the chain's return value as a promise. A handler that throws rejects that promise instead of throwing out of the call, except for `AbortEventHandlingException`, which the promise resolves with; see [Handling a failed run](#handling-a-failed-run) |
| `icon` | Reads `value.icon`, at the type `T` gives that member; writing it assigns a new value object with the new icon |
| `label` | Reads `value.label`, at the type `T` gives that member (`unknown` on an `Action` without a value type argument); writing it assigns a new value object with the new label |

## Inherited from Field

| Member | Description |
|--------|-------------|
| [`bind(data?, overrides?)`](/api/field#bind-data-overrides-this) | Returns a new element of the same class over `data` |
| [`touched`](/api/field#prop-touched) | Interaction flag the element stores; writable |
| [`value`](/api/field#prop-value) | The value the element holds; writable |

## Inherited from FieldBase

| Member | Description |
|--------|-------------|
| [`access`](/api/field-base#prop-access) | Whether the element accepts input, what it sends to its container, and whether it is validated |
| [`beginValidating() / endValidating()`](/api/field-base#beginvalidating-void-endvalidating-void) | Increment and decrement the asynchronous validation counter behind `validating` |
| [`bindingsOf(declaration)`](/api/field-base#bindingsof-declaration-fieldbase) | Returns every element in the subtree whose `declaration` is the one given |
| [`clearValidators()`](/api/field-base#clearvalidators-void) | Removes the element's validators and empties `errors` |
| [`declaration`](/api/field-base#prop-declaration) | The element this one was declared as: itself, or the element a binding was made from |
| [`effectiveAccess`](/api/field-base#prop-effectiveAccess) | The access that applies once the containers above are taken into account |
| [`effectiveEnabled`](/api/field-base#prop-effectiveEnabled) | `true` where `effectiveAccess` is `'editable'` |
| [`enabled`](/api/field-base#prop-enabled) | `true` where `access` is `'editable'` |
| [`errors`](/api/field-base#prop-errors) | Current validation errors of the element; writable |
| [`extra`](/api/field-base#prop-extra) | The extended properties the element holds, frozen; written through `setExtendedValues()` |
| [`fieldName`](/api/field-base#prop-fieldName) | Key name within the parent `Group` |
| [`fullValue`](/api/field-base#prop-fullValue) | What the element holds; identical to `value` except on `Group` and `List` |
| [`isChanged`](/api/field-base#prop-isChanged) | `true` when `value` differs from `originalValue` (deep equality) |
| [`markRecordIncomplete()`](/api/field-base#markrecordincomplete-void) | Marks that an eager action did not find a second element of a record not yet assembled |
| [`originalValue`](/api/field-base#prop-originalValue) | Baseline for `isChanged`; writable |
| [`parent`](/api/field-base#prop-parent) | Container the element belongs to |
| [`pending`](/api/field-base#prop-pending) | `validating \|\| busy` |
| [`rebind(data)`](/api/field-base#rebind-data-this) | Replaces the data the element holds, in place |
| [`registerAction(action)`](/api/field-base#registeraction-action-this) | Registers an action on the element; returns `this` |
| [`registerActionBefore(action, before)`](/api/field-base#registeractionbefore-action-before-this) | Registers `action` inside an existing chain, wrapped by `before` |
| [`setExtendedValues(values)`](/api/field-base#setextendedvalues-values-void) | Merges extended properties into `extra` |
| [`settled()`](/api/field-base#settled-promise-void) | Resolves once `pending` is `false` |
| [`triggerAction(actionClass, ...params)`](/api/field-base#triggeraction-actionclass-params-any) | Fires an action class on the element and returns what the chain returns |
| [`unregisterAction(action)`](/api/field-base#unregisteraction-action-boolean) | Removes an action from the element's declaration and its bindings |
| [`valid`](/api/field-base#prop-valid) | `true` when `errors` is empty |
| [`validate(revalidate?)`](/api/field-base#validate-revalidate-void) | Publishes the validity derived from `errors` |
| [`validating`](/api/field-base#prop-validating) | `true` while an asynchronous validation is in flight on the element or below it |
| [`validationEpoch`](/api/field-base#prop-validationEpoch) | Generation counter of the element's validators |
| [`visibility`](/api/field-base#prop-visibility) | How a rendering layer shows the element; writable |

## `SubmitAction(target, handler, options?)`

An `ExecuteAction` that sends the value of `target` to `handler`. Register it on the `Action` that submits a form.

```typescript
import { Action, Field, Group, SubmitAction } from '@dynamicforms/vue-forms';

const form = new Group({
  name: new Field({ value: '' }),
  actions: new Group({
    save: new Action({
      value: { label: 'Save', defaultConfirm: true },
      actions: [new SubmitAction((action) => action.parent?.parent, (value) => api.save(value))],
    }),
  }),
});

const { sent, received } = await form.confirm();
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `target` | `CommandTarget` (`FieldBase \| ((action: FieldBase) => FieldBase \| null \| undefined)`) | The element to submit, or a callback that returns it for the action the handler runs on. Required: an action in a bar of actions has the bar as its `parent`, not the form |
| `handler` | `(value, target) => R \| Promise<R>` | Sends `value` (the target's `value`) and returns what was received |
| `options.rebind` | `boolean` | Default `true`: a result other than `undefined` is written back with `target.rebind(result)`, which makes it the new baseline |

On `execute()` it:

1. waits until `target.validating` is `false`, so a validation started in the same event is finished. It does not
   await `target.settled()`: the action is `busy` while it runs, so the target is `pending` until it returns;
2. where `target.valid` is `false`, ends with a `SubmitRefusedException` whose `reason` is `'invalid'`, which
   `execute()` resolves with;
3. calls `handler(target.value, target)` and awaits it;
4. where the result is not `undefined` and `options.rebind` is not `false`, calls `target.rebind(result)`;
5. calls the next handler in the chain and resolves with a `SubmitResult`:

```typescript
interface SubmitResult<R = any> {
  action: FieldBase; // the action that ran the submit
  sent: unknown;     // the target's value passed to handler
  received: R;       // what handler returned
}
```

A second `execute()` while a submit of the same action is running resolves with a `SubmitRefusedException` whose
`reason` is `'running'` and does not call `handler`. A `handler` that throws or rejects makes `execute()` reject with that error, and the target is
not changed. Writing a server's field errors to the fields is the handler's: it writes them to `field.errors`
before it throws, as in [Showing errors the server returned](/guide/cookbook#showing-errors-the-server-returned).

`canExecute()` is `true` while the target is valid and not `pending`, so `Action.executable` is `false` while the
form is invalid, a validation is running or the submit itself is running.

`SubmitRefusedException` extends `AbortEventHandlingException`. Its `reason` (`SubmitRefusalReason`) states why the
submit was refused:

| `reason` | Cause |
|---|---|
| `'invalid'` | the target is invalid after its validation finished |
| `'running'` | a submit of the same action is running |

```typescript
const result = await form.confirm();
if (result instanceof SubmitRefusedException && result.reason === 'invalid') form.touched = true;
```

## `RejectAction(target)`

An `ExecuteAction` that puts `target` back to its baseline: on `execute()` it calls
`target.rebind(target.originalValue)`, then the next handler in the chain, and returns that handler's result.
`target` is a `CommandTarget`, as for `SubmitAction`. `canExecute()` is `true` while the target exists, whatever its
validity.

```typescript
new Action({ value: { label: 'Cancel', defaultReject: true }, actions: [new RejectAction((a) => a.parent?.parent)] });
```

`SubmitAction` and `RejectAction` extend `TargetedExecuteAction`, whose `targetFor(action)` returns the element the
handler works on for `action`. [`Container.confirm()` and `reject()`](/api/container#confirm-params-promise-any-undefined)
find the action that submits or rejects a container by it.

## Handling a failed run

`execute()` returns a promise, so a handler that throws rejects it, with every exception except
[`AbortEventHandlingException`](/api/actions#aborteventhandlingexception), which the promise resolves with. The caller handles
the result; awaiting it is how a failure is detected:

```typescript
try {
  await form.fields.save.execute();
  showSaved();
} catch (error) {
  showFailed(error);
}
```

A call that neither awaits the result nor attaches a `.catch()` leaves the rejection unhandled: the runtime reports
it, not the form, and the action holds no record of it. `busy` is cleared in both cases, on rejection and on
success.

In a template, an event handler is not awaited:

```vue
<!-- the rejection goes to app.config.errorHandler, not to the form -->
<button @click="save.execute()" :disabled="save.busy">Save</button>

<!-- the handler handles the failure -->
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

`ActionValue` is the exported shape of the value: `{ label?: unknown; icon?: unknown }`. `Action<T extends
ActionValue = ActionValue>` accepts a wider value type, so a subclass value with extra members (or redeclaring
these two) is inferred from `params.value` the same way `Field`'s is.

Both members are `unknown` because the rendering library defines what a label and an icon are, and `unknown` allows
it to do so: `interface RenderOptions extends ActionValue { label?: string | MdString }` is legal, while a `string`
in the base would reject it, and a subclass cannot widen an accessor the base class typed. Consequently, on an
`Action` without a value type argument `action.label` is `unknown` and the reader asserts the expected type. An
action built from a literal has a narrower type: `new Action({ value: { label: 'Save' } })` infers `T` from the
literal, so its `label` is `string`.

An `Action`'s value is always an object, never `undefined`: `new Action()` starts with
`{ label: undefined, icon: undefined }`. A value object is non-empty when any of its members holds something other
than `null` or `undefined`, so a subclass value with a name, a render style or a set of per-breakpoint options is
non-empty with or without a label or an icon. A non-empty `params.value` becomes the action's value, kept as the
object you passed; an empty one (`{}`, or members all `null`/absent) is replaced by a copy of
`params.originalValue` where that is non-empty, and by the pair of `undefined`s otherwise.

A non-empty `params.originalValue` becomes the baseline as a frozen copy of itself, with exactly the members it was
declared with. Where it is empty, the baseline is the value the construction ends with, that object itself.
`isChanged` is a structural comparison that compares own-key sets, so because the baseline has the same shape as
the value, an action declared with a value and a matching `originalValue` reads as unchanged after construction,
and so does every `Group` and `List` above it.

`label` and `icon` write through the value setter, so each write is an ordinary value change: `ValueChangedAction`
fires, `isChanged` reflects it, and a disabled action takes the write like any other field. The setter replaces the value object
instead of modifying it, so an object you passed as `params.value` and kept a reference to is no longer the
action's value once either setter has run. Writing the value the action already holds is not a change: it
announces nothing and leaves the value of every container above unchanged. Assigning `undefined` removes the member
from the value object (the key is deleted, not set to `undefined`), so an action whose icon was never set reads as
unchanged after `action.icon = undefined`.

`execute()` is asynchronous. The chain is entered synchronously (a handler has already run when `execute()`
returns), and the promise settles with the chain's result, awaiting it where the handler returned a promise.
`busy` covers that whole time, is a property of the action (not part of its value), and is cleared whether the run
resolves or rejects; overlapping runs are counted, so it stays `true` until the last of them settles.

::: warning
A handler that throws anything but `AbortEventHandlingException` rejects the promise instead of throwing out of the
`execute()` call, so a caller that neither awaits the result nor attaches a `.catch()` leaves the rejection
unhandled, which under Node's default settings ends the process. A template handler such as
`@click="save.execute()"` is safe: Vue attaches its own catch to the promise an event handler returns and passes the
error to `app.config.errorHandler`.
:::

```vue
<button :disabled="!save.enabled || save.busy" @click="save.execute()">{{ save.label }}</button>
```

The [Action example](/examples/action) shows a complete action: declared, enabled by the form's validity, executed,
and reporting `busy` during an asynchronous submit.

## Widening the value in a subclass

`Action<T extends ActionValue>` takes a wider value type, so a subclass declares accessors for the members it adds
and keeps everything the base class does: the `ExecuteAction` chain, `busy`, `access`, `visibility`, the
conditional actions, the transaction semantics.

**The type of `label` and of `icon` is declared in the value type, not on the accessors.** `ActionValue` declares
both as `unknown`, so a subclass redeclares them at the type it renders and the inherited accessors return that
type, since `Action`'s accessors take it from `T`. A subclass does this and does not override an accessor: a getter
declared on a subclass has to be assignable to the base class's, so widening it there is error `TS2416`, and no
cast on the subclass's side avoids it.

```typescript
import { Action, ActionValue } from '@dynamicforms/vue-forms';

class MdString { constructor(readonly md: string) {} }

interface RichValue extends ActionValue {
  label?: string | MdString;
  icon?: string;
}

class RichAction extends Action<RichValue> {}

const save = new RichAction({ value: { label: new MdString('**Save**') } });
save.label;                    // string | MdString | undefined
save.label = 'Save';           // the plain type is still one of them
```

A subclass declares its own accessor only where the *read* differs from the value (filtering it, for example), and
then declares the setter beside it, delegating to the base:

```typescript
import { Action, ActionValue } from '@dynamicforms/vue-forms';

interface RenderOptions extends ActionValue {
  label?: string;
  icon?: string;
  name?: string;
  showLabel?: boolean;
  showIcon?: boolean;
}

class RenderedAction extends Action<RenderOptions> {
  get name() {
    return this.value.name;
  }

  // the read is filtered by showLabel, so an icon-only action returns undefined while it holds a label
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

The setter keeps the property writable. A class body declaring only `get label()` defines the whole property, so
the subclass's property has no setter, and the base class's setter, one prototype further up, is shadowed, not
inherited alongside the narrowed getter. A write to a property that has a getter and no setter throws a
`TypeError` in strict mode, which module code always uses, so `action.label = 'Save'` (the documented way to change
either member) fails on such a subclass. TypeScript treats the getter-only accessor as read-only and rejects the
assignment where the reference is typed as the subclass; a reference typed as `Action` compiles and throws at
runtime. `super.label = newValue` calls the base setter with `this` bound to the action, so the write is an
ordinary value change: `ValueChangedAction` fires, `isChanged` reflects it, and a disabled action takes it like any other field.

A narrowed getter and an unnarrowed setter are independent. The setter writes `value.label` regardless of the
getter's filter, so an action whose filter returns `undefined` still returns `undefined` right after a label has
been written to it. `value.label` is the unfiltered read (`action.value.label` on any subclass); read it where the
result has to be the label the action holds, not the one it renders.

Giving an action's presentation property a different name is covered by the separate rule about
[extended properties](/api/field-base#extended-properties), and it applies to a property that is neither `label` nor
`icon`: a construction parameter with either of those names goes to the value, not to `extra`. A subclass that
reads either member differently narrows the accessor pair as shown above, and does not use a different name.

The same rule makes an action's extended properties differ from every other element's. `Action` declares
`X extends object = Omit<Extras, keyof ActionValue>`, so a `label` or an `icon` added to
[`Extras`](/api/field-base#extras) by augmentation is absent from `action.extra`. An action's label and icon are always
the members above, whether or not the action declares extended properties.

## `NullableAction`

Type alias for `Action | null`.
