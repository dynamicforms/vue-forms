# Action Example

This example demonstrates [`Action`](/api/actions#the-action-class) end to end: declared with a label and an icon,
enabled by the form's validity through a conditional action, executed, and reporting `busy` while an asynchronous
submit runs.

## Demo

<ActionDemo />

## Why `Action` is not UI-agnostic

Everything else in `@dynamicforms/vue-forms` describes data and behaviour and says nothing about rendering.
`Action` is the deliberate exception: its value is an `ActionValue`, the pair `{ label?, icon? }`.

It exists as a *concept* — the element a form's submit, cancel and delete hang on — and the minimal `{ label, icon }`
shape is the affordance that makes that concept legible. Without it `Action` would be indistinguishable from
`Field`, and there would be nothing for a toolbar to bind to.

The shape is deliberately minimal because **a UI library is expected to extend it**. `Action<T extends ActionValue>`
takes a wider value type, so a subclass adds accessors that read `this.value.X` and keeps everything the base class
does — the `ExecuteAction` chain, `busy`, `enabled`, `visibility`, the conditional actions, the transaction
semantics. `label` and `icon` are members `Action` declares, and both reach its value, so a subclass reading either
in a shape of its own narrows the getter and declares the setter beside it, delegating to the base — a getter
declared alone leaves the property without a setter and the documented write throws a `TypeError`. The rules are in
[Widening the value in a subclass](/api/actions#widening-the-value-in-a-subclass).
`@dynamicforms/vuetify-inputs` does exactly that: its `Action` widens the value with render options and
per-breakpoint variants, and adds `renderAs`, `showLabel`, `showIcon`, confirmation defaults and passthrough
attributes on top. Its
[df-actions page](https://docs.velis.si/dynamicforms/vuetify-inputs/examples/df-actions.html) shows what an
action declared here renders as there; its
[responsive render options](https://docs.velis.si/dynamicforms/vuetify-inputs/examples/responsive-render-options.html)
are the per-breakpoint half of the widened value.

`busy` is the other half of the same line: it is form state, not presentation. The library counts the executions
that have yet to settle; deciding whether that renders as a spinner, a disabled button or nothing at all stays
yours.

## Source Code

### JavaScript/TypeScript

```typescript
import { ref } from 'vue';
import {
  Action,
  ConditionalEnabledAction,
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

// Validity is a verdict rather than a value, and a Statement reads values, so the form's verdict is mirrored
// into a field the statement can read.
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
    new ConditionalEnabledAction(new Statement(formValid, Operator.EQUALS, true)),
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
so writing either is an ordinary value change: `ValueChangedAction` fires, `isChanged` answers over it, and a
disabled action refuses the write. `save.label = 'Saving…'` therefore repaints every template reading it.

The action is a `Field`, so it carries `enabled` and `visibility` like any other element, and a toolbar renders
`visibility` and `enabled` without knowing what the action does.

## Enabling it from the form's validity

`enabled` is driven by a `ConditionalEnabledAction`, which re-evaluates its `Statement` whenever a field the
statement reads changes. Validity is a verdict rather than a value, and a statement reads values — so a
`ValidChangedAction` on the form writes the verdict into a field, and the statement reads that field. The two
mechanisms compose without either knowing about the other.

Writing the button's `:disabled` as `!form.valid` would work just as well for one button. Declaring it on the
action is what makes the rule part of the form definition rather than of one template: anything else that renders
the action — a toolbar, a menu, a keyboard shortcut — reads `save.enabled` and needs no copy of the condition.

## Executing it

`execute(params?)` runs the `ExecuteAction` chain and answers what the chain returned, as a promise. The chain is
entered synchronously, so a handler has already run by the time the call returns; the promise settles with what the
handler produced, awaiting it where the handler returned a promise of its own.

`busy` is `true` from the call until the run settles, however it settles. Overlapping runs are counted, so it
stands until the last of them is done — which is what makes `:loading="save.busy"` and `:disabled="save.busy"`
enough to keep a user from submitting twice.

::: warning
A handler that throws rejects the promise instead of throwing out of the `execute()` call. Await it or attach a
`.catch()`, as `submit()` above does; a call that does neither leaves the rejection unhandled, which under node's
default settings ends the process. A template handler such as `@click="save.execute()"` is safe — Vue attaches its
own catch to the promise an event handler returns and routes the error to `app.config.errorHandler`.
:::

## API Reference

- [Actions → The `Action` class](/api/actions#the-action-class) — `label`, `icon`, `execute()`, `busy`
- [Actions → `ExecuteAction`](/api/actions#executeaction) — the chain `execute()` runs
- [Actions → Conditional actions](/api/actions#conditional-actions) — `Statement`, `Operator`, `ConditionalEnabledAction`
- [Actions → `ValidChangedAction`](/api/actions#validchangedaction) — the verdict the condition is fed from

## Key Features Demonstrated

- **Declared once**: label, icon, condition and handler all live on the action
- **Conditional enablement**: the form's verdict drives `enabled` through a `Statement`
- **Asynchronous execution**: `execute()` answers a promise and awaits the handler
- **`busy`**: form state a button binds to, cleared whether the run resolves or rejects
- **Failure**: a throwing handler rejects the promise the caller holds

## Try It Yourself

1. Leave the name empty and watch the button stay disabled
2. Fill both fields and watch it enable itself
3. Submit and watch `busy` hold for the length of the run
4. Submit an `@example.com` address and read the rejection the handler produced

<script setup>
import ActionDemo from '../components/action-demo.vue';
</script>
