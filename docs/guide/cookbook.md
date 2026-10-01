# Cookbook

Short, standalone recipes for things a form needs once it goes past a handful of fields. Each one assumes you know
[the model](/guide/model); the rules behind the recipes about what a form sends are stated in
[What a container serializes](/api/container#what-a-container-serializes).

## Loading a record

You want the form to show a record the server sent.

```typescript
form.value = record;
```

Every member takes its value, whatever its access or visibility at that moment — a disabled field takes a write
like any other, so the order in which the form's own rules switch fields does not matter. A key the record leaves out keeps
what the member held; `null` for a container empties it.

Where the record should also become the baseline `isChanged` compares against — the form is freshly loaded, not
edited — use `rebind()` instead:

```typescript
form.rebind(record);
```

It writes the record, starts the change history over and re-runs validation, and it takes a key the record leaves
out from the form's declaration rather than from whatever the form held a moment ago.

Loading does not decide what is sent or shown. `{ billing: null }` empties the billing address and leaves its access
as the form's own rule has it; where the form should follow the data, state it in the rule — see
[An optional section](#an-optional-section).

## Submitting

You want a submit that waits for asynchronous validation, sends only a valid form, and leaves the form unchanged
once the server has taken it.

```typescript
async function submit() {
  await form.settled();
  if (!form.valid) return;
  const saved = await api.save(form.value);
  form.rebind(saved);
}
```

```vue
<button :disabled="!form.valid || form.validating || form.busy" @click="submit">Save</button>
```

[`settled()`](/api/field#settled-promise-void) resolves once no validation and no `Action.execute()` is running at
or below the form. `form.value` is the payload: `'disabled'` members are left out and `'disabled-null'` ones are
`null`. `rebind(saved)` makes what the server stored the new baseline, so `isChanged` is `false` again.

## Showing errors the server returned

You want a field to show an error the server reported for it, and the error to go away on the next submit.

```typescript
function showServerErrors(form: Group, errors: Record<string, string>) {
  Object.entries(errors).forEach(([name, message]) => {
    const field = form.field(name);
    if (field) field.errors = [...field.errors, new ValidationErrorText(message, '', 'server-error', 'server')];
  });
}

function clearServerErrors(form: Group) {
  Object.values(form.fields).forEach((field) => {
    field.errors = field.errors.filter((error) => error.origin !== 'server');
  });
  form.validate();
}
```

An error written into `errors` makes the field and the form invalid at once, and it stays: a validator withdraws only
the errors it produced itself, so neither a new value nor `validate(true)` removes it. Its
[origin](/api/validators#origin), `'server'`, is what lets `clearServerErrors()` withdraw exactly those errors and
leave the validators' own and any the application wrote. Call `clearServerErrors(form)` before sending again. Both
take the form as a `Group`, so they serve every form of the application.

## Warning before leaving a changed form

You want to ask before the user navigates away from unsaved changes.

```typescript
window.addEventListener('beforeunload', (event) => {
  if (form.isChanged) event.preventDefault();
});
```

`isChanged` compares what the form holds against `originalValue`, the baseline `rebind()` sets. A form loaded with
`rebind(record)` and saved with `rebind(saved)`, as above, reports `false` exactly while nothing has been edited
since.

## Clearing and resetting a form

You want to put a form back to what it was declared with, or empty it. No element has a `clear()` method: a `Group`
and a `List` have an empty state of their own, and a `Field`'s empty value — an empty string, a zero, `false` —
depends on its `T`. [`rebind()`](/api/field#rebind-data-this) covers both:

```typescript
group.rebind(group.originalValue);   // back to what the group was declared with
group.rebind(null);                  // empty — every member set to null
field.rebind(field.originalValue);   // back to what the field was declared with
field.rebind('');                    // an explicit empty value of the field's own type
list.rebind(list.originalValue);     // back to the rows the list was declared with
list.rebind(null);                   // empty — every row released
```

Each call re-baselines `originalValue`, resets `touched` to `false`, clears the element's own errors and re-runs
validation over the result, so a form reset this way reports what the data it landed on calls for. `List.clear()`
releases the rows but touches none of that state; `list.rebind(null)` is the one to use where a fresh verdict
matters. `group.value = {}` is not a reset: the setter patches by key, and a key the object does not carry is left
as it was.

Emptying a `Group` writes `null` into every member underneath it, whatever the member's own `T` allows: a
`Field<string>` inside a cleared group holds `null` at runtime while its type says `string`. A form meant to be
cleared this way declares the fields it reaches as `T | null`; one that keeps a stricter type resets field by field.
A field can carry its own empty value as an [extended property](/api/field#extended-properties):

```typescript
interface Emptyable<T> { emptyValue: T }

const amount = new Field<number, Emptyable<number>>({ value: 10, emptyValue: 0 });
amount.rebind(amount.extra.emptyValue!);   // 0, with the usual reset
```

`extra` reads back `Readonly<Partial<X>>`, so `emptyValue` is `number | undefined` to the type checker and the `!`
states what the field's parameters guarantee. Clearing a whole group this way is a walk over `group.fields` that
reaches for each member's `extra.emptyValue` where one is declared.

## Fields that depend on a type

You want a form whose fields depend on a kind — a label element that is text or an image, a payment by card or by
transfer — to show and send only the fields that apply.

```typescript
watchEffect(() => {
  const image = form.fields.kind.value === 'image';
  form.fields.src.access = image ? 'editable' : 'disabled';
  form.fields.text.access = image ? 'disabled' : 'editable';
  form.fields.src.visibility = image ? 'full' : 'suppress';
  form.fields.text.visibility = image ? 'suppress' : 'full';
});
```

`access` decides what is sent and `visibility` what is drawn, so the rule states both. A `'disabled'` field is not
sent and its validators do not run, so a required field that does not apply blocks nothing. It keeps what it holds,
so switching the kind back brings it back as it was. Where the server should instead clear what it holds for a
field that does not apply, use `'disabled-null'`: the field is sent as `null`.

## An optional section

You want a section the user switches on and off — an invoice address that may be the same as the delivery one, a
company that may or may not be named on the order — to be sent as `null` while it is off, and to keep what was
entered.

```typescript
const billing = new Group({
  street: new Field({ value: '', validators: [new Validators.Required()] }),
  city: new Field({ value: '', validators: [new Validators.Required()] }),
});
const form = new Group({ customer: new Field({ value: 'Ada' }), billing });

const separateBilling = ref(false);
watchEffect(() => {
  billing.access = separateBilling.value ? 'editable' : 'disabled-null';
  billing.visibility = separateBilling.value ? 'full' : 'hidden';
});

form.value;   // { customer: 'Ada', billing: null } while separateBilling is false
```

A section sent as `null` sends none of its fields, so their validators do not run: the required street does not
block the submit while the section is off, and it is checked again the moment the section is on. Where the section
should follow a loaded record, the rule states it:

```typescript
form.value = record;
separateBilling.value = record.billing != null;
```

Where there is no switch and the section is optional as a whole — nothing entered sends `null`, but a section the
user started filling in has to be complete — the rule reads the section itself:

```typescript
watchEffect(() => {
  const started = Object.values(billing.fields).some((field) => !isEmpty(field.value));
  billing.access = started ? 'editable' : 'disabled-null';
});
```

## A field or a section that is shown but not editable

You want something the user sees but cannot change. Two accesses do that, and they differ in what is sent: a
`'readonly'` field is sent with its value, the way an `<input readonly>` is submitted, and a `'disabled'` one is left
out, the way an `<input disabled>` is. Both still take a write from code, so loading a record fills them.

A container's access applies to everything inside it. Below a `'readonly'` group an `'editable'` field is
`'readonly'`, and below a `'disabled'` or `'disabled-null'` one nothing is sent and nothing is validated. The member
keeps the access it was given; what applies is its `effectiveAccess`, and what a rendering layer binds to draw every
input of such a section without input is `effectiveEnabled`, which is `true` where `effectiveAccess` is
`'editable'`:

```vue
<df-input :disabled="!field.effectiveEnabled" :control="field" />
```

The read is tracked like every other read through an element, so switching a group re-renders the inputs of every
member below it without anything walking the tree.

## A section that follows its members

You want a section to drop out of the payload, or to be sent as `null`, while none of its fields is enabled. A
container is not switched off when every child is, so one effect states it — which access depends on what the
payload should say:

```typescript
// the key is left out while no member is enabled
watchEffect(() => {
  address.access = Object.values(address.fields).some((field) => field.enabled) ? 'editable' : 'disabled';
});

// the key is sent as null while no member is enabled
watchEffect(() => {
  address.access = Object.values(address.fields).some((field) => field.enabled) ? 'editable' : 'disabled-null';
});
```

## A rule that reads another field of the record

You want a validator on one field that reads a second field of the same record — the unit price that is required
while the quantity next to it in a `List` row is above zero.

```typescript
lineItem.fields.unitPrice.registerAction(new Validators.Validator((newValue, oldValue, field) => {
  const row = field.parent;
  if (!(row instanceof Group)) {
    field.markRecordIncomplete();
    return null;
  }
  return row.fields.quantity.value > 0 && newValue == null
    ? [new ValidationErrorText('Unit price is required when quantity is above zero')]
    : null;
}));

// the rule spans two fields, so a new quantity sends the unit price of the same row through its validators again
lineItem.fields.quantity.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  const result = supr(field, newValue, oldValue);
  if (field.parent instanceof Group) field.parent.fields.unitPrice.validate(true);
  return result;
}));
```

The field's `parent` is typed [`Container`](/api/container#parent), so the check narrows it to a `Group` before
reading `fields`. The check also answers whether the row exists yet: a row is built member by member, and a
member's first run happens before it has a row. Reaching nothing there is no verdict, not a pass —
[`markRecordIncomplete()`](/api/field#markrecordincomplete-void) says so, and the row runs the validator again once
it holds its members and the data it was built with.

A validator runs when its own field changes, so the second action is what keeps the verdict right when the other
half of the rule changes: a quantity edited after the row exists.

A rule comparing two fields by name needs none of this: [`CompareTo`](/api/validators#new-validators-compareto-otherfield-isvalidcomparison-message)
resolves the other field in the record it runs in and follows it. The
[List example](/examples/list#reaching-a-sibling-field) runs these two actions in a form.

## A list of plain values

You want a list of strings or numbers rather than a list of records.

```typescript
const tags = new List(new Field<string>({ validators: [new Validators.Required()] }));
tags.push('urgent');
tags.value;   // ['urgent'], and [] while the list holds no rows
```

Every row is a `Field` bound from the template, so every tag carries the `Required` validator, and a row binds to an
input through `tag.value`. A list of lists is `new List(new List(...))`. The
[List example](/examples/list) shows both in a running form.

## Application state

You want state that is not a form on screen — a shopping cart, say, with its items, a coupon and a delivery address
— kept with the same reactivity, transactions and validation a form has. Build it once as a group, and read it
through [`view()`](/api/view):

```typescript
import { computed, watchEffect } from 'vue';
import { Field, Group, List, Validators, view } from '@dynamicforms/vue-forms';

export function createCart() {
  const cart = view(new Group({
    items: new List(new Group({
      sku: new Field({ value: '' }),
      name: new Field({ value: '' }),
      price: new Field({ value: 0 }),
      quantity: new Field({ value: 1, validators: [new Validators.MinValue(1)] }),
    })),
    coupon: new Field<string | null>({ value: null }),
    pickup: new Field({ value: false }),
    delivery: new Group({
      street: new Field({ value: '', validators: [new Validators.Required()] }),
      city: new Field({ value: '', validators: [new Validators.Required()] }),
    }),
  }));
  // a cart collected in the shop sends no delivery address, and keeps the one typed in
  watchEffect(() => {
    cart.$.fields.delivery.access = cart.pickup ? 'disabled-null' : 'editable';
  });
  return cart;
}

const cart = createCart();
const total = computed(() =>
  (cart.items ?? []).reduce((sum, item) => sum + (item?.price ?? 0) * (item?.quantity ?? 0), 0));

cart.items!.push({ sku: 'm-1', name: 'Mug', price: 12, quantity: 2 });
cart.items!.sort((a, b) => a!.name!.localeCompare(b!.name!));
cart.coupon = 'SPRING';
```

The list's view is an array whose mutations are the list's own, so a sort moves the rows themselves. Every read is
tracked on the field it reaches: `watch(() => cart.coupon, …)` runs when the coupon changes and not when a quantity
does, and `total` follows the prices and quantities. While the cart is collected in the shop, `cart.$.value` sends
`delivery: null` and the address is not validated, so it does not hold `cart.$.valid` back; switching back to
delivery brings the address back as it was typed, and checks it.

`createCart()` builds a cart wherever it is called, so where the state lives is the caller's choice — a module, a
`provide()` in the component that owns it, or anywhere else — and a test builds a cart of its own.
