# Action Example

This example shows a form with an actions bar: a Submit and a Cancel [`Action`](/api/action) in a `Group` inside
the form. Submit runs a [`SubmitAction`](/api/action#submitaction-target-handler-options), Cancel a
[`RejectAction`](/api/action#rejectaction-target), and Enter and Escape reach them through the form's `confirm()`
and `reject()`.

## Demo

<ActionDemo />

## What the demo shows

- **An actions bar.** `actions` is a `Group` of two actions inside the form. An action sends nothing, so
  `form.value` is `{ name, email }`, and the template renders the bar with one `v-for` over its fields, from each
  action's `label`, `icon`, `executable` and `busy`.
- **`executable`.** A button is disabled while its action is not executable. `SubmitAction` makes Submit executable
  while the form is valid and not `pending`, so Submit is disabled while a field is invalid and while the submit
  runs. Cancel is executable whatever the form's validity.
- **Enter and Escape.** The form's `keydown` handlers call `form.confirm()` and `form.reject()`. Each finds the
  action whose `SubmitAction` or `RejectAction` targets the form and executes it if it is executable;
  `confirm()` returns `undefined` where it executes nothing.
- **Outcomes.** A submit resolves with a `SubmitResult` (`sent` and `received`), a `SubmitFailedException` where
  the handler failed, or a `SubmitRefusedException` where the submit was refused before the handler ran. The log
  shows each. A refusal does not occur through the buttons or Enter, which run only an executable action;
  "Call submit.execute() directly" bypasses that check: on an invalid form it is refused with the reason
  `'invalid'`, and a second call during a run with the reason `'running'`.
- **A server error on a field.** The handler waits 1.2 seconds, as a request would. For an `@example.com` address it
  writes a [`ValidationError`](/api/validators#validationerror) with the origin `'server'` to the email field and
  throws, so the submit ends with a `SubmitFailedException` and the field shows the error. A `ValueChangedAction` on
  the email field withdraws the errors of that origin when the address changes.
- **Rebinding.** Otherwise the handler returns the record as stored (name trimmed, email lower-cased), and
  `SubmitAction` rebinds the form to it: the inputs show the stored record and `isChanged` is `false`. Cancel
  rebinds the form to its `originalValue`.
- **`busy` and the lock.** `SubmitAction` makes the form `'readonly'` while the submit runs, so the inputs, bound to
  `effectiveEnabled`, accept no input for that time; the form is `busy` meanwhile.

## Source Code

<<< @/components/action-demo.vue

## What `Action` carries for the interface

`@dynamicforms/vue-forms` describes data and behaviour; the few members that concern the user interface are
listed in [Rationale](/guide/rationale#what-the-library-carries-for-the-interface). `Action` is one of them. It is
the element a form's commands (submit, cancel, delete) are attached to, and its value is an `ActionValue`:
`{ label?, icon?, defaultConfirm?, defaultReject? }`. An action sends nothing to its container's value.

What an action does is form behaviour, and the library implements it: `execute()` runs the `ExecuteAction` chain,
`busy` counts the runs that have not settled, `executable` combines access, visibility, `busy` and each handler's
`canExecute()`, `SubmitAction` waits for validation, refuses an invalid form and rebinds the form to the result, and
`RejectAction` puts the form back to its baseline. `confirm()` and `reject()` find these actions by their targets.
`busy` is form state: whether it renders as a spinner, a disabled button or nothing is up to the application.

The `{ label, icon }` shape is the part a renderer reads, and a UI library extends it. `Action<T extends ActionValue>`
takes a wider value type, so a subclass adds accessors that read `this.value.X` and keeps everything the base class
does: the `ExecuteAction` chain, `busy`, `access`, `visibility`, the conditional actions, the transaction semantics.
`label` and `icon` are members `Action` declares, and both are stored in its value, so a subclass that reads either
in its own shape narrows the getter and declares the setter beside it, delegating to the base. A getter declared
alone leaves the property without a setter, and the documented write throws a `TypeError`. The rules are in
[Widening the value in a subclass](/api/action#widening-the-value-in-a-subclass).
`@dynamicforms/vuetify-inputs` does this: its `Action` widens the value with render options and per-breakpoint
variants, and adds `renderAs`, `showLabel`, `showIcon`, confirmation defaults and passthrough attributes. Its
[df-actions page](https://docs.velis.si/dynamicforms/vuetify-inputs/examples/df-actions.html) shows how an action
declared with this library renders there; its
[responsive render options](https://docs.velis.si/dynamicforms/vuetify-inputs/examples/responsive-render-options.html)
are the per-breakpoint part of the widened value.

## Declaring the action

`new Action({ value: { label, icon } })` declares an action. `label` and `icon` are accessors over the value,
so writing either is an ordinary value change: `ValueChangedAction` fires, `isChanged` reflects it, and a disabled
action takes the write like any other field. `submit.label = 'Saving…'` therefore re-renders every template that
reads it. `defaultConfirm` and `defaultReject` mark the action `confirm()` or `reject()` executes where no
`SubmitAction` or `RejectAction` targets the container.

The action is a `Field`, so it has `access` and `visibility` like any other element, and a toolbar renders
`visibility` and `executable` without knowing what the action does.

## Executing it

`execute(params?)` runs the `ExecuteAction` chain and returns the chain's return value as a promise. The chain is
entered synchronously, so a handler has already run when the call returns; the promise settles with the handler's
result, awaiting it where the handler returned a promise. `execute()` does not check `executable`.

`busy` is `true` from the call until the run settles, whether it resolves or rejects. Overlapping runs are counted,
so it stays `true` until the last of them settles.

The outcomes of a submit are resolved values: `SubmitFailedException` and `SubmitRefusedException` extend
`CommandException`, which extends [`AbortEventHandlingException`](/api/actions#aborteventhandlingexception), and
`execute()` resolves with an `AbortEventHandlingException` a handler throws. Any other exception a handler throws
rejects the promise.

::: warning
Await the promise or attach a `.catch()`, as `settle()` in the demo does; a call that does neither leaves a
rejection unhandled, which under Node's default settings ends the process. A template handler such as
`@click="save.execute()"` passes the rejection to `app.config.errorHandler`: Vue attaches its own catch to the
promise an event handler returns.
:::

## API Reference

- [Action](/api/action): `label`, `icon`, `execute()`, `busy`, `executable`, `SubmitAction`, `RejectAction`
- [Container → `confirm()`](/api/container#confirm-params-promise-any-undefined) and
  [`reject()`](/api/container#reject-params-promise-any-undefined)
- [Actions → `ExecuteAction`](/api/actions#executeaction): the chain `execute()` runs
- [Validators → `origin`](/api/validators#origin): the origin of an error written by the application
- [Cookbook → Showing errors the server returned](/guide/cookbook#showing-errors-the-server-returned)

## Try It Yourself

1. Leave the name empty: Submit is disabled, and Enter executes nothing
2. Fill both fields and submit: `busy` is `true` for the duration of the run, and the log shows the `SubmitResult`
3. Submit an `@example.com` address: the email field shows the server's error and the log shows the
   `SubmitFailedException`
4. Edit a field, then press Escape: Cancel puts the form back to its baseline
5. Empty the name and call `submit.execute()` directly: the log shows the `SubmitRefusedException`

<script setup>
import ActionDemo from '../components/action-demo.vue';
</script>
