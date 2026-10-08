# Devtools

In development, the library adds a **vue-forms** inspector to [Vue devtools](https://devtools.vuejs.org/) and shows
the state a component holds in that component's inspector. Nothing has to be installed or registered: every root
element (one that no container holds) is listed from the moment it is constructed.

## What the inspector shows

The tree has two sections:

| Section | Contents |
|---|---|
| Global state | elements constructed outside a component, grouped by the file of the code that constructed them |
| Component state | elements constructed in a component's `setup()`, grouped by the path of components from the app's root |

Each element is shown with its members: a `Group`'s by name, a `List`'s rows by position, the first 100 rows of a
list and a node that counts the rest. A tag shows the element's class, green while it is valid and red while it is
not. The tree's search filters by name and by location.

Selecting a node shows its state:

| Section | Members |
|---|---|
| element | `value`, `originalValue`, `isChanged`, `access`, `effectiveAccess`, `visibility`, `touched` |
| validity | `valid`, `validating`, `busy`, `errors` (code, detail, origin and params of each) |
| extra | the [extended properties](/api/field-base#extended-properties) |
| location | the file, and the component path for component state |

The inspector of a component lists, under **vue-forms**, the value of every element the component's `setup()`
constructed. The tree and the state are sent again after every committed transaction, at most once per 100 ms.

There is no timeline.

## Editing

In the vue-forms inspector these members are editable:

| Member | Where |
|---|---|
| `value` | a `Field` or an `Action`, including a member of an object or an array it holds. A `Group` or a `List` is edited through its members |
| `access`, `visibility`, `touched` | every element |
| extended properties | every element, through `setExtendedValues()` |

The devtools edit a value as text and offer no list of choices. The rows `access options` and `visibility options`
show the values with the letter that stands for each in parentheses:

| Member | Options |
|---|---|
| `access` | `(e)ditable`, `(r)eadonly`, `(d)isabled`, `disabled-(n)ull` |
| `visibility` | `(f)ull`, `(i)nvisible`, `(h)idden`, `(s)uppress` |

An access or a visibility is typed as the value or as its letter, ignoring case: `n` sets `disabled-null`.

An edit is a write through the element's setter, as a write from the application: it is a transaction, the
validators run, and the actions registered on the element fire. Editing a member of an object a field holds assigns a
new copy of the object with that member replaced. A value the setter refuses, such as an access that is none of the
four, changes nothing and is reported in the console.

## What is listed

An element is listed while it is a root: a member is shown inside its container, and an element a container
releases is listed again. An element a component's `setup()` constructed is listed while the component is mounted, and
is removed when it is unmounted; an element the component hands on to outlive it is listed again with
`describeState()`. These are never listed:

- the bindings an element is bound to (`bind()`, the rows of a `List`);
- a `List`'s item template;
- an element left out with `hideState()`;
- in opt-in mode, an element not named with `describeState()`.

An element's file is read from the stack at its construction: the first frame outside the library and outside
`node_modules`. The stack is captured at construction and turned into text only when the devtools show the element.
A file the stack does not name, and a name other than the element's class and number, are given with
`describeState()`.

## API

```typescript
import { describeState, hideState, setDevtoolsRegistration } from '@dynamicforms/vue-forms';
```

### `describeState(element, description): void`

Names `element` for the devtools and lists it in opt-in mode. `description` is a `StateDescription`:

| Member | Type | Description |
|---|---|---|
| `name` | `string` | The name the devtools show, in place of the element's class and number |
| `file` | `string` | The file the devtools group the element under, in place of the file read from the stack |

```typescript
export const cart = createCart();
describeState(cart.$, { name: 'Cart', file: 'src/stores/cart.ts' });
```

### `hideState(element, hidden = true): void`

Leaves `element` out of the devtools; `hideState(element, false)` lists it again.

### `setDevtoolsRegistration(mode): void`

`mode` is a `DevtoolsRegistration`: `'opt-out'` (default) lists every root element that is not hidden, `'opt-in'`
lists only elements named with `describeState()`.

## Production builds

Every function above, and the registration of an element at its construction, run only where
`process.env.NODE_ENV` is not `'production'`. A production build of the application replaces that expression, and
the bundler removes the registry and the devtools plugin; Vite does so completely. The functions remain as empty
functions. The library has no dependency on a devtools package: the plugin registers through the global hook the
devtools install in the page (`__VUE_DEVTOOLS_GLOBAL_HOOK__`), which every version of the devtools accepts.

## Several apps and server-side rendering

The inspector is added to every Vue app the devtools know of, and to the app of a component that constructs an
element; global state is shown in each of them. A module that builds global state is loaded once per process, so
on a server that renders pages every request shares it: build state per request there, as in
[Carrying server-rendered state to the client](/guide/cookbook#carrying-server-rendered-state-to-the-client).
