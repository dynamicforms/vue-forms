# Plugins

A plugin adds behaviour to every element. The library has two plugins: [tracking](#tracking), exported from
`@dynamicforms/vue-forms/plugins/tracking`, which an application that does not import it does not bundle, and the
[devtools](/api/devtools), which the library installs in development.

```typescript
import { installPlugin } from '@dynamicforms/vue-forms';
import { tracking } from '@dynamicforms/vue-forms/plugins/tracking';

installPlugin(tracking);
```

## `installPlugin(plugin): () => void`

Installs `plugin` for every element, the ones already built included: a hook runs on the element's next write.
Returns a function that uninstalls it. A value stored while the plugin was installed stays as the plugin stored it.

A plugin is installed for the module instance of the package, so for every Vue app on the page, and on a server
that renders pages, for every request. A plugin installed twice runs twice.

## `Plugin`

Every member is optional.

| Member | Called |
|---|---|
| `setup(context)` | once, by `installPlugin()`, with the [`PluginContext`](#plugincontext) |
| `onSetValue(value, element)` | on every write of the value a `Field` or an `Action` holds: the construction, the `value` setter and `rebind()` |
| `onSetOriginalValue(value, element)` | on every write of `originalValue` of any element, a container's included |
| `onElementCreated(element, binding)` | at the start of every element's construction, before its parameters are applied. `binding` is `true` for an element `bind()` builds, the rows of a `List` and their members included |
| `onElementAdopted(element)` | when a container takes `element` as its member, once the transaction that took it commits; not where it is rolled back |
| `onCommit()` | after every committed transaction, once its changes are announced; not after a rollback |

Every hook runs in the order of installation. The value hooks run as a pipeline: the first receives the value being
written, each following one receives the previous one's result, and the last result is stored.

- A write of the value the field already holds (the same object, or `NaN` over `NaN`) is not a write and calls no
  hook.
- A rollback restores the stored value without calling a hook.
- `field.value`, the validators and `ValueChangedAction` receive the stored value, not the value assigned.

```typescript
installPlugin({
  onSetValue(value, element) {
    console.debug(element.fieldName, value);
    return value;
  },
});
```

## `PluginContext`

### `changeInPlace(element, write, undo, copy): void`

Makes a write into the value `element` holds a change of the field. `element` is a `Field`; any other element throws
a `TypeError`. It opens a transaction, or joins the open one, and in it:

1. where this is the first such write since the field's last announcement, records `copy()` as the old value;
2. calls `write()`;
3. registers `undo()` with the transaction for a rollback;
4. runs the field's validators and enrols the field, so the commit fires `ValueChangedAction` with the value the
   field holds and the recorded old value.

`write()` and `undo()` change the object the field holds. Readers of `field.value` re-run after the change.

### `isInternal(element): boolean`

`true` for an element that is part of another element's definition: a binding (an element `bind()` built, such as a
row of a `List`) or a `List`'s item template.

## Tracking

```typescript
import { setTrackingWarnings, tracking, untracked } from '@dynamicforms/vue-forms/plugins/tracking';
```

Without this plugin a `Field` holds its value as one unit, and only an assignment to `value` is a change
([Where a value comes from](/guide/model#where-a-value-comes-from)). With it, a write into an object or an array the
field holds is a change of the field as well:

```typescript
address.value.city = 'Bled';   // a transaction, validation, ValueChangedAction, isChanged
```

### What is tracked

A `Field` stores a copy of the value it is assigned, at every level of the value:

| In the assigned value | Stored as | A change of the field |
|---|---|---|
| a plain object | a proxy over a copy | a property write, `delete` |
| an array | a proxy over a copy | an index write, `length`, every mutating method (`push`, `splice`, `sort`, …): one change per call |
| `Map` | a `TrackedMap` copy | `set`, `delete`, `clear` |
| `Set` | a `TrackedSet` copy | `add`, `delete`, `clear` |
| `Date` | a `TrackedDate` copy | every `set…` method |
| a class instance | the instance itself | none; a development warning |
| an element, a value marked with `untracked()` or `markRaw()` | the value itself | none |

`TrackedMap`, `TrackedSet` and `TrackedDate` are subclasses of `Map`, `Set` and `Date`, so `instanceof` and the
collection methods work as on the originals. A `Map`'s keys are kept as they are; its values and a `Set`'s items
are copied, so `set.has(object)` with the object that was assigned is `false`.

### How a write behaves

- **The field holds its own copy.** A reference the application kept is not linked to the field: writing into it
  does not change the field.

  ```typescript
  const address = { city: 'Ljubljana' };
  field.value = address;
  address.city = 'Bled';           // field.value.city is still 'Ljubljana'
  ```

- **An object read from the value stays that object.** A row read from an array the field holds is the row in the
  field after the array is reordered, and a write to it is a change of the field. A value assigned from another
  field is copied.
- **A write is a change.** It runs in a transaction, the validators run over the value, and `ValueChangedAction`
  fires with the value the field holds and a copy of the value as it was before the first write since the last
  announcement. Writes inside one `transaction()` are one change. A write of the value a property already holds is
  not a change.
- **A rollback puts the writes back** into the same objects, newest first.
- **Every `originalValue` is a deep copy without tracking**, a container's included, so `isChanged` and
  `rebind(originalValue)` see a write into the value.
- **An `Action`'s value is stored as it is**, so a reactive object passed to an action stays linked to it.

Not tracked: `Object.defineProperty()` on a tracked object, a write into a class instance, and a value stored before
the plugin was installed.

### Cost

An assignment of an object value copies it in full. The first write into a value after an announcement copies the
value again, for the old value of `ValueChangedAction`. Every `originalValue` is a deep copy, a `List`'s and a
`Group`'s included.

### `untracked(value): T`

Marks `value` to be held as it is: without a copy, without tracking and without the warning a class instance gives.
Returns `value`.

### `setTrackingWarnings(enabled): void`

Turns the development warning for a class instance held without tracking on or off. It is on by default and shown
once per instance. A production build has no warning.
