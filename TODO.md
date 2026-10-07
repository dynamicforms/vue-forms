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

1. **An extended property named like a member overwrites the member.** `assignParams` (`src/field-base.ts`) writes
   every key that exists on the element directly onto it. `new Field({ value: 1, validate: true })` throws
   `this.validate is not a function`; `bind`, `settled` are overwritten silently; `state` throws a getter error. The
   type of a declared `X` does not prevent it.
2. **A kept error carries stale `params`.** `ValidationError.sameAs` does not compare `params`, so a re-run that
   renders the same text keeps the old instance. `MinValue(5)` on 1, then 2: `params.newValue` is `1`.
3. **`Pattern` with the `g` or `y` flag alternates its result.** `RegExp.test` keeps `lastIndex`. `/^\d+$/g` over
   `'12'`, `'34'`, `'56'`, `'78'`: valid `[true, false, true, false]`.
4. **`VisibilityChangingAction` returning the old value does not refuse the write.** The `visibility` setter lacks the
   `written === oldValue` check the `access` setter has; `VisibilityChangedAction` fires with `full → full`.
5. **One conditional action registered on two elements of a record applies only to the first.**
   `ConditionalStatementAction.applyIn` keeps the last result per scope, not per target.
6. **The cookbook reset recipe `group.rebind(group.originalValue)` loses a disabled member's data.** `originalValue`
   is built from `value`, which leaves the disabled member out; `rebind` fills it from the template.
7. **Writing `NaN` over `NaN` announces a change every time.** The setter and the commit compare with `===`.
8. **`componentVHtml` on a component replaces the component's own output.** `MessagesWidget` sets it as `innerHTML`
   for every component, not only for HTML elements. See also the design question on `componentVHtml`.
9. **`AccessChangedAction`, `EnabledChangedAction` and `VisibilityChangedAction` fire inside the setter.** They are not
   netted over the transaction and fire for writes a rollback undoes. Value events are deferred to the commit.
10. **Reading `view(list)` is O(n) per access.** `shown()` copies `list.items` on every index or `length` read;
    `reduce` over 8000 rows takes about 230 ms against 2 ms over `list.items`.
11. **`List.insert()` and `List.remove()` cost grows with the list length.** About 12 ms per call at 16 000 rows; the
    docs state "one row". The benchmark measures only 1000 rows.
12. **Value validators treat empty and non-numeric values inconsistently.** `MinValue(5)` fails `null` and
    `undefined` but passes `NaN` and `'abc'`; `MaxValue(10)` fails `undefined` and passes `null`; `Pattern` tests
    `'null'` and `'undefined'` as strings. An optional numeric field cannot be validated.
13. **`Required` and the length validators mis-measure non-plain objects.** An empty `Map` or `Set` passes `Required`;
    a null-prototype object throws during construction.
14. **A value can inject a placeholder into a message.** `interpolate` replaces one param after another, so a value
    `'{minLength}'` is replaced again by a later param.
15. **`MessagesWidget` logs a `vue-markdown` warning on every mount** when no `vue-markdown` is registered, also for
    plain text. `resolveComponent` runs in setup instead of the markdown branch.
16. **A list row whose shape differs from the item template ignores a value assignment.** `push()` accepts any
    element; a later `list.value = [...]` resets the row through the template and drops the data.
17. **`Action.execute()` resolves on abort.** The documented `try { await save.execute() } catch` reports success.
18. **A missing `classIdentifier` throws on the next trigger, not on registration**, and then breaks every later
    trigger on that element.
19. **The `CountingAction` example in `docs/api/actions.md` never fires**: it overrides `classIdentifier`.
20. **View error messages name `$addField()`, `$removeField()` and `$value`**, which do not exist; the members are on
    `$`.
21. **`engines.node` admits 22.0–22.11**, which cannot `require()` the package without a flag.
22. **`scripts/verify-artifact.mjs` checks 25 of the 48 runtime exports.**

## Contradictions in the documentation

1. **A write into a disabled field.** `docs/api/field.md` (rebind), `docs/api/actions.md` (two places) and
   `docs/examples/action.md` state that it is refused; the code and five other pages state that it is taken.
2. **Whether `busy` covers validation.** `readme.md`, `docs/api/validators.md` and `docs/examples/validators.md` state
   that it does, and the validators demo disables submit on `busy` only; the code and `docs/guide/model.md` state
   that it does not.
3. **`@click="save.execute()"`.** `docs/api/actions.md` states once that the rejection is unhandled and once that Vue
   catches it.
4. **Rollback and registrations.** `docs/api/transactions.md` states in one section that a rollback undoes an action
   registered in the transaction and that it does not; the code undoes it.
5. **`clearValidators()`** empties all errors of the element it is called on, but only the validator errors of the
   other bindings; `docs/guide/model.md` and `docs/api/field.md` state that every binding's errors are emptied.
6. **Writing a list view index past the end.** `docs/api/view.md` states `push()` per item; the code inserts at the
   index and fills the gap with template rows.
7. **"Frozen" values.** `docs/api/group.md` and `docs/api/list.md` state that the value is frozen; it is frozen one
   level deep, and a write into an array or object a field holds changes the field without an announcement.
8. **The migration guide** is described differently in `readme.md` and `docs/guide/getting-started.md`.

## Design questions

1. **`componentVHtml`.** It sets raw HTML on the rendered element, which renders markup without an extra DOM level.
   Undecided: how a component (as opposed to an HTML element) receives a body, how plain text is told apart from
   trusted HTML, and how the docs state that a value interpolated into it must be escaped. `@dynamicforms/vue-grid`
   renders every plain cell through it.
2. **What "changed" measures.** `isChanged` and `originalValue` follow what an element sends; `ValueChangedAction`,
   `bind`, `rebind` and `view` follow what it holds (`fullValue`). Defect 6 follows from the split.
3. **Registration on a binding.** `registerAction` on any binding registers on the declaration, so on the template and
   every row. An element cannot take a rule of its own.
4. **`touched` of an empty container** cannot be set, so an error such as "add at least one row" is never shown by a
   layer that shows errors once touched. `List` ignores `params.touched`; `Group` applies it.
5. **List row events** fire for `push`, `insert` and `remove`, not for a `value` assignment or `clear()`; the view's
   `sort()` and `reverse()` fire a removal and an addition per row.
6. **Typing.** `List.push` and `List.insert` take `any`. `Group.field(key)` returns `T[K] | null` for a declared key.
   The default export `Form` lacks `forms`, `getConfig` and `setConfig`; sibling packages use both import styles.
7. **Error constructors.** `ValidationError` and `ValidationErrorDescription` take five positional arguments in
   different orders; an options object for the trailing ones.
8. **`errorText` and messages of the application's own.** It is applied by class, so `CompareTo`, which requires a
   message, and any validator given a message never reach it.
9. **Public internals.** `beginValidating`, `endValidating`, `validationEpoch`, `markRecordIncomplete` and
   `triggerAction` are public; an extra `endValidating()` resolves `settled()` before validation ends.
10. **`tx.rollback()` throws a signal** that an application `try/catch` inside the transaction swallows; the
    transaction then commits.
11. **Operators.** `EQUALS` is `==`; `INCLUDES` works on strings only while `IN` is a substring test; ordering
    operators compare `null` as JavaScript does; `OperandType` is `any`; `Operator.isDefined` throws on an unknown
    value.
12. **`isEqual`** shares lodash's name and treats an element as equal to its raw value.
13. **Conditional actions** register a relay on their source fields in the constructor, which is never removed and is
    cut off by a later `ValueChangedAction` on the source that does not call `supr`.
14. **Render content names components by string only**, resolved globally; markdown requires a global component named
    `vue-markdown`.
15. **`Group.createFromFormData()`** is described as the inverse of `value`, but wraps each top-level key in a `Field`.

## Actions or `watch()`

Element state is reactive, so `watch()` reproduces `ValueChangedAction`, `AccessChangedAction`,
`VisibilityChangedAction` and `ValidChangedAction` used as observers, and the conditional actions on a flat form.
`watch()` does not:

- refuse or change a write (`*ChangingAction`);
- run inside the transaction, where a throw rolls it back;
- chain through `supr`, order handlers or abort;
- reach every row of a `List` from a rule on the item template;
- end with the element instead of an effect scope.

The documentation does not state when to choose which. `docs/guide/cookbook.md` ("Fields that depend on a type")
uses `watchEffect` for what the conditional actions do, without stating that it does not reach list rows.

## Documentation language

The documentation and the JSDoc of the public API are to be rewritten in plain technical English. Lowest-rated
pages: `docs/guide/model.md`, `docs/api/field.md`, `docs/api/actions.md`, `docs/api/group.md`,
`docs/examples/action.md`, and the JSDoc in `src/`. Recurring patterns:

- "answers" for returns or is (about 240), "verdict" for validity (about 150);
- personification: "states", "speaks for", "tells", "is asked", "stands", "hands back";
- explanation by negation: "rather than" (about 150), "no verdict, not a pass", "nothing stops";
- the dash as a clause connector (about 450);
- measurements and history in JSDoc (`src/actions/actions-map.ts`, `src/is-equal.ts`, `src/container.ts`) and in
  `docs/api/transactions.md`;
- the same paragraph on several pages (`toStringTag` and `isEqual`; why `Action` is not UI-agnostic);
- terminology for one concept under several names: sends, contributes, serializes; item template, template,
  declaration; "field" for any element;
- the "Conclusion" section of `readme.md`.
