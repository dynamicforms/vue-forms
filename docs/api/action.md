# Action

`Action` is a [`Field`](/api/field) that represents a command, such as a button or a menu entry: it holds a label
and an icon, and `execute()` runs the `ExecuteAction` chain registered on it. An action sends nothing: it is not in
its container's `value` or `fullValue`, it does not affect the container's `isChanged` or validity, its validators
do not run, and assigning or rebinding the container does not change it. A container whose members are all actions
sends nothing either.

`Action` is one of the few members that concern the user interface; [Rationale](/guide/rationale#what-the-library-carries-for-the-interface)
lists them, and [Why `Action` is not UI-agnostic](/examples/action#why-action-is-not-ui-agnostic) explains this one.
A UI library extends it: `@dynamicforms/vuetify-inputs` adds render options and per-breakpoint variants
([df-actions](https://docs.velis.si/dynamicforms/vuetify-inputs/examples/df-actions.html)).

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
| `execute(params?)` | Triggers `ExecuteAction` on this action and returns the chain's return value as a promise. A handler that throws rejects that promise instead of throwing out of the call, except for `AbortEventHandlingException`, which the promise resolves with; see [Executing](#executing) |
| `icon` | Reads `value.icon`, at the type `T` gives that member; writing it assigns a new value object with the new icon |
| `label` | Reads `value.label`, at the type `T` gives that member (`unknown` on an `Action` without a value type argument); writing it assigns a new value object with the new label |

## Value

```typescript
interface ActionValue {
  label?: unknown;
  icon?: unknown;
  defaultConfirm?: boolean; // the action a container's confirm() executes
  defaultReject?: boolean;  // the action a container's reject() executes
}
```

`ActionValue` is the exported shape of the value. `Action<T extends ActionValue = ActionValue>` accepts a wider value
type, so a subclass value with extra members is inferred from `params.value` the same way `Field`'s is. `label` and
`icon` are `unknown`, so on an `Action` without a value type argument `action.label` is `unknown` and the reader
asserts the expected type; an action built from a literal has a narrower type: `new Action({ value: { label: 'Save' } })`
infers `T` from the literal, so its `label` is `string`. [Widening the value in a subclass](#widening-the-value-in-a-subclass)
explains why the members are `unknown`.

An `Action`'s value is always an object, never `undefined`: `new Action()` starts with
`{ label: undefined, icon: undefined }`. A value object is non-empty when any of its members holds something other
than `null` or `undefined`, so a subclass value with a name, a render style or a set of per-breakpoint options is
non-empty with or without a label or an icon. A non-empty `params.value` becomes the action's value, kept as the
object you passed; an empty one (`{}`, or members all `null`/absent) is replaced by a copy of
`params.originalValue` where that is non-empty, and by the pair of `undefined`s otherwise.

A non-empty `params.originalValue` becomes the baseline as a frozen copy of itself, with exactly the members it was
declared with. Where it is empty, the baseline is the value the construction ends with, that object itself.
`isChanged` compares own-key sets, so an action declared with a value and a matching `originalValue` reads as
unchanged after construction.

`label` and `icon` write through the value setter, so each write is an ordinary value change: `ValueChangedAction`
fires, `isChanged` reflects it, and a disabled action takes the write like any other field. The setter replaces the
value object instead of modifying it, so an object you passed as `params.value` and kept a reference to is no longer
the action's value once either setter has run. Writing the value the action already holds is not a change. Assigning
`undefined` removes the member from the value object (the key is deleted, not set to `undefined`), so an action whose
icon was never set reads as unchanged after `action.icon = undefined`.

## Executing

`execute()` is asynchronous. The chain is entered synchronously (a handler has already run when `execute()`
returns), and the promise settles with the chain's result, awaiting it where the handler returned a promise.
`busy` covers that whole time, is a property of the action (not part of its value), and is cleared whether the run
resolves or rejects; overlapping runs are counted, so it stays `true` until the last of them settles.

```vue
<button :disabled="!save.executable" @click="save.execute()">{{ save.label }}</button>
```

The [Action example](/examples/action) shows a complete action: declared, enabled by the form's validity, executed,
and reporting `busy` during an asynchronous submit.

### Handling a failed run

`execute()` returns a promise, so a handler that throws rejects it instead of throwing out of the call, with every
exception except [`AbortEventHandlingException`](/api/actions#aborteventhandlingexception), which the promise
resolves with. `busy` is cleared on rejection and on success. A run therefore ends in one of three ways: it resolves
with the chain's result, it resolves with the `AbortEventHandlingException` a handler threw to stop it, or it
rejects with an error.

```typescript
try {
  const result = await form.fields.save.execute();
  if (result instanceof AbortEventHandlingException) showStopped(result.message);
  else showSaved();
} catch (error) {
  showFailed(error);
}
```

A call that neither awaits the result nor attaches a `.catch()` leaves the rejection unhandled: the runtime reports
it, which under Node's default settings ends the process, and the action holds no record of it. In a template,
`@click="save.execute()"` passes the rejection to `app.config.errorHandler`: Vue attaches its own catch to the promise
an event handler returns. A handler that reports the failure itself awaits the call:

```typescript
async function onSave() {
  try {
    const result = await save.execute();
    if (!(result instanceof AbortEventHandlingException)) showSaved();
  } catch (error) {
    showFailed(error);
  }
}
```

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
`reason` is `'running'` and does not call `handler`. Writing a server's field errors to the fields is the handler's:
it writes them to `field.errors` before it throws, as in
[Showing errors the server returned](/guide/cookbook#showing-errors-the-server-returned).

`canExecute()` is `true` while the target is valid and not `pending`, so `Action.executable` is `false` while the
form is invalid, a validation is running or the submit itself is running.

Every outcome of a submit is the resolved value of `execute()` (and of `Container.confirm()`):

| Resolved value | Outcome |
|---|---|
| `SubmitResult` | the handler returned; the target is rebound to the result (see `options.rebind`) |
| `SubmitRefusedException`, `reason` `'invalid'` | the target is invalid after its validation finished; the handler was not called |
| `SubmitRefusedException`, `reason` `'running'` | a submit of the same action is running; the handler was not called |
| `SubmitFailedException` | the handler threw or rejected; `cause` is the error, and the target is not changed |

Both exceptions extend `AbortEventHandlingException`, which `execute()` resolves with. `execute()` rejects only
where something other than the submit fails, such as another handler in the chain or a `target` callback that
returns no element.

```typescript
const result = await form.confirm();
if (result instanceof SubmitFailedException) reportError(result.cause);
else if (result instanceof SubmitRefusedException) {
  if (result.reason === 'invalid') form.touched = true;
} else if (result) {
  const { sent, received } = result;
}
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

## Widening the value in a subclass

`Action<T extends ActionValue>` takes a wider value type, so a subclass declares accessors for the members it adds
and keeps everything the base class does: the `ExecuteAction` chain, `busy`, `access`, `visibility`, the
conditional actions, the transaction semantics.

`label` and `icon` are `unknown` in `ActionValue` because the rendering library defines what a label and an icon are:
`interface RenderOptions extends ActionValue { label?: string | MdString }` is legal, while a `string` in the base
would reject it.

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

## Inherited members

::: details Inherited from Field
| Member | Description |
|--------|-------------|
| [`bind(data?, overrides?)`](/api/field#bind-data-overrides-this) | Returns a new element of the same class over `data` |
| [`touched`](/api/field#prop-touched) | Interaction flag the element stores; writable |
| [`value`](/api/field#prop-value) | The value the element holds; writable |
:::

::: details Inherited from FieldBase
| Member | Description |
|--------|-------------|
| [`access`](/api/field-base#prop-access) | Whether the element accepts input, what it sends to its container, and whether it is validated |
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
| [`visibility`](/api/field-base#prop-visibility) | How a rendering layer shows the element; writable |
:::

## `NullableAction`

Type alias for `Action | null`.
