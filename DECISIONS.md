# Decision record

The decisions currently in force: what the library does, why, and which alternatives were rejected. A decision that
no longer holds is deleted or rewritten; `git log` holds the history. An open question belongs in `TODO.md`.

Numbers are permanent. A deleted decision leaves a gap, and a number is never reused.

Each entry states:

- **Since:** the first release carrying the decision in its current form (a release tag where one exists, otherwise
  the version `package.json` names), the commit that introduced it, and its date.
- **Tests:** the spec ranges that assert the behaviour. **Checked by:** a non-test mechanism, where no unit test
  can assert the decision. A decision about what the library does not provide has neither.

---

## D-001 — Element state lives in private class fields; elements compare by identity under lodash `isEqual`

**Since:** 1.1.0 · `a18f801` (#35) · 2026-09-05\
**Tests:** `src/field-base.spec.ts:652–698`, `src/is-equal.spec.ts`, `src/group.spec.ts:551–658`

An element's mutable state, including the link to its parent, is in ECMAScript private class fields (`#state`,
`#raw` on `FieldBase`). `Object.keys`, `Object.getOwnPropertySymbols`, `JSON.stringify` and lodash do not reach it.

- lodash `isEqual(new Field({ value: 1 }), new Field({ value: 1 }))` is `false`; `isEqual(field, field)` is `true`.
  A `Symbol.toStringTag` accessor on the prototype gives lodash a tag it does not recognise, so it compares
  identity.
- The package's own `isEqual` (`src/is-equal.ts`, exported from the root) compares a `FieldBase` by its `value`,
  at any depth: `isEqual(new Field({ value: 1 }), new Field({ value: 1 }))` is `true`, and
  `isEqual(list.items, other.items)` compares the rows' values.

**Reason.** The parent link has to be invisible to any walker, or `JSON.stringify` and `isEqual` recurse from a child
into its parent. Private fields hide it at no per-instance cost.

**Rejected.**

- A non-enumerable accessor per instance: `Object.defineProperty` puts the object into dictionary mode, about 765
  bytes per field, 40 % of an element's retained size.
- Enumerable symbol keys: lodash compares own enumerable symbols, so two equal fields in different parents compare
  unequal, and every element is walked twice.
- Private links with reachable values: `parent` is a tracked read, so the links would need a second reactive proxy
  per element.

---

## D-003 — `transaction` is a free function, and rollback is reachable only from inside the callback

**Since:** 0.11.0 · `5ee4127` · 2026-08-17\
**Tests:** `src/transaction.spec.ts:182–207`, `src/tests/validity-events.spec.ts:697–809`,
`src/tests/design-fixes.spec.ts:80–95`

`transaction(fn)` is exported from the package root and is not a method of any element. It returns the callback's
result, typed `R | undefined`. The callback receives a control object with `rollback()`, which unwinds immediately and
makes `transaction` return `undefined`. A throw in the callback rolls back and rethrows.

**Reason.** There is one open transaction at a time, held in a module-level variable, and every mutating operation
anywhere joins it. A method `form.transaction()` would suggest a transaction scoped to `form`.

**Rejected.**

- `tx.setRollbackOnly()` (JDBC): code after the call keeps mutating a transaction that will be rolled back.
- A handle usable after `transaction()` returns: a rollback after the commit would have to retract announced
  events. A transaction cannot span an `await`; cancelling an edit in a dialog restores a snapshot of the value by
  assignment.

---

## D-005 — Copy-on-first-write snapshots are not optional

**Since:** 0.11.0 · `5ee4127` · 2026-08-17\
**Tests:** `src/tests/validity-events.spec.ts:697–809`, `src/tests/extended-properties.spec.ts:128–148`,
`src/tests/bind.spec.ts:121–335`

A transaction records the state of every element it modifies at the element's first write, and a rollback restores
it. Recording cannot be switched off.

**Reason.** An operation that can half-apply is the defect transactions exist to prevent, and the bulk paths an
opt-out would serve are where a half-applied state does the most damage. The record costs about 0.2 µs per element.

**Rejected.** A global opt-out flag.

---

## D-006 — A rollback restores registrations, and leaves validation runs in flight

**Since:** 0.12.0 · `4e85904` · 2026-08-18\
**Tests:** `src/actions/actions-map.spec.ts:184–231`, `src/transaction.spec.ts:19–77`,
`src/transaction.spec.ts:145–180`, `src/tests/validator-async.spec.ts:174–265`

`registerAction`, `registerActionBefore`, `unregisterAction` and `clearValidators()` each register an undo with the
transaction, so a rollback reverses them.

`validatingCount` is not restored. A run started in a rolled-back transaction has its `AbortSignal` aborted, runs to
completion, and its verdict is discarded: the validator's `isCurrent()` reads the unwound transaction, the run
counter and the validation epoch.

**Reason.** Restoring the count would desynchronise it from the `endValidating` calls still pending: `validating`
would read `false` with a run in flight and then go negative.

**Rejected.** Applying the verdict of such a run: the field would be invalid over a value the form no longer holds.

---

## D-012 — `execute()` rejects when a handler fails, and resolves with an abort

**Since:** 0.17.1 · `7e2f19c` · 2026-08-21\
**Tests:** `src/action.spec.ts:165–248`, `src/actions/actions-map.spec.ts:276–561`,
`src/tests/action-commands.spec.ts:223–485`

A handler that throws rejects the promise `execute()` returns; the library catches nothing. An
`AbortEventHandlingException` is an answer, not a failure: the trigger resolves with it on the synchronous and on the
asynchronous path, and `triggerEager()` ends only the identifier group it was raised in. A handler's answer is
treated as a promise when it is `instanceof Promise`.

A caller that neither awaits `execute()` nor attaches `.catch()` gets an unhandled rejection. Vue attaches its own
catch to a promise an event handler returns, so `@click="save.execute()"` reaches `app.config.errorHandler`.

**Rejected.**

- Catching inside `execute()`: a swallowed submit failure is worse than an unhandled rejection, and a
  library-configured error handler would duplicate Vue's.
- A synchronous `execute()` with the promise exposed separately: `busy` is cleared when the run settles, so the
  method awaits the chain anyway.
- A `then` member as the promise test: a handler may answer with a value object that has one, and calling it
  replaces the answer. Consequence: an abort raised under a promise from another realm or library still rejects.
- Catching the abort in `supr`: inside the chain the abort stays an exception, so handlers that do not handle it
  are unwound instead of receiving the exception as a return value.

---

## D-014 — An element knows its declaration, and its record is derived from the container chain

**Since:** 0.11.0 · `5948e4a` · 2026-08-17\
**Tests:** `src/list.spec.ts:792–814`, `src/actions/conditional/conditional-statement-action.spec.ts:201–325`,
`src/validators/validator-compare-to.spec.ts:12–371`

`field.declaration` is the element a binding was made from, and a declared element answers with itself. The record
an element belongs to is the `List` row that holds it, or the top of the container chain where no row does. An action
that reads a second element resolves it by walking that element's path down from the record and checks the result
by its declaration, so an action shared by every row reads the row it runs for.

**Consequence.** Resolution is a path walk per evaluation. An element declared in one record and read from the
records below it (a form field every row reads) is resolved by walking the subtree.

**Rejected.** A shared declaration object with a slot array per row; see D-027.

---

## D-016 — An eager pass that reaches nothing runs again when the record is complete

**Since:** 0.11.0 · `5948e4a` · 2026-08-17\
**Tests:** `src/tests/record-completion.spec.ts:28–74`, `src/validators/validator-compare-to.spec.ts:12–371`

A row is built member by member, so a member's eager actions run before it has siblings or a row. An action that
reaches nothing calls `markRecordIncomplete()`. The `Group` runs the eager actions of such members again once it has
written its members, and the `List` once it has taken the row. A pass that still reaches nothing marks again, and
the next container above runs it.

**Reason.** Reaching nothing is no verdict, not a pass, and the value setter drops an assignment of the value the
field already holds, so a row equal to its template would never be validated again.

**Consequence.** A process-wide counter of waiting elements is read before any walk; a form whose actions all
resolve pays nothing. An element whose record never completes stays counted, and every container completed after it
walks its own subtree.

**Rejected.**

- Revalidating every member at the end of row construction: doubles the validator runs of every row.
- A static "needs the record" flag on the action class: it cannot tell a pass that resolved from one that did not,
  and every cross-field action author has to set it.
- Waiting for the next write: `form.valid` is wrong until the user edits the row.

---

## D-023 — Extended properties live in one tracked slot, are merged on write, and are routed by accessor

**Since:** 0.11.0 · `87e703b` · 2026-08-18\
**Tests:** `src/tests/extended-properties.spec.ts:15–254`, `src/tests/reactivity.spec.ts:183–197`,
`src/tests/defects.spec.ts:21–33`, `src/tests/extras-augmentation.spec.ts:94–110`, `src/tests/types.spec.ts:78–148`

`FieldBase<T, X extends object = {}>` carries properties a consumer declares beyond the class's members. `extra`
reads them, `setExtendedValues(values)` writes them, and the constructor takes them in the same parameter object.
`Field`, `Action`, `Group` and `List` pass `X` through. The default `{}` makes an undeclared property an
excess-property error.

- **Reactive.** The set is one slot of the element's state, so a render effect that reads `extra` re-runs on a write.
  An element without extended properties shares one frozen empty object.
- **Merged.** `setExtendedValues` takes `Partial<X>` and installs a new frozen object holding the merge. A rollback
  restores the previous object, and a caller cannot write through the object `extra` returned.
- **Routing.** A parameter key that names an accessor on the element's prototype chain below `Object.prototype` is
  assigned to the element; every other key, method names included, is an extended property. A getter-only accessor
  (`valid`, `parent`) throws a `TypeError`. `Action` declares `label` and `icon`, so they cannot be extended properties
  of an `Action`.
- **Subclass fields.** Parameters are applied inside the base constructor, before a subclass's class fields exist
  (`useDefineForClassFields` is `true`). A parameter named like a subclass class field becomes an extended property;
  a subclass member that parameters must reach is declared as an accessor.
- **Registrations.** `validators` and `actions` are taken out of the parameter object before routing.
  `IBindParams<T, X>` excludes `validators`, `actions`, `value`, `errors` and `touched`, so `bind()` rejects them at
  compile time.
- **`__proto__`.** The accumulator is prototype-less and ownership is tested with `Object.hasOwn`, so a `__proto__`
  key from parsed JSON becomes an extended property instead of replacing the accumulator's prototype.
- **Type.** The parameter type is `Partial<IFieldConstructorParams<T>> & Partial<NoInfer<X>>`.

**Rejected.**

- A plain untracked property: a UI layer rendering from `extra` would not update.
- Replacing the set on write: properties `X` declares as required would read `undefined`.
- An explicit list of base parameter names: every subclass has to extend it, and a subclass member of the same name
  is shadowed silently.
- `Partial<IFieldConstructorParams<T> & X>`: inference through the mapped intersection infers one constituent of a
  union, so `new Field({ value: stringOrNumber })` becomes `Field<string>`.

---

## D-025 — `bind(data, overrides)` creates a binding, and `rebind(data)` reuses one in place

**Since:** 0.11.0 · `ab7dcf5` · 2026-08-18\
**Tests:** `src/tests/bind.spec.ts:22–335`, `src/tests/consumer-subclass.spec.ts`

`bind(data?, overrides?)` creates an element of the same class carrying the source's actions, validators and extended
properties, detached, with `originalValue` set to `data`. `undefined` data keeps the source's value; `null` is data
and clears it. `overrides` is `IBindParams<T, X>`; `originalValue` in it is read by key presence.

`rebind(data)` writes `data` into the element as `resetTo(this.declaration, data)` and sets its announcement baseline
to the result. Data is measured against `declaration`: a key the record leaves out takes the declaration's value, so
a reused row equals a fresh `bind()` of the template.

- `rebind` announces no value change for the element it is called on.
- The members of a rebound group announce their new values, and a validity change is announced.
- Inside an open transaction, a change already owed is still announced from the state at the start of the
  transaction.

**Reason.** A recycled row is not an edit. Members announce because handlers derive state from them and because
`list.value = rows` reuses rows the same way. A container's `valid` is composed from its children's announced
verdicts, so a verdict change cannot be silenced.

**Rejected.**

- `bind(params)` with the data inside the object: `value` would read as an override, not as the record.
- `bind(data)` without overrides: `access`, `visibility`, `originalValue` and extended properties are overridden
  per binding.

---

## D-027 — A row is a group of elements bound from the item template

**Since:** 0.11.0 · `ab7dcf5` · 2026-08-18\
**Tests:** `src/list.spec.ts:710–814`, `src/list.spec.ts:941–986`

A `List` row is a `Group` of elements bound from the item template, each holding its own state. A row is an object
with its own identity, so `v-for` keys and component reuse need nothing extra, and property access is direct.

**Rejected.** A shared definition object holding validators, actions and defaults, with a row holding only state in
a slot array: it saves about 11 % of an element's memory and replaces every named state access
(`this.#state.originalValue`) with an indexed lookup.

---

## D-028 — The package ships one format: ESM

**Since:** 0.12.0 · `6e45f87` · 2026-08-18\
**Checked by:** `package.json` (`"type": "module"`, `exports` with `types` and `default` only, `engines.node` `>=22`),
`vite.config.ts` (`format: 'es'`), the `build` job of `.github/workflows/ci.yml` (`scripts/verify-artifact.mjs`)

There is no CJS or UMD build. `lodash-es` is the only runtime dependency. A CJS consumer uses `require()` of an ES
module, available from Node 20.19 and 22.12.

**Reason.** The library relies on `instanceof` and on module-level `Symbol()` values. A program that loads an ESM and a
CJS build holds two copies of every class and symbol, and a correct value fails with `Invalid fields object
provided`. The CJS build was 327 kB of 731 kB, and the UMD build required `lodash` (1.4 MB) as a dependency.

**Rejected.**

- Interchangeable builds via `Symbol.for` and a registry: a cost on every identity check.
- Keeping CJS and dropping only UMD: keeps the duplication.

---

## D-029 — The Vue peer floor is the version CI type-checks the declarations against

**Since:** 0.12.0 · `6e45f87` · 2026-08-18\
**Checked by:** the `vue-floor` job of `.github/workflows/ci.yml`

`peerDependencies.vue` is `^3.5.2`. The CI job reads the floor from `package.json`, installs exactly that version and
type-checks `dist/index.d.ts` with `skipLibCheck: false`.

**Reason.** The test suite runs on Vue 3.5, and the declared range starts in that minor. The runtime uses APIs from
3.2.0 (`getCurrentScope`, `onScopeDispose`), and the declarations compile from a 3.2 patch release (3.2.0 fails on
an error in Vue's own `runtime-core.d.ts`, 3.2.47 passes); nothing is run below 3.5.

**Rejected.** `^3.2`: a range that no test runs against.

---

## D-030 — Actions are one list, walked from the end

**Since:** 0.12.0 · `4e85904` · 2026-08-18\
**Tests:** `src/actions/actions-map.spec.ts:21–274`

`ActionsMap` holds one `FieldActionBase[]` in registration order. A trigger walks it from the end, skips actions
registered under another identifier, and hands each handler a `supr` that continues at the previous index.
`unregister()`, `triggerEagerFor()` and `hasEager` are walks of the same array. `registerActionBefore(action, before)`
inserts inside a named action and throws when `before` is not registered under the same identifier.

`Validator.unregisterFrom` runs inside the operation and withdraws the errors the validator put on the element, so a
rollback restores them along with the registration. Abandoning a run in flight is deferred to commit through
`Transaction.whenCommitted()`.

**Reason.** Registrations can be removed and rolled back individually, and eagerness is per action, not per
identifier. Over three actions the walk is about twice as fast as `Map.get`; keyed maps cost about 500 bytes per
declaration.

**Consequence.** `supr` recurses on the call stack: about 1300 handlers under one identifier on one element raise
`RangeError`.

**Rejected.**

- A composed closure chain: a registration cannot be removed, eagerness is per identifier, and each registration holds
  a closure for the element's lifetime.
- An index argument for ordering: an off-by-one places a handler in the wrong layer without an error.

---

## D-034 — `access` decides what is sent and validated, and `visibility` is presentation only

**Since:** 2.0.2 · `1d720be` · 2026-10-01\
**Tests:** `src/tests/serialization.spec.ts:57–168`, `src/tests/serialization.spec.ts:239–255`,
`src/tests/serialization.spec.ts:354–404`, `src/tests/effective-enabled.spec.ts:18–163`,
`src/field-base.spec.ts:757–880`

`access` is `'editable'`, `'readonly'`, `'disabled'` or `'disabled-null'`:

| `access` | accepts input | contributes to the container's `value` |
|---|---|---|
| `'editable'` | yes | its value |
| `'readonly'` | no | its value |
| `'disabled'` | no | nothing |
| `'disabled-null'` | no | `null` |

Validators run over what the element sends and not at all where `effectiveAccess` is `'disabled'`. `enabled` and
`effectiveEnabled` are derived from `access`. `EnabledChangingAction` can refuse a write of `access` that changes
`enabled`. `fullValue` holds every element. A container's `ValueChangedAction` reports held values, so a switch of
`access` alone does not fire it; `ContributionChangedAction` reports what an element sends. `visibility` is a
`Visibility` string for the rendering layer and affects nothing else.

**Reason.** A rendering layer reads `visibility` as presentation; an input rendered hidden stays mounted and can write
into a field. What an element sends needs a member of its own. The values follow HTML: `<input readonly>` is
submitted, `<input disabled>` is not. A required section sent as `null` fails, and the fields inside a disabled
section are not checked, so an optional section with required fields needs no conditional validators.

**Rejected.**

- `contribution` as the name: it names half of what the values decide.
- String values on `enabled`: `if (field.enabled)` keeps compiling and treats `'disabled'` as truthy.
- Validating an element that sends nothing over `undefined`: a `Required` inside a disabled optional section would
  block the form.
- A container's `ValueChangedAction` carrying `value`: an access switch would be a value change.

---

## D-037 — An error is data, and the library renders nothing

**Since:** 3.0.0-alpha.1 · `0e08414` (#50) · 2026-10-08\
**Tests:** `src/validators/validation-error.spec.ts:6–60`, `src/validators/validator.spec.ts:286–308`,
`src/index.spec.ts`

`ValidationError` carries a snake_case `code`, `params`, an English plain-text `detail` and an `origin`, and nothing to
render. A built-in validator takes `{ code?, detail? }`. The application chooses the text from `code` and `params`
and falls back to `detail`; a validator error and an error built from a server response take the same path. The
library has no component, markdown, stylesheet, translations or configuration object; `@dynamicforms/vuetify-inputs`
holds the rendering primitives. `sameAs` compares errors over their data, params included.

**Reason.** The library is UI-agnostic. The application owns the locale, number and date formats, code translations
and markup. Every package that renders errors already depends on `vuetify-inputs`. snake_case codes are plain
identifiers in JavaScript and Python dictionaries.

**Rejected.**

- Translation inside the library (`@dynamicforms/translatable`): needs markdown and plain variants of every message
  and a way to name each validator's values.
- A `message` option beside `code`: a second text channel that bypasses translation.
- An opaque `message: unknown` passed to the renderer: duplicates `detail` and puts render data on a data object.
- `RenderableValue` as a base class of errors: every grid cell and title would carry an error code.

---

## D-038 — An action is a command: it sends nothing, and a container finds its confirm and reject actions

**Since:** 3.0.0-alpha.1 · `d607431` (#54) · 2026-10-08\
**Tests:** `src/tests/action-commands.spec.ts:28–503`

An `Action` contributes nothing to `value` or `fullValue`, and neither does a container holding only actions.
`SubmitAction` and `RejectAction` are `ExecuteAction` handlers with a required target. `Container.confirm()` and
`reject()` execute the action whose handler targets the container, else a `defaultConfirm` / `defaultReject` action
among the direct members, else the only flagged one below; two candidates at one step execute nothing.
`Action.executable` combines `effectiveEnabled`, `visibility`, `busy` and the handlers' `canExecute()`. A refused
submit and a failed handler resolve `execute()` with `SubmitRefusedException` and `SubmitFailedException`, both
`AbortEventHandlingException` (D-012).

**Reason.** Which action a confirm gesture runs is a property of the form, not of the rendering layer. An action in a
bar has the bar as its `parent`, so a default target of `parent` would submit the bar. With several candidates the
form has not chosen one.

**Rejected.** A `name` member on `Action`: the container key (`fieldName`) names it.

---

## D-039 — `isChanged` measures what is sent; `rebind` restores data, not state

**Since:** 3.0.0-alpha.1 · `80dde19` (#57) · 2026-10-08\
**Tests:** `src/tests/bind.spec.ts:337–479`, `src/tests/defects.spec.ts:85–107`, `src/group.spec.ts:880–899`

A container's `originalValue` is a snapshot of its `value`, and `isChanged` compares `value` with it. `rebind(data)`
keeps the `access`, `visibility` and extended properties of the element it is called on and of declared members;
bindings below it (list rows, members of a bound group) take those of their declaration. A `Group` member whose key
is missing from `data` takes the `originalValue` of the declaration's member, so `group.rebind(group.originalValue)`
restores a `'disabled'` member, which `value` leaves out.

**Rejected.** `originalValue` as a snapshot of `fullValue`: an edit of a field that is not sent would count as a change,
and a change of `access` alone would not. Keeping both snapshots doubles the stored data.

---

## D-040 — An action registered on a binding is registered on its declaration

**Since:** 3.0.0-alpha.1 · `80dde19` (#57) · 2026-10-08\
**Tests:** `src/list.spec.ts:1441–1483`, `src/field-base.spec.ts:131–185`,
`src/actions/conditional/conditional-statement-action.spec.ts:201–325`

`registerAction()` on any binding registers in the map the declaration and all its bindings share, so a rule
registered on one row applies to every row, and `clearValidators()` on one row clears every row. A rule for a single
row reads the row (a conditional action, or a validator that reads `field.parent`).

**Reason.** A rule is part of a form's definition, and the rows of a list are instances of one definition.

---

## D-041 — Methods the library calls between its own classes are keyed by unexported symbols

**Since:** 3.0.0-alpha.1 · `80dde19` (#57) · 2026-10-08\
**Tests:** `src/tests/design-fixes.spec.ts:65–78`

A method one class calls on another where `protected` does not reach is keyed by a symbol the package does not
export: `BeginValidating`, `ValidationEpoch`, `ReorderRows`, `SentNowhere`, `ExecuteHandlers`, and `Outermost` on an
action. `[BeginValidating]()` returns a function that ends that run once; a second call does nothing.

**Reason.** A public end method can be called more often than runs were started, and an extra call resolves
`settled()` while a run is in flight.

---

## D-042 — A derived value is a `computed` beside the state, not a member of an element

**Since:** 3.0.0-alpha.1 · `2029bfe` · 2026-10-09

Values derived from state, and functions that change it, are `computed` and plain functions beside the element; a
factory that builds the state returns them with it. A subscription to every change in a subtree is a
`ValueChangedAction` on the container.

**Rejected.** Derived values on an element (`new Group(fields, { computed: … })`, as Pinia getters): Vue's `computed`
already tracks reads through the element.

---

## D-043 — The cost of an element is documented, not reduced

**Since:** 3.0.0-alpha.1 · `2029bfe` · 2026-10-09

Every value is an element with its state, actions and cached validity, several times the cost of a plain reactive
value (`docs/guide/model.md`, "Memory per element"). State read and replaced as a whole is held in one `Field` or
outside the library.

---

## D-044 — Server state belongs to a query library; the form rebinds to it

**Since:** 3.0.0-alpha.1 · `2029bfe` · 2026-10-09

The library does not fetch, cache, invalidate or refetch. A query library holds the server's copy; the form is built
from the first result with `Group.createFromFormData()` and rebinds to each later one while it holds no edits
(cookbook, "Data from a server cache").

---

## D-045 — No asynchronous derived value

**Since:** 3.0.0-alpha.1 · `2029bfe` · 2026-10-09

A value loaded for another value is a `watch` that writes the result into a field, so it is validated, announced and
part of `isChanged` (cookbook, "A value loaded for another value"). A derived value that is a promise, with components
suspending on it (Jotai and Recoil async atoms), is not provided.

---

## D-046 — A field's value is one unit; tracking writes into it is an opt-in plugin

**Since:** 3.0.0-alpha.1 · `f1323ea` · 2026-10-09\
**Tests:** `src/plugins/tracking.spec.ts`, `src/plugins.spec.ts:62–77`

A change of a field is an assignment to `value`; a write into an object the field holds is not. The tracking plugin
(`@dynamicforms/vue-forms/plugins/tracking`, installed with `installPlugin()`) makes such a write a change. An
application that does not import it does not bundle it.

- `onSetValue` runs where the value is stored, on every path that stores it (construction, assignment, `rebind()`).
  `ValueChangedAction` and `field.value` receive the stored value.
- A write goes into the object, so a row read from the value stays the row in the value after a reorder, and a
  rollback restores the writes into the same objects.
- The field copies a value on assignment, and every `originalValue` is an untracked deep copy, so a write into the
  value does not move the baseline.

**Rejected.**

- A strict mode (`Object.freeze` or a warning): it does not stop writes into a `Map`, `Set`, `Date` or private field.
- Copy on write: a row read from the value would no longer be in the value after the first write.
- A deep `watch`: it sees a write after it happened, and misses writes through a non-proxy reference.

---

## D-047 — The devtools are a plugin the library installs in development

**Since:** 3.0.0-alpha.1 · `e29aea6` (#63) · 2026-10-09\
**Tests:** `src/tests/devtools.spec.ts:73–114`, `src/tests/devtools.spec.ts:167–224`, `src/plugins.spec.ts:3–21`,
`src/plugins.spec.ts:79–94`

The devtools use the plugin hooks `onElementCreated`, `onElementAdopted` and `onCommit`, and the library installs the
plugin on the first element built in development; the core calls no devtools code. `bind()` constructs inside
`asBinding()`, so a binding is never listed and no stack or component is captured for it. An element built directly
is captured, and the capture is dropped when a container adopts it.

**Reason.** Modules that build global state are evaluated before the entry module's code, so a plugin the application
installs would miss that state. A list of 1000 rows of 8 fields is 9000 bindings and one root.

**Rejected.** A devtools plugin the application installs.

---

## D-048 — An element has one parent; a record shown in several places is several elements

**Since:** 3.0.0-alpha.1 · `483dbfa` · 2026-10-10\
**Tests:** `src/group.spec.ts:901–1128`, `src/list.spec.ts:988–1109`

A container that takes an element with a parent throws a `TypeError`. `parent`, `fieldName`, inherited access and
visibility, a container's invalid count, serialization and the commit order (deepest first) are defined over the one
path from the root. A record shown in several places is an element in each, and their values are kept equal by
writing one into the other in the same transaction; a handler that writes during the commit joins it, so the linked
writes commit and roll back together.

**Rejected.**

- Several parents (MobX-State-Tree references, an Apollo cache entry): inherited access, visibility, depth and name
  have no single value, and dependent packages read `parent` as one container.
- The number of parents chosen by a plugin: plugins are per module instance, so it would change `parent` for every
  package sharing it.

---

## D-049 — A plugin observes committed transactions, not events

**Since:** 3.0.0-alpha.1 · `483dbfa` · 2026-10-10\
**Tests:** `src/plugins.spec.ts:23–41`, `src/group.spec.ts:813–899`, `src/list.spec.ts:1245–1264`

An observing plugin (devtools timeline, history, patches, persistence, sync) is called once per committed
transaction, after the commit has announced everything and the handlers that wrote during it have run. A rolled-back
transaction calls nothing. The value hooks are a pipeline on the write, not observers; a rollback restores the stored
value without calling them. The observer receives each modified element with its state before and after, and the rows
added and removed. A container's composed value is frozen and keeps its identity while nothing below it changes.

**Reason.** A handler that throws during the commit rolls back a transaction that is already partly announced; an
observer of committed transactions never sees that partial change.

**Rejected.**

- A hook per event: the observer would receive events of a commit that a later handler rolls back.
- Copy-on-write state with the announcement after the swap: a handler's write would start a new transaction instead
  of joining the one it reacts to.

---

## D-050 — The rules over an error's origin are an action, with a default per origin

**Since:** 3.0.0-alpha.1 · `1e1e7ac` · 2026-10-12\
**Tests:** `src/tests/error-origin.spec.ts:29–526`

Every origin other than `'validator'` has a rule of two independent parts: `validEffect`, whether its errors count
toward `valid`, and `removeOn`, when the element removes them (`'change'`, `'edit'`, `'submit'`, `'never'`). An
`ErrorPolicy` registered on an element sets the rules for the origins it names, for that element and everything below
it; the nearest policy naming an origin applies, and `setDefaultErrorPolicies()` sets the rule where none does. The
default for `'server'` is `{ validEffect: true, removeOn: 'edit' }`, for every other origin
`{ validEffect: true, removeOn: 'never' }`.

**Reason.** Forms need different rules: a server error removed on every change disappears while the user types, a
login refusal stays until the next attempt without blocking it, and a form-level conflict blocks the submit until the
user changes something. `'edit'` uses the `touched = true` the rendering layer writes when the user leaves an input,
and compares against the value the error was written for, so an error stays when the field is changed and changed
back.

**Rejected.**

- A plugin: plugins apply to every element in the module instance; a rule applies per form or subtree. An action is
  shared by bindings, undone by a rollback and found by walking `parent`.
- A configuration object for the default: the configuration was removed (D-037); a function returning its undo
  matches `installPlugin()`.
- A list of removal events per origin: `'never'` with anything else is meaningless, and every other combination is the
  earliest event.
- `validEffect: true` with `removeOn: 'submit'`: `valid` would be `false` on a form that can be submitted. The
  combination throws a `TypeError`.
- A rule for `'validator'`: a validator replaces its own errors on every run; a validator whose errors should not
  count uses an origin of its own.
