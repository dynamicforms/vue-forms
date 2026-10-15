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

## Memory footprint of application state (before 3.0.0)

A field retains about 1.5 KiB of heap, and a 1000-row list of eight fields about 11.8 MiB (`bench/RESULTS.md`,
"Memory and structure", the 0.10.x column). For a form this is not a constraint. For application state held in fields, groups and
lists it limits how much state an application can hold this way. Undecided, before 3.0.0 is released:

- whether the documentation states application state as a supporting role, for state of the size of a form,
  with the limit given in numbers, or
- whether the per-field footprint is reduced first: what a field allocates (the `ActionsMap`, the action
  instances, the reactive proxies, the per-field state of validators and conditional actions) and which of it can
  be shared through the declaration or allocated on first use.

The decision determines what the guide page "Application state" (below) states about the size of state.

## What application state asks of the library beyond what a form does

Application state is a design goal (`docs/guide/rationale.md`). Each item below belongs in 3.x, and each is added
without a change to what 3.0 publishes; what the 3.0 surface has to hold for them is settled in `DECISIONS.md`
(D-048, D-049). The commit record (2) comes first, since 1, 3 and 4 are built on it.

1. **Vue devtools: a timeline.** The inspector lists, shows and edits the state (`src/plugins/devtools/`); there is no
   timeline of transactions. Each committed transaction is a timeline event built from the commit record (2).
2. **Plugins: the commit record.** `onCommit()` takes an argument describing the committed transaction: each element
   it modified with its value, `originalValue`, access, visibility and validity before and after, and the rows added
   and removed with their index. The state before is the snapshot the transaction takes at an element's first write.
   An argument added to `onCommit` breaks no plugin that declares none. An optional origin tag on the transaction
   (`transaction(fn, options?)`) is carried by the record, so a sync plugin does not send back a change it applied.
3. **Undo, redo and a history of changes** (MobX-State-Tree, Redux devtools, Immer patches). A plugin exported from
   its own entry point, as tracking is, keeps the commit records; undo applies the state before of one record in a
   new transaction tagged as an undo. A removed row is released and can be put back into its list, so undoing a
   remove restores the same element.
4. **Snapshots and patches as a stream of changes** (MobX-State-Tree `onPatch` / `applyPatch`, Immer patches). A
   plugin that turns a commit record into a serializable patch addressed by path (member names and row indexes,
   resolved with `Group.field()` and `List.get()`), and applies a patch in a transaction tagged with its origin.
   `form.value` after a commit is a snapshot: it is frozen, and every part that did not change is the object of the
   previous snapshot.
5. **Normalized entities and references by id** (Redux Toolkit entity adapter, the Apollo cache). A container of
   records by key, and links that keep an element shown elsewhere equal to its record by writing one into the other
   in the same transaction (D-048). A new class and a plugin; no existing class changes.
6. **State machines and statecharts** (XState). A field holding the state, and a `ValueChangingAction` that refuses a
   transition the way `AccessChangingAction` refuses an access change. A new action class; nothing already
   registered behaves differently.
7. **State derived from a schema** (MobX-State-Tree types, Zod integrations). A builder of groups, fields and
   validators from a JSON Schema or a Zod schema, in its own entry point or package. It uses the published
   constructors only.

## The guide for application state

`readme.md`, the home page and `package.json` present the library as holding forms and application state. The guide
has no page for application state. What it needs, in order:

1. **The commit record first** (item 2 above). The guide below can only describe what it settles. Where state
   lives is decided: wherever the application builds it; the devtools list it by file and by component
   (`docs/api/devtools.md`).
2. **A guide page "Application state"**, beside The model: building state that is not a form, where to hold it (a
   module, `provide()`, a component), one definition with several instances, and links to the cookbook recipes
   (application state, hot module replacement, server-rendered state, free-form state, data from a server cache, a
   value loaded for another value, reacting to every change, an optimistic update).
3. **A page "Compared with Pinia"**: a factual table of what each library has and does not have — on this side
   transactions, validation, rules between fields and refusing a write; on Pinia's side the devtools timeline, plugins on every action, SSR
   support and `storeToRefs` — and when each fits. No ratings.

## Bindings recorded on a long-lived declaration

A declaration records each binding made from it as a `WeakRef` (`bindingsMade` in `src/field-base.ts`). A dead
reference is removed only when `boundElements` is read, which a registration, an unregistration and
`clearValidators()` do. A declaration that makes and drops bindings without a registration, such as a form declaration
bound for every record a dialog opens, keeps one `WeakRef` object per binding it has made: about 30 to 120 bytes per
binding in `bench/long-run-harness.mjs` (see "Long-running use" in `bench/RESULTS.md`). A row a list adds and removes
is such a binding of the item template. Pruning on registration removes few references, because `deref()` returns a
dropped binding until a full collection has run. Undecided: whether the set is pruned when a binding is
recorded, or by a `FinalizationRegistry`.

## `CompareTo` keeps its listener after removal

`CompareTo` registers a `ValueChangedAction` on the compared element and adds the declarations it is registered on to
a `Set`. `unregisterFrom()` removes neither: the listener stays on the compared element and the `Set` keeps the
declarations reachable. The listener applies nothing after removal, because it revalidates only the elements the
validator is still registered on. A form that adds a field with `CompareTo` and removes it again retains about
1.7 KiB per cycle, and the compared field keeps one action per cycle, all of which run on each write to it (see
"Long-running use" in `bench/RESULTS.md`).

## A test of the packed package

`scripts/verify-artifact.mjs` imports the built `dist/` from the repository. A test that installs the output of
`npm pack` into a separate project would also check `files`, `exports`, the tracking entry point and the type
declarations as a consumer resolves them.

## Size of the documentation chunks

`npm run docs:build` reports chunks larger than 500 kB after minification. The initial download of a page with the
Vuetify examples is not measured. Undecided: whether the examples are loaded lazily.

## Validator registration and runs in `FieldBase`

`FieldBase` holds the element state, the parent links, errors, access, bindings, the registration of actions and the
transaction protocol. Undecided: whether the registration of actions and the bookkeeping of validator runs move into
a module of their own.
