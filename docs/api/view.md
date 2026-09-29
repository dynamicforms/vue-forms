# view()

`view(element)` hands out a form element seen as its data: the members of a group and the rows of a list are plain
properties, and everything the element answers to is there under a `$` prefix. It is the same element — every read
and every write goes to it — in the shape a Pinia store has.

```typescript
import { Field, Group, List, view } from '@dynamicforms/vue-forms';

const session = view(new Group({
  account: new Group({ email: new Field({ value: '' }), isSuperuser: new Field({ value: false }) }),
  clubs: new List(new Group({ slug: new Field({ value: '' }) })),
}));

session.account?.email;          // the field's value
session.account!.email = 'ada@x'; // writes the field
session.clubs?.push({ slug: 'nk' });
session.$valid;                  // the group's valid
session.$element;                // the group itself
```

A project may use views throughout — build the element once, keep only its view — or reach for one where it reads
better. The two describe the same state, so they mix freely.

## The rule

| Key | What it reaches |
|---|---|
| a member name of a group, an index of a list | the member or the row: a field as its **value**, a container as its **view** |
| `$name` | `element.name`: a property reads and writes it, a method is bound to the element |
| `$element` | the element itself |

A member is read by the rule `fullValue` follows ([What a container serializes](/api/container#what-a-container-serializes)):
a `HIDDEN` member reads `null`, a `SUPPRESS` member is not there, and `enabled` does not matter, so a disabled field
reads and writes like any other. `Object.keys()`, spreading and `JSON.stringify()` see the same keys.

Writing a member's key writes the field's value; a container is replaced through its `$value`, which takes what the
container's own setter takes — `null` included. A key that is no member throws a `TypeError`, and so does deleting
one: `$addField()` and `$removeField()` change the set.

`$`-members are the element's members as they are: `$bind()` returns a `Group`, `$get(0)` a row element. Wrap what
you want to keep as a view: `view(session.$bind(record))`.

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
data a row is built from, an element, or the view of one. A suppressed row has no index in the view, the way it has
no place in `fullValue`; the list's own `items` still holds it.

## One view per element

`view(element) === view(element)`, and `view()` of a view hands it back. A container's member reads as the view of
that member, so `view(form).address === view(form.fields.address)`.

## Vue

Every read goes through the tracked state of the element behind it, so an effect re-runs for what it read and
nothing else: `watch(() => session.account?.email, …)` runs when the e-mail changes, not when another member does.
`v-model="session.account.email"` reads and writes the field. `reactive()` leaves a view as it is, as it leaves an
element.

## Types

`View<E>` types a field member by its value and a container member by its view, each as `| null | undefined`,
because any member may be hidden or suppressed; read through with `?.` or state what the form guarantees with `!`.
A container's key is read-only — replace a container through `$value`. A list's view has the array's reading
members and the three mutations that take items, typed to take row data, an element or a view.

## Names a view cannot hold

A group with a member named `then`, or with a name that starts with `$` or `__v_`, cannot be viewed: `view()`
throws a `TypeError`. `$` names are the element's members, `then` would make the view look like a promise to
`await`, and `__v_` names are Vue's.

## What stays with elements

The handlers an element runs — actions, validators, `ConditionalStatementAction` executors — receive the element,
not a view. Wrap it where the handler reads data: `view(field.parent!)`.
