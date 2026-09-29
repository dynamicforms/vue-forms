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

1. **Scope per application.** Where state lives is the application's choice — a module, `provide()`, a component —
   and the library ties it to none. Undecided whether it offers a way to bind state to a Vue app, created on first
   use, for applications that render on the server or run many apps in one process.
2. **Server-side rendering hydration.** Nothing carries state serialized on the server into the client.
3. **Vue devtools.** No inspector of the element tree, no timeline of changes and actions, no editing from devtools.
4. **Hot module replacement.** Replacing a module that builds state builds it again and loses what it held.
5. **Plugins.** No extension point for cross-cutting behaviour such as persisting state between page loads.
6. **Derived values and functions next to the state.** They live outside the element, as `computed` and plain
   functions; undecided whether an element can carry them, and whether there is a subscription to every change of
   a subtree and to every action that runs in it.
7. **Free-form state.** Every part of the state is declared as an element and a new key needs `addField()`; an
   object held by one field is one value, and a write into it goes through no transaction and announces nothing.
8. **Cost per value.** Every value is an element with its state, its actions and its validity, which costs more
   than a plain reactive value for large, finely divided state.
