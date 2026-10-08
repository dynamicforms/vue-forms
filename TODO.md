# TODO

Open questions and known defects of the library. A decision made on an open question moves to `DECISIONS.md` as a
normal entry. A closed entry is deleted from this file, not marked resolved.

---

## `X` does not reach a validator's or an action's own callback

A validator's callback receives its field typed `FieldBase<T>`, so reading `field.extra` inside one answers
`Readonly<{}>` and needs a cast; the same is true of `FieldActionExecute`. The element a rule is registered on
carries the full `FieldBase<T, X>` type — the gap is only in what the callback signatures themselves state.

Threading `X` through both would reach every action class and every signature that takes an element as a
parameter, which is a wider change than adding the type argument to `FieldBase` was (`DECISIONS.md`, "Extended
properties live in one tracked slot..."). Undecided whether that is worth doing, and if so, whether `X` defaults
to `{}` on those signatures the way it does everywhere else or is required to be stated explicitly.

## What application state asks of the library beyond what a form does

Application state is a design goal (`docs/guide/rationale.md`), and the things below that state held outside a form
may rely on are not settled. Each needs to be looked at and decided — implemented, left to the application with a
documented pattern, or declined — not necessarily built. Many of them, 9 onwards in particular, read as something a
plugin could add, so the plugin system (5) is decided first and may settle several of the others:

1. **Where state lives.** The library needs no global store object: state lives wherever the application builds it —
   a module, `provide()`, a component, any other place — and the same data can be held at whichever level suits it.
   That is a strength to keep, not a gap to close. What is undecided is how the library names those locations where
   something has to tell them apart: a devtools integration (3) has to show state held in many places, and an
   application that renders on the server or runs several apps in one process may want state bound to one Vue app,
   created on first use.
2. **Server-side rendering hydration.** Nothing carries state serialized on the server into the client.
3. **Vue devtools.** No inspector of the element tree, no timeline of changes and actions, no editing from devtools.
   An inspector has to list state that lives in many places, so it is likely where the naming of locations (1) gets
   decided.
4. **Hot module replacement.** Replacing a module that builds state builds it again and loses what it held.
5. **Plugins.** No extension point for cross-cutting behaviour such as persisting state between page loads.
6. **Derived values and functions next to the state.** They live outside the element, as `computed` and plain
   functions; undecided whether an element can carry them, and whether there is a subscription to every change of
   a subtree and to every action that runs in it.
7. **Free-form state.** Every part of the state is declared as an element and a new key needs `addField()`; an
   object held by one field is one value, and a write into it goes through no transaction and announces nothing.
8. **Cost per value.** Every value is an element with its state, its actions and its validity, which costs more
   than a plain reactive value for large, finely divided state.
9. **Undo, redo and a history of changes** (MobX-State-Tree, Redux devtools, Immer patches). A transaction already
   captures what it changes and can put it back; a history of committed transactions is the natural extension.
10. **Snapshots and patches as a stream of changes** (MobX-State-Tree `onPatch` / `applyPatch`, Immer patches). Every
    change as a serializable diff, for autosave, sync across tabs or devices, and collaborative editing.
11. **Normalized entities and references by id** (Redux Toolkit entity adapter, MobX-State-Tree references, the
    Apollo cache). One record several places point to, rather than a copy in each list that holds it.
12. **Server state** (TanStack Query, RTK Query): fetching, caching, invalidation, refetching, and optimistic updates
    rolled back when the server refuses them — the last maps directly onto transactions.
13. **State machines and statecharts** (XState). Explicit states and the transitions allowed between them — draft,
    submitted, confirmed — with a transition refused where it is not allowed. Conditional actions cover part of it.
14. **A strict mode** (MobX `enforceActions`, Vuex strict mode). A warning or an error for a change made outside the
    allowed path — here, a write into an object a field holds, which bypasses transactions and announces nothing.
15. **State derived from a schema** (MobX-State-Tree types, Zod integrations). Groups, fields and validators built from
    one JSON Schema or Zod schema that also checks the shape.
16. **Asynchronous derived state with Suspense** (Jotai and Recoil async atoms). A derived value that is a promise, and
    a component that waits for it.

## Known defects

Each item was reproduced against 3.0.0.

1. **`Required` and the length validators mis-measure non-plain objects.** An empty `Map` or `Set` passes `Required`;
    a null-prototype object throws during construction.
2. **A value can inject a placeholder into a message.** `interpolate` replaces one param after another, so a value
    `'{minLength}'` is replaced again by a later param.
3. **A list row whose shape differs from the item template ignores a value assignment.** `push()` accepts any
    element; a later `list.value = [...]` resets the row through the template and drops the data.
4. **`Action.execute()` resolves on abort.** The documented `try { await save.execute() } catch` reports success.
5. **A missing `classIdentifier` throws on the next trigger, not on registration**, and then breaks every later
    trigger on that element.
6. **The `CountingAction` example in `docs/api/actions.md` never fires**: it overrides `classIdentifier`.
7. **View error messages name `$addField()`, `$removeField()` and `$value`**, which do not exist; the members are on
    `$`.
8. **`engines.node` admits 22.0–22.11**, which cannot `require()` the package without a flag.
9. **`scripts/verify-artifact.mjs` checks 25 of the 48 runtime exports.**

## Design questions

1. **What "changed" measures.** `isChanged` and `originalValue` follow what an element sends; `ValueChangedAction`,
   `bind`, `rebind` and `view` follow what it holds (`fullValue`).
2. **Registration on a binding.** `registerAction` on any binding registers on the declaration, so on the template and
   every row. An element cannot take a rule of its own.
3. **`touched` of an empty container** cannot be set, so an error such as "add at least one row" is never shown by a
   layer that shows errors once touched. `List` ignores `params.touched`; `Group` applies it.
4. **List row events** fire for `push`, `insert` and `remove`, not for a `value` assignment or `clear()`; the view's
   `sort()` and `reverse()` fire a removal and an addition per row.
5. **Typing.** `List.push` and `List.insert` take `any`. `Group.field(key)` returns `T[K] | null` for a declared key.
6. **Public internals.** `beginValidating`, `endValidating`, `validationEpoch`, `markRecordIncomplete` and
   `triggerAction` are public; an extra `endValidating()` resolves `settled()` before validation ends.
7. **`tx.rollback()` throws a signal** that an application `try/catch` inside the transaction swallows; the
    transaction then commits.
8. **Operators.** `EQUALS` is `==`; `INCLUDES` works on strings only while `IN` is a substring test; ordering
    operators compare `null` as JavaScript does; `OperandType` is `any`; `Operator.isDefined` throws on an unknown
    value.
9. **`isEqual`** shares lodash's name and treats an element as equal to its raw value.
10. **Conditional actions** register a relay on their source fields in the constructor, which is never removed and is
    cut off by a later `ValueChangedAction` on the source that does not call `supr`.
11. **`Group.createFromFormData()`** is described as the inverse of `value`, but wraps each top-level key in a `Field`.
