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
documented pattern, or declined — not necessarily built. Many of them, 5 onwards in particular, read as something a
plugin could add, so the plugin system (2) is decided first and may settle several of the others:

1. **Vue devtools: editing and a timeline.** The inspector lists the state and shows it (`src/devtools/`); a value
   cannot be edited from the devtools yet, and there is no timeline of transactions, actions and validation runs.
   Editing writes through the element's setter, so it goes through a transaction. The timeline needs the hook on
   committed transactions that plugins (2) need as well.
2. **Plugins.** No extension point for cross-cutting behaviour such as persisting state between page loads.
3. **Derived values and functions next to the state.** They live outside the element, as `computed` and plain
   functions; undecided whether an element can carry them, and whether there is a subscription to every action that
   runs in a subtree.
4. **Cost per value.** Every value is an element with its state, its actions and its validity, which costs more
   than a plain reactive value for large, finely divided state.
5. **Undo, redo and a history of changes** (MobX-State-Tree, Redux devtools, Immer patches). A transaction already
   captures what it changes and can put it back; a history of committed transactions is the natural extension.
6. **Snapshots and patches as a stream of changes** (MobX-State-Tree `onPatch` / `applyPatch`, Immer patches). Every
    change as a serializable diff, for autosave, sync across tabs or devices, and collaborative editing.
7. **Normalized entities and references by id** (Redux Toolkit entity adapter, MobX-State-Tree references, the
    Apollo cache). One record several places point to, rather than a copy in each list that holds it.
8. **Server state** (TanStack Query, RTK Query): fetching, caching, invalidation and refetching.
9. **State machines and statecharts** (XState). Explicit states and the transitions allowed between them — draft,
    submitted, confirmed — with a transition refused where it is not allowed. Conditional actions cover part of it.
10. **A strict mode** (MobX `enforceActions`, Vuex strict mode). A warning or an error for a change made outside the
    allowed path — here, a write into an object a field holds, which bypasses transactions and announces nothing.
11. **State derived from a schema** (MobX-State-Tree types, Zod integrations). Groups, fields and validators built from
    one JSON Schema or Zod schema that also checks the shape.
12. **Asynchronous derived state with Suspense** (Jotai and Recoil async atoms). A derived value that is a promise, and
    a component that waits for it.

## Making the library a state library as well

The library holds application state as well as forms; the documentation presents it as a forms library. What the
change of positioning needs, in order:

1. **The plugin system first** (item 2 above). The guide below can only describe what it settles. Where state lives
   is decided: wherever the application builds it; the devtools list it by file and by component (`docs/api/devtools.md`).
2. **A guide page "Application state"**, beside The model: building state that is not a form, where to hold it (a
   module, `provide()`, a component), one definition with several instances, and links to the cookbook recipes
   (application state, hot module replacement, server-rendered state, free-form state, reacting to every change, an
   optimistic update).
3. **A page "Compared with Pinia"**: a factual table of what each library has and does not have — on this side
   transactions, validation, rules between fields and refusing a write; on Pinia's side the devtools timeline and editing, plugins, SSR
   support and `storeToRefs` — and when each fits. No ratings.
4. **The positioning itself**: design goals in `readme.md` and `docs/guide/rationale.md`, the home page
   (`docs/index.md`), and `description` and `keywords` in `package.json`, changed once 1–3 are done.
