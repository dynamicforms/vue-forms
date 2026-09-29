# TODO

Open questions about the library — things not yet decided, as opposed to decisions already made and their
reasoning, which belong in `DECISIONS.md`. An entry here is closed by making the decision: it moves to
`DECISIONS.md` as a normal entry, and is deleted from this file rather than marked resolved.

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

Application state is a design goal (`docs/guide/rationale.md`), and eight things state held outside a form commonly
relies on are not settled. Each needs to be looked at and decided — implemented, left to the application with a
documented pattern, or declined — not necessarily built:

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

## Features other state libraries offer

Eight capabilities other state libraries are known for, each a candidate to be looked at and decided. Most read as
something a plugin could add once there is a plugin system (point 5 above), so that decision comes first and several
of these may be settled by it: built as plugins, left to the application, or declined.

1. **Undo, redo and a history of changes** (MobX-State-Tree, Redux devtools, Immer patches). A transaction already
   captures what it changes and can put it back; a history of committed transactions is the natural extension.
2. **Snapshots and patches as a stream of changes** (MobX-State-Tree `onPatch` / `applyPatch`, Immer patches). Every
   change as a serializable diff, for autosave, sync across tabs or devices, and collaborative editing.
3. **Normalized entities and references by id** (Redux Toolkit entity adapter, MobX-State-Tree references, the
   Apollo cache). One record several places point to, rather than a copy in each list that holds it.
4. **Server state** (TanStack Query, RTK Query): fetching, caching, invalidation, refetching, and optimistic updates
   rolled back when the server refuses them — the last maps directly onto transactions.
5. **State machines and statecharts** (XState). Explicit states and the transitions allowed between them — draft,
   submitted, confirmed — with a transition refused where it is not allowed. Conditional actions cover part of it.
6. **A strict mode** (MobX `enforceActions`, Vuex strict mode). A warning or an error for a change made outside the
   allowed path — here, a write into an object a field holds, which bypasses transactions and announces nothing.
7. **State derived from a schema** (MobX-State-Tree types, Zod integrations). Groups, fields and validators built from
   one JSON Schema or Zod schema that also checks the shape.
8. **Asynchronous derived state with Suspense** (Jotai and Recoil async atoms). A derived value that is a promise, and
   a component that waits for it.
