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

## `RejectException` for a reject that can fail

`RejectAction` calls `target.rebind(target.originalValue)` and has no handler, so it cannot fail and resolves with
the next handler's result. A reject that reaches a server (discarding a draft stored there) is asynchronous and can
fail or be refused. It would take a handler, as `SubmitAction` does, and end with a `RejectException` that extends
`CommandException`, the base `SubmitFailedException` and `SubmitRefusedException` share. Undecided: whether the
handler is an option of `RejectAction` or a separate action, and whether a refused and a failed reject are two
classes, as for a submit.

## Before the 3.0.0 release: what the application-state items need from the 3.0 surface

Every item of the next section is checked before 3.0.0 is tagged: does it belong in 3.x, and if so, what does its
implementation need from the surface 3.0 publishes — a hook, a payload shape, a policy such as value identity or
what a commit records. Each gets a short specification that answers that. Only the parts of the surface the
specifications show are needed are added or changed for 3.0; the items themselves are not implemented. An item
whose implementation would change published behaviour is a 4.0 change if it is not settled here.

## What application state asks of the library beyond what a form does

Application state is a design goal (`docs/guide/rationale.md`), and the things below that state held outside a form
may rely on are not settled. Each needs to be looked at and decided — implemented, left to the application with a
documented pattern, or declined — not necessarily built. Many of them, 3 onwards in particular, read as something a
plugin could add, so the plugin system (2) is decided first and may settle several of the others:

1. **Vue devtools: a timeline.** The inspector lists, shows and edits the state (`src/plugins/devtools/`); there is no
   timeline of transactions, actions and validation runs. It needs the observer hooks of plugins (2).
2. **Plugins: observers of events.** `installPlugin()` has the value pipeline (`onSetValue`, `onSetOriginalValue`),
   `onElementCreated` and `onCommit`; there are no hooks on the events (value, access and visibility changes,
   execute, validation runs), run after the element's own handlers, for persistence, logging and the devtools
   timeline.
3. **Undo, redo and a history of changes** (MobX-State-Tree, Redux devtools, Immer patches). A transaction already
   captures what it changes and can put it back; a history of committed transactions is the natural extension.
4. **Snapshots and patches as a stream of changes** (MobX-State-Tree `onPatch` / `applyPatch`, Immer patches). Every
   change as a serializable diff, for autosave, sync across tabs or devices, and collaborative editing.
5. **Normalized entities and references by id** (Redux Toolkit entity adapter, MobX-State-Tree references, the
   Apollo cache). One record several places point to, rather than a copy in each list that holds it.
6. **State machines and statecharts** (XState). Explicit states and the transitions allowed between them — draft,
   submitted, confirmed — with a transition refused where it is not allowed. Conditional actions cover part of it.
7. **State derived from a schema** (MobX-State-Tree types, Zod integrations). Groups, fields and validators built from
   one JSON Schema or Zod schema that also checks the shape.

## Making the library a state library as well

The library holds application state as well as forms; the documentation presents it as a forms library. What the
change of positioning needs, in order:

1. **The plugin system first** (item 2 above): observers on events. The guide below can only describe what it
   settles. Where state lives is decided: wherever the application builds it; the devtools list it by file and by
   component (`docs/api/devtools.md`).
2. **A guide page "Application state"**, beside The model: building state that is not a form, where to hold it (a
   module, `provide()`, a component), one definition with several instances, and links to the cookbook recipes
   (application state, hot module replacement, server-rendered state, free-form state, data from a server cache, a
   value loaded for another value, reacting to every change, an optimistic update).
3. **A page "Compared with Pinia"**: a factual table of what each library has and does not have — on this side
   transactions, validation, rules between fields and refusing a write; on Pinia's side the devtools timeline, plugins on every action, SSR
   support and `storeToRefs` — and when each fits. No ratings.
4. **The positioning itself**: design goals in `readme.md` and `docs/guide/rationale.md`, the home page
   (`docs/index.md`), and `description` and `keywords` in `package.json`, changed once 1–3 are done.
