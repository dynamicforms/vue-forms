# Cookbook

Short, standalone recipes for forms and for application state. The form recipes come first; the recipes from
[Application state](#application-state) on keep state that is not a form on screen. Each one assumes you know
[the model](/guide/model). The rules for what a form sends are in
[What a container serializes](/api/container#what-a-container-serializes).

## Loading a record

You want the form to show a record the server sent.

```typescript
form.value = record;
```

Every member is written, whatever its [access or visibility](/api/field-base#access) at that moment, so the order in
which the form's rules switch fields does not matter. A key missing from the record keeps what the member held;
`null` for a container empties it.

Where the record should also become the baseline for [`isChanged`](/api/field-base#prop-isChanged) (the form is
freshly loaded, not edited), use [`rebind()`](/api/field-base#rebind-data-this):

```typescript
form.rebind(record);
```

It writes the record, starts the change history over and re-runs validation. A member whose key is missing from the
record takes its baseline: the `originalValue` of the corresponding member of the form's declaration, which for a
form that is its own declaration is the member's own baseline.

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
  form.access = 'readonly';
  try {
    form.rebind(await api.save(form.value));
  } finally {
    form.access = 'editable';
  }
}
```

```vue
<input v-model="form.fields.name.value" :disabled="!form.fields.name.effectiveEnabled" />
<button :disabled="!form.valid || form.pending || !form.enabled" @click="submit">Save</button>
```

[`settled()`](/api/field-base#settled-promise-void) resolves once no validation and no `Action.execute()` is running
at or below the form; a click can start a validation in the same event, when the blur of an input commits its value.
[`form.value`](/api/container#reading-the-values) is the payload: `'disabled'` members are left out and
`'disabled-null'` ones are `null`. `rebind(saved)` makes what the server stored the new baseline, so `isChanged` is
`false` again. It also replaces what the form holds, so an edit made while the request runs would be lost:
[`'readonly'`](/api/field-base#access) keeps the inputs from accepting one until the request returns. It sends and
validates the form as `'editable'` does, so `form.value`, `valid` and `isChanged` stay as they are, and every member
reads `effectiveEnabled` as `false`.

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
<input v-model="form.fields.name.value" :disabled="!form.fields.name.effectiveEnabled" />
<button :disabled="!form.fields.actions.fields.save.executable" @click="form.confirm()">Save</button>
```

[`SubmitAction`](/api/action#submitaction-target-handler-options) differs from `submit()` above in three points: it
waits until `validating` is `false` instead of awaiting `settled()`, it refuses a second run while one is running,
and it rebinds the form only where the handler's result is not `undefined`. It resolves with
`{ action, sent, received }`, or with a `CommandException` where nothing was saved: a `SubmitFailedException` where
the handler failed, a `SubmitRefusedException` where the submit was refused before the handler ran. `executable` is
`false` while the form is invalid, a validation is running or the submit is running. It makes the form `'readonly'`
while the handler runs, as `submit()` above does, unless its `lock` option is `false`; the submit is an
`Action.execute()` run, so [`form.busy`](/api/container#prop-busy) is `true` meanwhile, for a form that is drawn
differently while it submits. `form.confirm()` and `form.reject()` find the two actions by their targets, so a dialog binds
Enter and Escape to them. The bar of actions sends nothing, so `form.value` is `{ name: … }`.

## Showing every error when the user submits an invalid form

You want the errors of the fields the user has not visited yet to appear when the user tries to submit.

```typescript
async function submit() {
  await form.settled();
  if (!form.valid) {
    form.touched = true;
    return;
  }
  form.rebind(await api.save(form.value));
}
```

```vue
<input v-model="form.fields.email.value" @blur="form.fields.email.touched = true" />
<p v-if="form.fields.email.touched">{{ form.fields.email.errors[0]?.detail }}</p>
<button :disabled="form.pending" @click="submit">Save</button>
```

Validators run from the moment a field is built, so the template shows a field's errors only once the field is
[`touched`](/api/field-base#prop-touched). Assigning `touched` on a [container](/api/container#prop-touched) assigns
every element below it, the rows of a list included, so one assignment shows every error. `rebind()` resets
`touched` to `false`. With a [`SubmitAction`](/api/action#submitaction-target-handler-options), the same assignment
goes where the submit resolves with a `SubmitRefusedException` whose `reason` is `'invalid'`.

## Showing errors the server returned

You want the field the server rejected to show the server's message until the user corrects it, in nested groups
and list rows as well.

The server answers a rejected save with its messages keyed by the dotted path of the field, such as
`{ "email": ["…"], "items.0.price": ["…"] }`. The application's API client turns that answer into an error the save
throws, and `elementAt()` finds the element a path names, given as a string or as an array (`['items', 0, 'price']`):

```typescript
class FieldErrors extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super('The server rejected the values');
  }
}

function elementAt(root: FieldBase, path: string | readonly (string | number)[]): FieldBase | undefined {
  const keys = typeof path === 'string' ? path.split('.') : path;
  let element: FieldBase | null | undefined = root;
  for (const key of keys) {
    if (element instanceof Group) element = element.field(String(key));
    else if (element instanceof List) element = element.get(Number(key));
    else return undefined;
  }
  return element ?? undefined;
}

function showServerErrors(root: FieldBase, errors: Record<string, string[]>) {
  Object.entries(errors).forEach(([path, messages]) => {
    // a message for a path the form does not hold is shown on the form itself
    const element = elementAt(root, path) ?? root;
    element.errors = [
      ...element.errors,
      ...messages.map((message) => new ValidationError('app.server_error', {}, message, 'server')),
    ];
  });
}
```

The submit catches the error, writes the messages and throws it again:

```typescript
async function submit() {
  await form.settled();
  if (!form.valid) return;
  form.access = 'readonly';
  try {
    form.rebind(await api.save(form.value));
  } catch (error) {
    if (error instanceof FieldErrors) showServerErrors(form, error.errors);
    throw error;
  } finally {
    form.access = 'editable';
  }
}

// the same in the handler of a SubmitAction, which receives the form as its second argument
new SubmitAction(
  (action) => action.parent?.parent,
  async (value, target) => {
    try {
      return await api.save(value);
    } catch (error) {
      if (error instanceof FieldErrors) showServerErrors(target, error.errors);
      throw error;
    }
  },
);
```

`form.field('addr.city')` reads a member named `addr.city`, not a path, so `elementAt()` walks the path through
[`Group.field()`](/api/group#field-fieldname-t-k-null) and [`List.get()`](/api/list#get-index-r-undefined). An error
written into `errors` makes the element and every container above it invalid at once. Its
[origin](/api/validators#origin) is `'server'`, whose default rule is `{ validEffect: true, removeOn: 'edit' }`
([`ErrorPolicy`](/api/validators#errorpolicy)): a field loses the error when the user leaves it after changing it,
and the form loses its own when the user leaves any field after a change of the form's value. The rendering layer
writes `touched = true` when the user leaves an input. Until then the form is invalid, so the same values are not
sent again. A `SubmitAction` whose handler throws resolves with a `SubmitFailedException` whose `cause` is the
error.

## Keeping a server error until the next submit

You want a refused login to keep its message until the user tries again, and the user to be able to try again
without changing anything.

```typescript
const login = new Group(
  {
    user: new Field({ value: '', validators: [new Validators.Required()] }),
    password: new Field({ value: '', validators: [new Validators.Required()] }),
    actions: new Group({
      submit: new Action({
        value: { label: 'Log in', defaultConfirm: true },
        actions: [
          new SubmitAction(
            (action) => action.parent?.parent,
            async (value, target) => {
              const answer = await api.login(value);
              if (!answer.ok) {
                target.errors = [new ValidationError('app.invalid_credentials', {}, answer.detail, 'server')];
                throw new Error(answer.detail);
              }
            },
          ),
        ],
      }),
    }),
  },
  { actions: [new ErrorPolicy({ server: { validEffect: false, removeOn: 'submit' } })] },
);
```

`validEffect: false` leaves the form valid while it shows the message, so the submit action stays executable, and
`removeOn: 'submit'` removes the message when the next attempt is sent. The policy applies to the form and every
element below it; another form keeps the default rule. `validEffect: true` with `removeOn: 'submit'` throws a
`TypeError`, since the message would make the form invalid and keep the submit that removes it from running.

## Warning before leaving a changed form

You want to ask before the user navigates away from unsaved changes, by closing the page or through the router.

```typescript
import { onBeforeUnmount, onMounted } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

const warn = (event: BeforeUnloadEvent) => {
  if (form.isChanged) event.preventDefault();
};
onMounted(() => window.addEventListener('beforeunload', warn));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warn));

onBeforeRouteLeave(() => !form.isChanged || window.confirm('Leave without saving the changes?'));
```

[`isChanged`](/api/field-base#prop-isChanged) compares the form's value with `originalValue`, the baseline `rebind()`
sets. For a form loaded with `rebind(record)` and saved with `rebind(saved)`, as above, `isChanged` is `false`
exactly while nothing has been edited since.

## Clearing and resetting a form

You want to put a form back to its declared values, or empty it.

```typescript
group.rebind(group.originalValue);   // back to what the group was declared with
group.rebind(null);                  // empty: every member set to null
field.rebind(field.originalValue);   // back to what the field was declared with
field.rebind('');                    // an explicit empty value of the field's own type
list.rebind(list.originalValue);     // back to the rows the list was declared with
list.rebind(null);                   // empty: every row released
```

Each call also resets `touched`, clears the element's own errors and re-runs validation; what it restores and what
it keeps is described under [`rebind()`](/api/field-base#rebind-data-this),
[`Group.rebind()`](/api/group#rebind-data-this) and [`List.rebind()`](/api/list#rebind-data-this).

## Fields that depend on a type

You want a form whose fields depend on a kind (a label element that is text or an image, a payment by card or by
transfer) to show and send only the fields that apply.

```typescript
const kind = new Field({ value: 'text' });
const isImage = new Statement(kind, Operator.EQUALS, 'image');
const isText = new Statement(kind, Operator.NOT_EQUALS, 'image');

const appliesWhen = (statement: Statement) => [
  new ConditionalAccessAction(statement),
  new ConditionalVisibilityAction(statement),
];

const label = new Group({
  kind,
  text: new Field({ value: '', actions: appliesWhen(isText) }),
  src: new Field({ value: '', actions: appliesWhen(isImage) }),
});
```

`access` controls what is sent and `visibility` what is rendered, so the rule sets both: while the statement is
false, a field is `'disabled'` and `'suppress'`. A `'disabled'` field is not sent and its validators do not run, so a
required field that does not apply does not block the submit. It keeps its value, so switching the kind back
restores it. Where the server should clear the value of a field that does not apply, pass `'disabled-null'` as the
action's third argument: the field is sent as `null`.

A [conditional action](/api/actions#conditional-actions) applies its statement within the write of `kind`, so
`label.value` read right after the write already follows the new kind. Declared on a `List`'s item template, it
applies to each row over that row's fields, and it needs no effect scope. A rule that is not a statement over field
values is a `watchEffect()` that sets `access` and `visibility`; it applies on the next flush after the write and
does not reach the rows of a list.

## An optional section

You want a section the user switches on and off (an invoice address that may be the same as the delivery address,
a company that may or may not be named on the order) to be sent as `null` while it is off, and to keep what was
entered.

```typescript
const separateBilling = new Field({ value: false });
const billingEnabled = new Statement(separateBilling, Operator.EQUALS, true);

const billing = new Group(
  {
    street: new Field({ value: '', validators: [new Validators.Required()] }),
    city: new Field({ value: '', validators: [new Validators.Required()] }),
  },
  {
    actions: [
      new ConditionalAccessAction(billingEnabled, 'editable', 'disabled-null'),
      new ConditionalVisibilityAction(billingEnabled, 'full', 'hidden'),
    ],
  },
);
const form = new Group({ customer: new Field({ value: 'Ada' }), billing });

form.value;   // { customer: 'Ada', billing: null } while separateBilling is false
```

```vue
<input v-model="separateBilling.value" type="checkbox" />
```

The switch is a field outside the form, so it is not sent. A section sent as `null` sends none of its fields, so
their validators do not run: the required street does not block the submit while the section is off, and it is
validated again when the section is switched on. Where the section should follow a loaded record, set the switch
from the record:

```typescript
form.value = record;
separateBilling.value = record.billing != null;
```

Where there is no switch and the section is optional as a whole (an empty section is sent as `null`, a partly
filled section must be complete), the rule tests every field of the section with
[`isEmptyValue()`](/api/validators#validators-isemptyvalue-value-unknown-boolean), which is not a comparison a
`Statement` makes, so it is a `watchEffect()`:

```typescript
watchEffect(() => {
  const started = Object.values(billing.fields).some((field) => !Validators.isEmptyValue(field.value));
  billing.access = started ? 'editable' : 'disabled-null';
});
```

A section that drops out while none of its fields is enabled is in
[A container that follows its children](/api/container#a-container-that-follows-its-children).

## A field or a section that is shown but not editable

You want something the user sees but cannot change, sent with its value (`'readonly'`) or left out (`'disabled'`).

```typescript
address.access = 'readonly';
```

```vue
<df-input :disabled="!field.effectiveEnabled" :control="field" />
```

A container's access applies to every element below it through
[`effectiveEnabled`](/api/field-base#prop-effectiveEnabled), which a rendering layer binds; the four values are in
[`Access`](/api/field-base#access).

## A rule that reads another field of the record

You want a validator on one field that reads a second field of the same record, such as a date range whose end may
not be before its start.

```typescript
const booking = new Group({
  from: new Field({ value: '' }),
  to: new Field({
    value: '',
    validators: [
      new Validators.CompareTo<string>('from', (to, from) => !to || !from || to >= from, {
        code: 'app.range_reversed',
        detail: 'The end is before the start',
      }),
    ],
  }),
});
```

[`CompareTo`](/api/validators#new-validators-compareto-otherfield-isvalidcomparison-options) resolves the other
field by name in the record of the validated field and validates again when that field changes. The dates are ISO
strings (`'2026-10-11'`), which compare in date order, and the comparison passes while either is empty, so the
range is checked once both are filled. On a `List`'s item template the rule compares the two fields of each row:

```typescript
const lineItem = new Group({
  quantity: new Field({ value: 1 }),
  unitPrice: new Field<number | null>({
    value: null,
    validators: [
      new Validators.CompareTo<number | null>('quantity', (price, quantity) => !(quantity! > 0 && price == null), {
        code: 'app.unit_price_required',
        detail: 'Unit price is required when quantity is above zero',
      }),
    ],
  }),
});
```

A rule over three or more fields is a validator that reads the record, and an action on each field it reads that
validates it again:

```typescript
const line = new Group({
  quantity: new Field({ value: 1 }),
  unitPrice: new Field({ value: 0 }),
  discount: new Field({ value: 0 }),
});

line.fields.discount.registerAction(new Validators.Validator((discount, oldValue, field) => {
  const row = field.parent;
  if (!(row instanceof Group)) {
    field.markRecordIncomplete();
    return null;
  }
  return discount > row.fields.quantity.value * row.fields.unitPrice.value
    ? [new ValidationError('app.discount_too_high', {}, 'The discount exceeds the line total')]
    : null;
}));

// a new quantity or unit price sends the discount of the same row through its validators again
const validateDiscount = new ValueChangedAction((field, supr, newValue, oldValue) => {
  const result = supr(field, newValue, oldValue);
  if (field.parent instanceof Group) field.parent.fields.discount.validate(true);
  return result;
});
line.fields.quantity.registerAction(validateDiscount);
line.fields.unitPrice.registerAction(validateDiscount);
```

The field's `parent` is typed [`Container`](/api/container#parent), so the check narrows it to a `Group` before
reading `fields`. The check also tests whether the row exists yet: a row is built member by member, and a member's
first validation runs before it has a row. In that case the validator has no result;
[`markRecordIncomplete()`](/api/field-base#markrecordincomplete-void) records this, and the row runs the validator
again once it holds its members and the data it was built with. A validator runs when its own field changes, so the
`ValueChangedAction` validates the discount again when another field it reads is edited. The
[List example](/examples/list#reaching-a-sibling-field) runs a validator of this kind in a form.

## Asynchronous validation with a debounce

You want a check against the server, such as whether a user name is free, to run once the user stops typing.

```typescript
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

const available = new Validators.Validator<string>(async (name, oldName, field, signal) => {
  if (Validators.isEmptyValue(name)) return null;
  await delay(300, signal);
  const response = await fetch(`/api/available?${new URLSearchParams({ name })}`, { signal });
  return (await response.json()).free ? null : [new ValidationError('app.name_taken', {}, 'This name is taken')];
});

const username = new Field({ value: '', validators: [new Validators.Required(), available] });
```

Every change of the value starts a run of the validator and aborts the
[signal](/api/validators#cancelling-a-run) of the run before it, so the earlier run's delay rejects and that run
produces no result: neither an error nor a log entry. Only a value that stays unchanged for 300 ms reaches the
server, and a request already sent is aborted by the next change. `validating` is `true` from the first change, so
a submit that awaits `settled()` waits for the request.

## A multi-step form

You want a form filled in over several steps, each shown on its own, with Next enabled once the current step is
valid.

```typescript
const step = new Field({ value: 0 });
const onStep = (index: number) => new ConditionalVisibilityAction(new Statement(step, Operator.EQUALS, index));

const signup = new Group({
  account: new Group(
    {
      email: new Field({ value: '', validators: [new Validators.Required()] }),
      password: new Field({ value: '', validators: [new Validators.Required(), new Validators.MinLength(12)] }),
    },
    { actions: [onStep(0)] },
  ),
  address: new Group(
    {
      street: new Field({ value: '', validators: [new Validators.Required()] }),
      city: new Field({ value: '', validators: [new Validators.Required()] }),
    },
    { actions: [onStep(1)] },
  ),
});
const steps = [signup.fields.account, signup.fields.address];
const current = computed(() => steps[step.value]);
```

```vue
<fieldset v-if="signup.fields.account.visibility === 'full'">…</fieldset>
<fieldset v-if="signup.fields.address.visibility === 'full'">…</fieldset>
<button :disabled="step.value === 0" @click="step.value--">Back</button>
<button v-if="step.value < steps.length - 1" :disabled="!current.valid || current.pending" @click="step.value++">
  Next
</button>
<button v-else :disabled="!signup.valid || signup.pending" @click="submit">Sign up</button>
```

Each step is a `Group`, so its `valid` and `pending` cover exactly that step's fields. Visibility does not change
what is sent or validated: every step stays editable, so `signup.valid` covers every step and `signup.value` is the
whole record. The step counter is a field outside the form, so it is not sent.

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

## Moving a row

You want the user to move a row of a [`List`](/api/list) to another position, as a drag and drop does.

```typescript
function move(list: List, from: number, to: number) {
  transaction(() => {
    list.insert(list.remove(from)!, to);
  });
}
```

`remove()` returns the row element and `insert()` takes an element, so the row keeps its values, errors and
`touched`. In a [transaction](/api/transactions) the list announces its new value once. A `sort()` or `reverse()` of
the list's [view](/api/view#lists) reorders every row the same way.

## Unit-testing a form

You want to test a form's rules without rendering it. Build the form in a function that takes what it calls, write
values, and await [`settled()`](/api/field-base#settled-promise-void) before asserting:

```typescript
import { describe, expect, it } from 'vitest';

import { createSignupForm } from './signup-form';

describe('signup form', () => {
  it('rejects a taken user name', async () => {
    const form = createSignupForm({ isTaken: async (name) => name === 'ada' });

    form.fields.username.value = 'ada';
    await form.settled();

    expect(form.fields.username.errors.map((error) => error.code)).toEqual(['app.name_taken']);
    expect(form.valid).toBe(false);
  });

  it('sends what the user entered', async () => {
    const form = createSignupForm({ isTaken: async () => false });

    form.value = { username: 'grace', email: 'grace@example.com' };
    await form.settled();

    expect(form.valid).toBe(true);
    expect(form.value).toEqual({ username: 'grace', email: 'grace@example.com' });
  });
});
```

A synchronous validator has its result as soon as the value is written; `settled()` waits for the asynchronous ones.
A rule that a [conditional action](/api/actions#conditional-actions) applies is in place when the write returns; a
rule in a `watchEffect()` applies after `await nextTick()`.

## Application state

You want state that is not a form on screen (for example a shopping cart with its items, a coupon and a delivery
address) with the same reactivity, transactions and validation a form has. Build it as a group and read it through
[`view()`](/api/view):

```typescript
import { computed } from 'vue';
import {
  ConditionalAccessAction, Field, Group, List, Operator, Statement, Validators, view,
} from '@dynamicforms/vue-forms';

export function createCart() {
  const pickup = new Field({ value: false });
  return view(new Group({
    items: new List(new Group({
      sku: new Field({ value: '' }),
      name: new Field({ value: '' }),
      price: new Field({ value: 0 }),
      quantity: new Field({ value: 1, validators: [new Validators.MinValue(1)] }),
    })),
    coupon: new Field<string | null>({ value: null }),
    pickup,
    delivery: new Group(
      {
        street: new Field({ value: '', validators: [new Validators.Required()] }),
        city: new Field({ value: '', validators: [new Validators.Required()] }),
      },
      // a cart collected in the shop sends no delivery address, and keeps the one typed in
      {
        actions: [
          new ConditionalAccessAction(new Statement(pickup, Operator.EQUALS, true), 'disabled-null', 'editable'),
        ],
      },
    ),
  }));
}

const cart = createCart();
const total = computed(() => cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));

cart.items.push({ sku: 'm-1', name: 'Mug', price: 12, quantity: 2 });
cart.items.sort((a, b) => a.name.localeCompare(b.name));
cart.coupon = 'SPRING';
```

The list's view is an array whose mutating methods are the list's own, so a sort moves the rows themselves. Every
read is tracked on the field it reaches: `watch(() => cart.coupon, …)` runs when the coupon changes and not when a
quantity changes, and `total` recomputes when prices and quantities change. The view types each row as the view
of its element, so a row is never `null`; the rows of `cart.$.value.items` are typed `| null`
([`ListValue`](/api/list#prop-value)), because a `'disabled-null'` row is sent as `null`. While the cart is
collected in the shop, `cart.$.value` contains `delivery: null` and the address is not validated, so it does not
make `cart.$.valid` `false`. Switching back to delivery restores the address as it was typed and validates it.

`createCart()` builds a new cart on each call, so the caller decides where the state lives (a module, a component
that provides it, or elsewhere), and a test builds its own cart.

A value derived from the state, such as `total`, is a `computed` beside it, and a function that changes the state is
a plain function; neither is a member of an element. Where they belong to the state, the factory builds them and
returns them with it: `return { cart, total, addItem }`.

## Sharing state between components

You want a component and its descendants to use one instance of the state, without passing it through props.

```typescript
// cart.ts
import { inject, type InjectionKey } from 'vue';

export type Cart = ReturnType<typeof createCart>;
export const cartKey: InjectionKey<Cart> = Symbol('cart');

export function useCart(): Cart {
  const cart = inject(cartKey);
  if (!cart) throw new Error('useCart() is called below a component that provides the cart');
  return cart;
}
```

```typescript
// the component that owns the cart
provide(cartKey, createCart());

// any component below it
const cart = useCart();
```

The `InjectionKey` carries the type, so `inject(cartKey)` returns `Cart | undefined` and `useCart()` returns `Cart`.
Each component that provides a cart gives the components below it their own instance; an application-wide cart is
provided once with `app.provide(cartKey, createCart())`.

## Keeping state across a hot module replacement

You want state a module builds to keep what it held when the module is replaced during development. Save the
baseline and what the state holds when the old module is disposed, and put both into the new instance:

```typescript
import { computed, effectScope } from 'vue';

const scope = effectScope();
export const { cart, total } = scope.run(() => {
  const cart = createCart();
  const total = computed(() => cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  return { cart, total };
})!;

if (import.meta.hot) {
  const saved = import.meta.hot.data.cart;
  if (saved) {
    cart.$.rebind(saved.original);   // the baseline: isChanged compares against it
    cart.$.value = saved.full;       // what the old instance held, members that are not sent included
  }
  import.meta.hot.dispose((data) => {
    data.cart = { original: cart.$.originalValue, full: cart.$.fullValue };
    scope.stop();
  });
}
```

`rebind(original)` makes the old baseline the new one, and the assignment writes every member, so the new instance
holds what the old one held and reports the same `isChanged`. `access` and `visibility` are not data: the new
instance has the ones its construction and its rules give it. The module's effects (`computed`, `watch`,
`watchEffect`) are created in the [`effectScope()`](https://vuejs.org/api/reactivity-advanced.html#effectscope), and
`scope.stop()` stops them with the old module, so they do not keep running over the old instance.

## Carrying server-rendered state to the client

You want state built during server-side rendering to start the client with the same data. Serialize
[`fullValue`](/api/field-base#prop-fullValue) into the page and rebind the client's instance to it:

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

function discard() {
  if (data.value) form.rebind(data.value);
}
```

The query library holds the server's copy: fetching, caching, invalidation and refetching. The form holds the edit.
A refetch that arrives while the form holds edits leaves the form and its baseline as they are. `discard()` rebinds
the form to the cache's latest record; a `RejectAction` or `form.rebind(form.originalValue)` restores the record the
form was last rebound to, which is older where a refetch arrived during the edit. `SubmitAction` rebinds the form to
what the server saved, and `setQueryData` puts the same record into the cache.

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
postcode changes again before the answer arrives, so the answer for an older postcode is dropped.

## Reacting to every change below an element

You want to save state whenever anything in it changes. Register on the container:

```typescript
state.registerAction(new ValueChangedAction((element, supr, newValue, oldValue) => {
  saveDraft(newValue);   // the container's fullValue
  return supr(element, newValue, oldValue);
}));
```

[`ValueChangedAction`](/api/actions#valuechangedaction) on a `Group` or a `List` fires once per transaction for any
change of what it holds, at any depth, with its `fullValue`.
[`ContributionChangedAction`](/api/actions#contributionchangedaction) fires when what the container sends changes, a
change of a member's `access` included, with its `value`; use it where the payload is what you store. Both run at the
commit, so a transaction that writes several fields saves once. A `watch(() => state.fullValue, …)` observes the
same change after the transaction; see [Actions and `watch()`](/api/actions#actions-and-watch).

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
  // the server holds the name: it becomes the baseline, so isChanged is false
  if (field.value === name) field.rebind(name);
}
```

The previous value is held by the caller, because a [transaction](/api/transactions) does not stay open across an
`await`. The checks before restoring and before rebinding keep a write the user made while the request was out.
Where the state does not mirror the server, leave out the `rebind()`: `isChanged` then stays `true` after the save.
