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
documented pattern, or declined — not necessarily built. Many of them, 4 onwards in particular, read as something a
plugin could add, so the plugin system (2) is decided first and may settle several of the others:

1. **Vue devtools: a timeline.** The inspector lists, shows and edits the state (`src/devtools/`); there is no
   timeline of transactions, actions and validation runs. It needs the hook on committed transactions that plugins
   (2) need as well.
2. **Plugins.** No extension point for cross-cutting behaviour. Two kinds are planned, installed with
   `installPlugin()` and run in the order of installation:
   - a value pipeline (`onSetValue`) on the write of a field's value slot, on every path that writes it
     (construction, the `value` setter, `rebind()`): each plugin receives the previous plugin's result, and the last
     result is stored. `ValueChangedAction` receives the stored value. The first plugin is tracking (below);
   - observers on the existing events (value, access and visibility changes, execute, validation runs), run after
     the element's own handlers, for persistence, logging and the devtools timeline.
3. **Tracking writes into an object a field holds** (MobX observable objects). A write into an object a `Field`
   holds is outside the contract (`docs/guide/model.md`). An opt-in plugin, exported from
   `@dynamicforms/vue-forms/plugins/tracking`, makes such writes changes of the field: a proxy over plain objects,
   arrays, `Map`, `Set` and `Date` that writes in place, records a shallow copy of the old value along the path and
   runs the setter's path with it, so `*Changing*`, `ValueChangedAction`, validation and rollback apply. The field
   takes a deep copy on assignment, so a reference the application kept is no longer the field's. A class instance
   is stored without a proxy, with a development warning that can be suppressed per value and globally.
4. **Undo, redo and a history of changes** (MobX-State-Tree, Redux devtools, Immer patches). A transaction already
   captures what it changes and can put it back; a history of committed transactions is the natural extension.
5. **Snapshots and patches as a stream of changes** (MobX-State-Tree `onPatch` / `applyPatch`, Immer patches). Every
   change as a serializable diff, for autosave, sync across tabs or devices, and collaborative editing.
6. **Normalized entities and references by id** (Redux Toolkit entity adapter, MobX-State-Tree references, the
   Apollo cache). One record several places point to, rather than a copy in each list that holds it.
7. **State machines and statecharts** (XState). Explicit states and the transitions allowed between them — draft,
   submitted, confirmed — with a transition refused where it is not allowed. Conditional actions cover part of it.
8. **State derived from a schema** (MobX-State-Tree types, Zod integrations). Groups, fields and validators built from
   one JSON Schema or Zod schema that also checks the shape.

## Making the library a state library as well

The library holds application state as well as forms; the documentation presents it as a forms library. What the
change of positioning needs, in order:

1. **The plugin system first** (item 2 above). The guide below can only describe what it settles. Where state lives
   is decided: wherever the application builds it; the devtools list it by file and by component (`docs/api/devtools.md`).
2. **A guide page "Application state"**, beside The model: building state that is not a form, where to hold it (a
   module, `provide()`, a component), one definition with several instances, and links to the cookbook recipes
   (application state, hot module replacement, server-rendered state, free-form state, data from a server cache, a
   value loaded for another value, reacting to every change, an optimistic update).
3. **A page "Compared with Pinia"**: a factual table of what each library has and does not have — on this side
   transactions, validation, rules between fields and refusing a write; on Pinia's side the devtools timeline and editing, plugins, SSR
   support and `storeToRefs` — and when each fits. No ratings.
4. **The positioning itself**: design goals in `readme.md` and `docs/guide/rationale.md`, the home page
   (`docs/index.md`), and `description` and `keywords` in `package.json`, changed once 1–3 are done.
