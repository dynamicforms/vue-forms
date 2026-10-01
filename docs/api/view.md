# view()

`view(element)` hands out a form element seen as its data: the members of a group and the rows of a list are plain
properties, and the element itself is `$`. It is another way of reading the same element — every read and every
write goes to it — so the two mix freely, and a project may keep only the view of what it builds.

```typescript
import { Field, Group, List, view } from '@dynamicforms/vue-forms';

const cart = view(new Group({
  items: new List(new Group({ name: new Field({ value: '' }), quantity: new Field({ value: 1 }) })),
  coupon: new Field<string | null>({ value: null }),
}));

cart.coupon = 'SPRING';                         // writes the field
cart.items!.push({ name: 'Mug', quantity: 2 }); // a list's view is an array
cart.items![0]!.quantity;                        // 2
cart.$.valid;                                    // the group
cart.$.value;                                    // what the group sends
```

## The rule

| Key | What it reaches |
|---|---|
| a member name of a group, an index of a list | the member or the row: a field as its **value**, a container as its **view** |
| `$` | the element itself |

A member is read by the rule `fullValue` follows ([What a container serializes](/api/container#what-a-container-serializes)):
every member is there with what it holds, whatever its access or visibility, so a disabled field reads and writes
like any other. `Object.keys()`, spreading and `JSON.stringify()` see the same keys.

Writing a member's key writes the field's value. A container is replaced through its element —
`cart.$.fields.delivery.value = { … }`, or `cart.delivery!.$.value = { … }` — which takes what the container's setter
takes, `null` included. A key that is no member throws a `TypeError`, and so does deleting one:
`cart.$.addField()` and `cart.$.removeField()` change the set. `$` itself cannot be replaced.

## Lists

The view of a list is an array — `Array.isArray()` is `true`, and `map`, `filter`, `find`, `includes`, `for…of` and
the rest read it through its length and its indices. The mutations are carried out as the list's own operations, so
every row keeps its element, its errors and its `touched`, and `ListItemAddedAction` and `ListItemRemovedAction`
report each row:

| Array method | Carried out as |
|---|---|
| `push(...)`, writing the index past the end | `list.push()` for each item |
| `pop()`, `shift()`, setting `length` lower | `list.remove()` of the rows that go |
| `unshift(...)`, `splice(...)` | `list.remove()` and `list.insert()` at the positions |
| `sort()`, `reverse()` | the rows themselves put in the new order |
| writing an index | the row's value |

`fill()` and `copyWithin()` throw, and so does setting `length` higher: there is no row to move. An item may be the
data a row is built from, an element, or the view of one. Every row the list holds has its index in the view,
whatever its access.

## One view per element

`view(element) === view(element)`, and `view()` of a view hands it back. A container's member reads as the view of
that member, so `view(form).address === view(form.fields.address)`.

## Vue

Every read goes through the tracked state of the element behind it, so an effect re-runs for what it read and
nothing else: `watch(() => cart.coupon, …)` runs when the coupon changes, not when a quantity does.
`v-model="cart.coupon"` reads and writes the field. `reactive()` leaves a view as it is, as it leaves an element.

## Types

`View<E>` types a field member by its value and a container member by its view, since every member is there.
A container's key is read-only. A list's view has the array's reading members and the three mutations that take
items, typed to take row data, an element or a view. `$` is typed as the element.

## Names a view cannot hold

A group with a member named `$` or `then`, or with a name that starts with `__v_`, cannot be viewed: `view()` throws
a `TypeError`. `$` is the element, `then` would make the view look like a promise to `await`, and `__v_` names are
Vue's.

## What stays with elements

The handlers an element runs — actions, validators, `ConditionalStatementAction` executors — receive the element,
not a view. Wrap it where the handler reads data: `view(field.parent!)`.

See also [Application state](/guide/cookbook#application-state) in the cookbook, which keeps a whole shopping cart in
one view.
