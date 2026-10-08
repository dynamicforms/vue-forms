# Field

`Field<T>` represents a single typed form value. It extends [`FieldBase`](/api/field-base), which defines every
member of a field; this page describes what `Field` implements. It is constructed with `new`, like `Action`,
`Group` and `List`, and every read through it (`field.value`, `field.valid`, `field.errors`) is tracked by Vue.

[The model](/guide/model) describes how the parts of the library fit together.

## Creating a field

```typescript
import { Field } from '@dynamicforms/vue-forms';

const name = new Field({ value: 'John' });
const age  = new Field<number>({ value: 30 });
```

## `new Field<T>(params?)`

`params` is an [`IFieldParams<T, X>`](/api/field-base#ifieldparams-t-x) and is optional. It contains the members
below, plus the [extended properties](/api/field-base#extended-properties) the field's second type argument
declares. `access`, `actions`, `errors`, `touched`, `validators` and `visibility` are the parameters every element
takes; see [Constructor parameters](/api/field-base#constructor-parameters), which also describes the order in which
they are applied and which parameters are rejected.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params.originalValue` | `T` | same as `value` | Baseline for `isChanged`, and the initial value when no `value` is given |
| `params.value` | `T` | `undefined` | Initial value. Leaving it out, or passing `undefined`, falls back to `originalValue`; an explicit `null` is kept as the value |

The first generic argument is inferred from `params.value`, so `new Field({ value: 'John' })` is a `Field<string>`
and `new Field()` is a `Field<any>`. Pass it explicitly when the initial value does not pin the type you want:
`new Field<number | null>({ value: null })`. The second type argument is never inferred; see
[extended properties](/api/field-base#extended-properties).

## Properties

| Property | Type | Writable | Description |
|----------|------|----------|-------------|
| <a id="prop-touched"></a>`touched` | `boolean` | yes | Overrides [`FieldBase.touched`](/api/field-base#prop-touched): the field stores the flag and returns the value last assigned, or `params.touched` |
| <a id="prop-value"></a>`value` | `T` | yes | Overrides [`FieldBase.value`](/api/field-base#prop-value): the single value the field holds. A write is accepted whatever the access; the value the field ends up holding depends on [what is registered on the field](#writing-the-value). Values are compared by identity, so `ValueChangedAction` fires for a new object even when it is deeply equal to the old one, and does not fire when the field is assigned the object it already holds. Assign a modified copy instead of mutating in place. `isChanged` is separate and uses deep equality. |

## Writing the value

The value a field holds after a write to `value` depends on the actions registered on it. A `ValueChangedAction`
may write another value back (a rule that trims, rounds or caps), and a handler that throws reverts the whole write
and rethrows, so the field keeps its previous value. The write itself is not intercepted: there is no
`ValueChangingAction` corresponding to `AccessChangingAction` and `VisibilityChangingAction`; `ValueChangedAction`
runs after the value is stored. Inside an open `transaction()` the handlers run at the commit, so the final value is
known once the outermost `transaction()` call returns.

Read the field back to get the value it holds:

```typescript
field.value = typed;
if (field.value !== typed) {
  // the field holds something other than what was written
}
```

### What a rendering layer sees

Where the field ends up holding a value that differs from both the written value and its previous value, every
read of it updates: a `computed`
over `field.value` returns the new value, an effect that reads it re-runs, and a control rendering from either
re-renders.

Where the field ends up holding the value it held before the write, no read updates. A write of the value the field
already holds does not write the reactive slot. A rule that restores the previous five characters after a
six-character write, and a handler that throws, both leave the slot holding its previous value. In each case a
`computed` over `field.value` returns the same value as before, so nothing rendering through it re-runs; an effect
reading the field directly re-runs where the slot was written and restored, and reads the same value both times.

The control already shows what was typed: a native input holds the text in its own DOM before the input event is
dispatched to the field. Since no read updates, the control is not re-rendered and shows a value the field does not
hold until an unrelated change re-renders it. In the example, the field holds five characters and the input shows
six.

**A binding layer must handle this case itself.** The read the control renders from must update even where the
field did not, by returning the written value for one tick and the field's value from the next one:

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

Wherever the field holds something other than what was written (another value, or the value it already held), the
read returns the written value for the rest of that tick and the field's value from the next one. The second change
re-renders the control, so it shows what the field holds whether or not the field's value changed. The `finally`
covers a handler that throws: the exception propagates to the caller and the read is still corrected.
`@dynamicforms/vuetify-inputs` implements this in
[`useInputBase()`](https://github.com/dynamicforms/vuetify-inputs/blob/main/src/helpers/input-base.ts), which every
input in that library uses.

## Methods

### `bind(data?, overrides?): this`

Overrides [`FieldBase.bind()`](/api/field-base#bind-data-overrides-fieldbase-t-x), which describes `overrides`,
the copied actions and extended properties, the construction through `this.constructor` and the detached result.
The new field holds `data`, or this field's value where `data` is `undefined`, and is typed as the class `bind()`
is called on.

## Inherited from FieldBase

| Member | Description |
|--------|-------------|
| [`access`](/api/field-base#prop-access) | Whether the element accepts input, what it sends to its container, and whether it is validated |
| [`beginValidating() / endValidating()`](/api/field-base#beginvalidating-void-endvalidating-void) | Increment and decrement the asynchronous validation counter behind `validating` |
| [`bindingsOf(declaration)`](/api/field-base#bindingsof-declaration-fieldbase) | Returns every element in the subtree whose `declaration` is the one given |
| [`busy`](/api/field-base#prop-busy) | `true` while an `Action.execute()` at or below the element has not settled |
| [`clearValidators()`](/api/field-base#clearvalidators-void) | Removes the element's validators and empties `errors` |
| [`contribution`](/api/field-base#prop-contribution) | What the element sends to its container's `value` |
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

## `NullableField<T>`

Type alias for `Field<T> | null`.

---

> See also: [FieldBase](/api/field-base), [Basic Form example](/examples/basic-form),
> [Validators example](/examples/validators)
