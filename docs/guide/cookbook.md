# Cookbook

Short, standalone recipes for forms with more than a few fields. Each one assumes you know
[the model](/guide/model). The rules for what a form sends are in
[What a container serializes](/api/container#what-a-container-serializes).

## Loading a record

You want the form to show a record the server sent.

```typescript
form.value = record;
```

Every member is written, whatever its access or visibility at that moment. A disabled field is written like any
other, so the order in which the form's rules switch fields does not matter. A key missing from the record keeps
what the member held; `null` for a container empties it.

Where the record should also become the baseline for `isChanged` (the form is freshly loaded, not edited), use
`rebind()`:

```typescript
form.rebind(record);
```

It writes the record, starts the change history over and re-runs validation. A key missing from the record takes
its value from the form's declaration.

Loading does not change what is sent or shown. `{ billing: null }` empties the billing address and leaves its access
as the form's rule sets it. Where access should follow the data, the rule must read the data; see
[An optional section](#an-optional-section).

## Submitting

You want a submit that waits for asynchronous validation, sends only a valid form, and marks the form unchanged
once the server has saved it.

```typescript
async function submit() {
  await form.settled();
  if (!form.valid) return;
  const saved = await api.save(form.value);
  form.rebind(saved);
}
```

```vue
<button :disabled="!form.valid || form.pending" @click="submit">Save</button>
```

[`settled()`](/api/field-base#settled-promise-void) resolves once no validation and no `Action.execute()` is running at
or below the form. The handler awaits it although the button is disabled on `pending`: the click can start a
validation in the same event, when the blur of an input commits its value. `form.value` is the payload: `'disabled'` members are left out and `'disabled-null'` ones are
`null`. `rebind(saved)` makes what the server stored the new baseline, so `isChanged` is `false` again. It also
replaces what the form holds, so an edit made while the request runs is lost; the inputs are disabled until the
request returns.

The same submit as an action of the form, with a cancel beside it in a bar of actions:

```typescript
const form = new Group({
  name: new Field({ value: '', validators: [new Validators.Required()] }),
  actions: new Group({
    save: new Action({
      value: { label: 'Save', defaultConfirm: true },
      actions: [new SubmitAction((action) => action.parent?.parent, (value) => api.save(value))],
    }),
    cancel: new Action({
      value: { label: 'Cancel', defaultReject: true },
      actions: [new RejectAction((action) => action.parent?.parent)],
    }),
  }),
});
```

```vue
<input v-model="form.fields.name.value" :disabled="form.busy" />
<button :disabled="!form.fields.actions.fields.save.executable" @click="form.confirm()">Save</button>
```

[`SubmitAction`](/api/action#submitaction-target-handler-options) does what `submit()` above does and resolves with
`{ action, sent, received }`, or with a `SubmitFailedException` where nothing was saved; a `SubmitRefusedException`,
a subclass of it, says the submit was refused before the handler ran. `executable` is `false` while the form is
invalid, a validation is running or the submit is running. `form.busy` is `true` while the submit runs, so the input
above is disabled until the form is rebound to the result. `form.confirm()` and `form.reject()` find the two actions by their targets, so a dialog binds
Enter and Escape to them. The bar of actions sends nothing, so `form.value` is `{ name: … }`.

## Showing errors the server returned

You want a field to show an error the server reported for it, and the error to go away on the next submit.

```typescript
function showServerErrors(form: Group, errors: Record<string, string>) {
  Object.entries(errors).forEach(([name, message]) => {
    const field = form.field(name);
    if (field) field.errors = [...field.errors, new ValidationError('server_error', {}, message, 'server')];
  });
}

function clearServerErrors(form: Group) {
  Object.values(form.fields).forEach((field) => {
    field.errors = field.errors.filter((error) => error.origin !== 'server');
  });
  form.validate();
}
```

An error written into `errors` makes the field and the form invalid immediately, and it stays: a validator removes
only the errors it produced, so neither a new value nor `validate(true)` removes it. `clearServerErrors()` filters
on the [origin](/api/validators#origin) `'server'`, so it removes exactly those errors and keeps the validators'
errors and any other errors the application wrote. Call `clearServerErrors(form)` before sending again. Both
functions take the form as a `Group`, so they work for every form of the application.

## Warning before leaving a changed form

You want to ask before the user navigates away from unsaved changes.

```typescript
window.addEventListener('beforeunload', (event) => {
  if (form.isChanged) event.preventDefault();
});
```

`isChanged` compares the form's value with `originalValue`, the baseline `rebind()` sets. For a form loaded with
`rebind(record)` and saved with `rebind(saved)`, as above, `isChanged` is `false` exactly while nothing has been
edited since.

## Clearing and resetting a form

You want to put a form back to its declared values, or empty it. `Group` and `Field` have no `clear()` method: a
`Group` and a `List` have their own empty state, and a `Field`'s empty value (an empty string, a zero, `false`)
depends on its `T`. [`rebind()`](/api/field-base#rebind-data-this) does both:

```typescript
group.rebind(group.originalValue);   // back to what the group was declared with
group.rebind(null);                  // empty: every member set to null
field.rebind(field.originalValue);   // back to what the field was declared with
field.rebind('');                    // an explicit empty value of the field's own type
list.rebind(list.originalValue);     // back to the rows the list was declared with
list.rebind(null);                   // empty: every row released
```

Each call sets `originalValue` to the new data, resets `touched` to `false`, clears the element's own errors and
re-runs validation, so the validation result matches the new data. A reset restores data, not state: `access` and
`visibility` stay as they are. `group.originalValue` leaves a `'disabled'` member out, and the member is put back to
its own baseline. A `'disabled'` row of a list is not in `list.originalValue`, so `list.rebind(list.originalValue)`
does not restore it. `List.clear()` releases the rows and changes none
of that state; use `list.rebind(null)` where a new validation result is needed. `group.value = {}` is not a reset:
the setter patches by key, and a key missing from the object keeps its value.

Emptying a `Group` writes `null` into every member below it, whatever the member's `T` allows: a `Field<string>`
inside a cleared group holds `null` at runtime while its type is `string`. A form that is cleared this way declares
its fields as `T | null`; a form with stricter types resets field by field.
A field can carry its own empty value as an [extended property](/api/field-base#extended-properties):

```typescript
interface Emptyable<T> { emptyValue: T }

const amount = new Field<number, Emptyable<number>>({ value: 10, emptyValue: 0 });
amount.rebind(amount.extra.emptyValue!);   // 0, with the usual reset
```

`extra` is typed `Readonly<Partial<X>>`, so `emptyValue` is `number | undefined` to the type checker; the `!`
asserts what the field's parameters guarantee. To clear a whole group this way, iterate over `group.fields` and
rebind each member that declares `extra.emptyValue`.

## Fields that depend on a type

You want a form whose fields depend on a kind (a label element that is text or an image, a payment by card or by
transfer) to show and send only the fields that apply.

```typescript
watchEffect(() => {
  const image = form.fields.kind.value === 'image';
  form.fields.src.access = image ? 'editable' : 'disabled';
  form.fields.text.access = image ? 'disabled' : 'editable';
  form.fields.src.visibility = image ? 'full' : 'suppress';
  form.fields.text.visibility = image ? 'suppress' : 'full';
});
```

`access` controls what is sent and `visibility` what is rendered, so the rule sets both. A `'disabled'` field is not
sent and its validators do not run, so a required field that does not apply does not block the submit. It keeps its
value, so switching the kind back restores it. Where the server should clear the value of a field that does not
apply, use `'disabled-null'`: the field is sent as `null`.

## An optional section

You want a section the user switches on and off (an invoice address that may be the same as the delivery address,
a company that may or may not be named on the order) to be sent as `null` while it is off, and to keep what was
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
block the submit while the section is off, and it is validated again when the section is switched on. Where the
section should follow a loaded record, set the switch from the record:

```typescript
form.value = record;
separateBilling.value = record.billing != null;
```

Where there is no switch and the section is optional as a whole (an empty section is sent as `null`, a partly
filled section must be complete), the rule reads the section's fields:

```typescript
watchEffect(() => {
  const started = Object.values(billing.fields).some((field) => !isEmpty(field.value));
  billing.access = started ? 'editable' : 'disabled-null';
});
```

## A field or a section that is shown but not editable

You want something the user sees but cannot change. Two access values do that, and they differ in what is sent: a
`'readonly'` field is sent with its value, like a submitted `<input readonly>`, and a `'disabled'` field is left out,
like an `<input disabled>`. Code can still write to both, so loading a record fills them.

A container's access applies to everything inside it. Below a `'readonly'` group an `'editable'` field is
`'readonly'`, and below a `'disabled'` or `'disabled-null'` group nothing is sent and nothing is validated. The
member keeps its own `access`; the access that applies is `effectiveAccess`. A rendering layer binds
`effectiveEnabled` to disable every input of such a section; it is `true` where `effectiveAccess` is `'editable'`:

```vue
<df-input :disabled="!field.effectiveEnabled" :control="field" />
```

The read is reactive like every other read through an element, so switching a group re-renders the inputs of every
member below it without walking the tree.

## A section that follows its members

You want a section to drop out of the payload, or to be sent as `null`, while none of its fields is enabled. A
container is not disabled automatically when all its children are, so an effect sets its access. The access value
depends on what the payload should contain:

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

You want a validator on one field that reads a second field of the same record: the unit price is required while
the quantity in the same `List` row is above zero.

```typescript
lineItem.fields.unitPrice.registerAction(new Validators.Validator((newValue, oldValue, field) => {
  const row = field.parent;
  if (!(row instanceof Group)) {
    field.markRecordIncomplete();
    return null;
  }
  return row.fields.quantity.value > 0 && newValue == null
    ? [new ValidationError('unit_price_required', {}, 'Unit price is required when quantity is above zero')]
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
reading `fields`. The check also tests whether the row exists yet: a row is built member by member, and a member's
first validation runs before it has a row. In that case the validator has no result;
[`markRecordIncomplete()`](/api/field-base#markrecordincomplete-void) records this, and the row runs the validator again
once it holds its members and the data it was built with.

A validator runs when its own field changes. The second action re-validates the unit price when the quantity is
edited after the row exists.

A rule comparing two fields by name needs none of this: [`CompareTo`](/api/validators#new-validators-compareto-otherfield-isvalidcomparison-options)
resolves the other field in its record and re-validates when that field changes. The
[List example](/examples/list#reaching-a-sibling-field) runs these two actions in a form.

## A list of plain values

You want a list of strings or numbers instead of a list of records.

```typescript
const tags = new List(new Field<string>({ validators: [new Validators.Required()] }));
tags.push('urgent');
tags.value;   // ['urgent'], and [] while the list holds no rows
```

Every row is a `Field` bound from the item template, so every tag has the `Required` validator, and a row binds to
an input through `tag.value`. A list of lists is `new List(new List(...))`. The
[List example](/examples/list) shows both in a running form.

## Application state

You want state that is not a form on screen (for example a shopping cart with its items, a coupon and a delivery
address) with the same reactivity, transactions and validation a form has. Build it as a group and read it through
[`view()`](/api/view):

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

The list's view is an array whose mutating methods are the list's own, so a sort moves the rows themselves. Every
read is tracked on the field it reaches: `watch(() => cart.coupon, …)` runs when the coupon changes and not when a
quantity changes, and `total` recomputes when prices and quantities change. While the cart is collected in the shop,
`cart.$.value` contains `delivery: null` and the address is not validated, so it does not make `cart.$.valid`
`false`. Switching back to delivery restores the address as it was typed and validates it.

`createCart()` builds a new cart on each call, so the caller decides where the state lives (a module, a `provide()`
in the owning component, or elsewhere), and a test builds its own cart.

A value derived from the state, such as `total`, is a `computed` beside it, and a function that changes the state is
a plain function; neither is a member of an element. Where they belong to the state, the factory builds them and
returns them with it: `return { cart, total, addItem }`.

## Keeping state across a hot module replacement

You want state a module builds to keep what it held when the module is replaced during development. Save the
baseline and what the state holds when the old module is disposed, and put both into the new instance:

```typescript
export const cart = createCart();

if (import.meta.hot) {
  const saved = import.meta.hot.data.cart;
  if (saved) {
    cart.$.rebind(saved.original);   // the baseline: isChanged compares against it
    cart.$.value = saved.full;       // what the old instance held, members that are not sent included
  }
  import.meta.hot.dispose((data) => {
    data.cart = { original: cart.$.originalValue, full: cart.$.fullValue };
  });
}
```

`rebind(original)` makes the old baseline the new one, and the assignment writes every member, so the new instance
holds what the old one held and reports the same `isChanged`. `access` and `visibility` are not data: the new
instance has the ones its construction and its rules give it.

## Carrying server-rendered state to the client

You want state built during server-side rendering to start the client with the same data. Serialize `fullValue`
into the page and rebind the client's instance to it:

```typescript
// server
const state = createCart();
await load(state);
const payload = JSON.stringify(state.$.fullValue);   // written into the page

// client
const state = createCart();
state.$.rebind(JSON.parse(payload));
```

`fullValue` contains every member, including the ones whose access sends nothing, so the client holds what the
server held. `rebind` makes the payload the baseline, so the client starts with `isChanged` `false`. The rules
(access, visibility, validators) run again on the client as part of building the state.

## Free-form state

You want state whose shape comes from data, such as settings read from the server. `Group.createFromFormData()`
builds the element tree: a `Group` for every object, a `List` for every array and a `Field` for every other value.
Read and write it through [`view()`](/api/view), and add a key with `$.addField()`:

```typescript
const settings = view(Group.createFromFormData(await api.settings()));

settings.editor.tabSize = 4;
settings.$.addField('fontSize', new Field({ value: 14 }));
```

A `Field` holds one value, and a change of it is an assignment to `value`; a write into an object or an array a
`Field` holds is not a change of the field (see [The model](/guide/model#where-a-value-comes-from)). Data built by
`createFromFormData()` has no such field: every object and array in it is an element.

## Data from a server cache

You want a query library such as TanStack Query to fetch, cache and refetch a record, and a form to edit it. Rebind
the form to each result while it holds no edits:

```typescript
import { useQuery, useQueryClient } from '@tanstack/vue-query';

const form = createPersonForm();
const queryClient = useQueryClient();
const { data } = useQuery({ queryKey: ['person', id], queryFn: () => api.person(id) });

watch(data, (person) => {
  if (person && !form.isChanged) form.rebind(person);
}, { immediate: true });

const save = new Action({
  value: { label: 'Save' },
  actions: [new SubmitAction(form, async (value) => {
    const saved = await api.savePerson(id, value);
    queryClient.setQueryData(['person', id], saved);
    return saved;
  })],
});
```

The query library holds the server's copy: fetching, caching, invalidation and refetching. The form holds the edit.
A refetch that arrives while the form holds edits leaves the form as it is. `SubmitAction` rebinds the form to what
the server saved, and `setQueryData` puts the same record into the cache.

Where the shape of the data is not known in advance, build the element tree from the first result and rebind it to
the following ones:

```typescript
const settings = shallowRef<Group>();

watch(data, (fetched) => {
  if (!fetched) return;
  if (!settings.value) settings.value = Group.createFromFormData(fetched);
  else if (!settings.value.isChanged) settings.value.rebind(fetched);
}, { immediate: true });
```

`rebind()` writes the keys the tree has: a key the data adds is ignored, and a key the data leaves out takes the
member's baseline. Data with a different shape needs a new tree from `createFromFormData()`.

## A value loaded for another value

You want a field filled from the server whenever another field changes, such as the city for a postcode. Watch the
source and write the result into the field:

```typescript
watch(() => form.fields.postcode.value, async (postcode, _, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  const city = postcode ? await api.city(postcode) : '';
  if (current) form.fields.city.value = city;
});
```

The result is an ordinary write: it is validated, announced and part of `isChanged`. `onCleanup` runs when the
postcode changes again before the answer arrives, so the answer for an older postcode is dropped. The library has
no asynchronous derived value; a component that should not render before the first answer awaits it in an `async
setup()` inside `<Suspense>`.

## Reacting to every change below an element

You want to save state whenever anything in it changes. Register on the container:

```typescript
state.registerAction(new ValueChangedAction((element, supr, newValue, oldValue) => {
  saveDraft(newValue);   // the container's fullValue
  return supr(element, newValue, oldValue);
}));
```

`ValueChangedAction` on a `Group` or a `List` fires once per transaction for any change of what it holds, at any
depth, with its `fullValue`. `ContributionChangedAction` fires when what the container sends changes, a change of a
member's `access` included, with its `value`; use it where the payload is what you store. Both run at the commit, so
a transaction that writes several fields saves once. A `watch(() => state.fullValue, …)` observes the same change
after the transaction; see [Actions and `watch()`](/api/actions#actions-and-watch).

## An optimistic update

You want a change shown at once and put back when the server refuses it. Write the value, send it, and restore the
previous value on failure:

```typescript
async function rename(field: Field<string>, name: string) {
  const previous = field.value;
  field.value = name;
  try {
    await api.rename(name);
  } catch (error) {
    // a newer write made while the request was out is kept
    if (field.value === name) field.value = previous;
    throw error;
  }
}
```

A [transaction](/api/transactions) cannot stay open across an `await`: `transaction()` with an asynchronous callback
throws a `TypeError` and rolls back. The previous value is therefore held by the caller, and the check before
restoring keeps a write the user made while the request was out.
