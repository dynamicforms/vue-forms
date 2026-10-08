# Action Example

This example shows a complete [`Action`](/api/action): declared with a label and an icon,
enabled by the form's validity through a conditional action, executed, and reporting `busy` while an asynchronous
submit runs.

## Demo

<ActionDemo />

## Why `Action` is not UI-agnostic

`@dynamicforms/vue-forms` describes data and behaviour; the few members that concern the user interface are
listed in [Rationale](/guide/rationale#what-the-library-carries-for-the-interface). `Action` is one of them: its value
is an `ActionValue`: `{ label?, icon?, defaultConfirm?, defaultReject? }`. An action sends nothing to its container's
value.

`Action` represents a *concept*: the element a form's submit, cancel and delete are attached to. The minimal
`{ label, icon }` shape identifies that concept. Without it `Action` would be indistinguishable from `Field`, and a
toolbar would have nothing to bind to.

The shape is minimal because **a UI library is expected to extend it**. `Action<T extends ActionValue>` takes a
wider value type, so a subclass adds accessors that read `this.value.X` and keeps everything the base class does:
the `ExecuteAction` chain, `busy`, `access`, `visibility`, the conditional actions, the transaction semantics.
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

`busy` is form state, not presentation. The library counts the executions that have not settled yet; whether that
renders as a spinner, a disabled button or nothing is up to the application.

## Source Code

### JavaScript/TypeScript

```typescript
import { ref } from 'vue';
import {
  Action,
  ConditionalAccessAction,
  ExecuteAction,
  Field,
  Group,
  Operator,
  Statement,
  ValidChangedAction,
  Validators,
} from '@dynamicforms/vue-forms';

const log = ref([]);

function report(message) {
  log.value = [...log.value, message].slice(-6);
}

// The form the action submits
const form = new Group({
  name: new Field({ value: '', validators: [new Validators.Required()] }),
  email: new Field({
    value: '',
    validators: [new Validators.Pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Please enter a valid email address')],
  }),
});

// A Statement reads field values, and validity is not a field value, so the form's validity is copied into a
// field the statement reads.
const formValid = new Field({ value: false });
form.registerAction(
  new ValidChangedAction((field, supr, newValid, oldValid) => {
    formValid.value = newValid;
    return supr(field, newValid, oldValid);
  }),
);

// The action: a label, an icon, the condition that enables it and the handler that runs
const save = new Action({
  value: { label: 'Submit', icon: 'mdi-content-save' },
  actions: [
    new ConditionalAccessAction(new Statement(formValid, Operator.EQUALS, true)),
    new ExecuteAction(async (field, supr, params) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      if (params.email.endsWith('@example.com')) throw new Error('example.com addresses are not accepted');
      return `registered ${params.email}`;
    }),
  ],
});

async function submit() {
  try {
    report(await save.execute(form.value));
  } catch (error) {
    report(`submit failed: ${error.message}`);
  }
}
```

### Vue Template

```vue
<template>
  <v-btn
    color="primary"
    :prepend-icon="save.icon"
    :disabled="!save.enabled || save.busy"
    :loading="save.busy"
    @click="submit"
  >
    {{ save.label }}
  </v-btn>
</template>
```

## Declaring the action

`new Action({ value: { label, icon } })` is the whole declaration. `label` and `icon` are accessors over the value,
so writing either is an ordinary value change: `ValueChangedAction` fires, `isChanged` reflects it, and a disabled
action takes the write like any other field. `save.label = 'Saving…'` therefore re-renders every template that reads it.

The action is a `Field`, so it has `access` and `visibility` like any other element, and a toolbar renders
`visibility` and `enabled` without knowing what the action does.

## Enabling it from the form's validity

`access`, and with it `enabled`, is set by a `ConditionalAccessAction`, which re-evaluates its `Statement` whenever a field the
statement reads changes. A statement reads field values, and validity is not a field value, so a
`ValidChangedAction` on the form writes the validity into a field, and the statement reads that field. The two
mechanisms are independent of each other.

For a single button, `:disabled="!form.valid"` works as well. Declaring the condition on the action makes it part
of the form definition instead of one template: anything else that renders the action (a toolbar, a menu, a
keyboard shortcut) reads `save.enabled` and does not repeat the condition.

## Executing it

`execute(params?)` runs the `ExecuteAction` chain and returns the chain's return value as a promise. The chain is
entered synchronously, so a handler has already run when the call returns; the promise settles with the handler's
result, awaiting it where the handler returned a promise.

`busy` is `true` from the call until the run settles, whether it resolves or rejects. Overlapping runs are counted,
so it stays `true` until the last of them settles; `:loading="save.busy"` and `:disabled="save.busy"` are
therefore sufficient to prevent a double submit.

::: warning
A handler that throws rejects the promise instead of throwing out of the `execute()` call, except for an
`AbortEventHandlingException`, which the promise resolves with. Await the promise or attach a `.catch()`, as
`submit()` above does; a call that does neither leaves the rejection unhandled, which under Node's default settings
ends the process. A template handler such as `@click="save.execute()"` is safe: Vue attaches its own catch to the
promise an event handler returns and passes the error to `app.config.errorHandler`.
:::

## API Reference

- [Actions → The `Action` class](/api/action): `label`, `icon`, `execute()`, `busy`
- [Actions → `ExecuteAction`](/api/actions#executeaction): the chain `execute()` runs
- [Actions → Conditional actions](/api/actions#conditional-actions): `Statement`, `Operator`, `ConditionalAccessAction`
- [Actions → `ValidChangedAction`](/api/actions#validchangedaction): the validity the condition reads

## Key Features Demonstrated

- **Declared once**: label, icon, condition and handler all live on the action
- **Conditional enablement**: the form's validity sets `enabled` through a `Statement`
- **Asynchronous execution**: `execute()` returns a promise and awaits the handler
- **`busy`**: form state a button binds to, cleared whether the run resolves or rejects
- **Failure**: a throwing handler rejects the promise the caller receives; an `AbortEventHandlingException` resolves it

## Try It Yourself

1. Leave the name empty: the button stays disabled
2. Fill both fields: the button becomes enabled
3. Submit: `busy` is `true` for the duration of the run
4. Submit an `@example.com` address: the log shows the error the handler threw

<script setup>
import ActionDemo from '../components/action-demo.vue';
</script>
