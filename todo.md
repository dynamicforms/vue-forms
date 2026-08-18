# todo

What stands between the current source and a frozen 1.0 surface, re-verified against 0.11.0, plus the
pre-existing items.

The same findings laid out for reading, with the measurement output and the reasoning behind each severity:
<https://claude.ai/code/artifact/4527a232-fd57-431f-8aac-aacb244d42a7> (private link — visible to the repo
owner only, so treat this file as the authoritative copy).

Legend: **[V]** reproduced with an executed test in this repo · **[R]** derived from reading the code only,
still needs an empirical check before we act on it.

---

## Blockers for 1.0

These must be settled before the public surface is frozen. Most are bugs you patch; the rest are decisions
about the shape of signatures and of the published package — after 1.0 those cost a 2.0.

### Packaging

- **[V] `peerDependencies: vue ^3.4` is an unverified claim, and one exported line is what breaks it.**
  Runtime is unaffected — the library works on Vue 3.4. What fails is a consumer's *compile*, with
  `skipLibCheck: false`: `TS2707: Generic type 'DefineComponent' requires between 0 and 13 type arguments`.
  The whole of it comes from a single export, `MessagesWidget`, whose emitted declaration is
  `DefineComponent<Props, {}, {}, ...>` with 21 type arguments — a shape Vue 3.5's typings accept and 3.4's do
  not. It is also the only thing that pulls `ComponentOptionsMixin`, `PublicProps` and `ComponentProvideOptions`
  into the public declarations; everything else the library imports from Vue (`Ref`) is stable across both.
  Three ways out, and the cheapest is not the obvious one:
  - **Hand-write the type for `MessagesWidget`.** The generated declaration disappears, the public
    declarations stop referencing Vue's component typings altogether, and `^3.4` becomes true instead of
    aspirational. Costs some precision in a consumer's prop inference for that one component.
  - **Raise the peer range to `^3.5`.** One line, honest, and breaking once 1.0 has promised `^3.4`.
  - **Leave it and document that `skipLibCheck: false` needs Vue >= 3.5.** Cheapest today, and it makes the
    published range a claim the package does not honour.
  Whichever is chosen, **CI has to test it**: the matrix covers Node (`lts/*`, `latest`) and nothing else, so
  it installs the newest Vue every time and can never see this. A job that installs the lowest supported Vue
  with `skipLibCheck: false` is what turns the peer range from a claim into something checked — and it is
  worth having regardless of which option wins, because the next such divergence will be silent too.
  The decision belongs before 1.0 only because narrowing a published range afterwards is breaking.

- **[V] Drop the CJS/UMD entry point and raise `engines.node` to `>=22`.** Decided; not yet done.
  The `require` half of `exports` costs 327 kB of the package's 731 kB — `umd.cjs` with its map, plus
  `index.d.cts`, which is a byte-for-byte copy `copyFileSync` makes in the build script. It is also the only
  reason `lodash` sits in `dependencies`: the CJS artifact cannot `require()` the ESM-only `lodash-es`, so
  `vite.config.ts` substitutes it through the UMD output's `paths`, and every ESM consumer installs 1.4 MB it
  never loads. Worst of all it creates the hazard the API cannot survive: 24 `instanceof` sites and 20
  module-level `Symbol()` without `Symbol.for`, so a graph that ends up with both copies — an ESM app whose
  test runner or SSR path requires the CJS build — answers `Invalid fields object provided` for a `Field` that
  is perfectly valid, and the message leads nowhere.
  `require(esm)` is stable from Node 20.19 / 22.12, so a CJS consumer on a supported Node keeps working
  through it; `engines` currently claims `>=18`, where that is untrue, which is why the two changes belong
  together. Node 18 has been end-of-life since April 2025.
  To do: drop the `require` condition and the UMD output, delete the `copyFileSync` step and `index.d.cts`,
  move `lodash` out of `dependencies`, set `engines.node` to `>=22`, and drop the `paths`/`globals` mapping
  from `vite.config.ts`. Both are breaking, so both must land before the surface freezes — removing an export
  condition or narrowing `engines` afterwards costs a 2.0.

---

## Recommended before 1.0

- **`bind()` semantics.** `Group.bind()`/`List.bind()` hardcode `new Group`/`new List` instead of
  `this.constructor`, so a subclass of either binds into the base class. The override object also takes the full
  `IBindParams` while forwarding only `originalValue`, `enabled`, `visibility` and the extended properties, so
  `f.bind(v, {errors: […]})` and `f.bind(v, {touched: true})` compile and are silently ignored.
- **There is no way to unregister an action, and the chain that prevents it costs more than that.**
  `ActionsMap.register()` wraps each handler in a closure that calls the previous one, so the successor holds its
  predecessor and a link cannot be dropped; `registeredActions` is only a record for copying, not the executor.
  Four consequences are already visible in the code: `clearValidators()` has to replace the whole map, which is
  why `clearValidators` needs a `whenRolledBack` hook to survive a rollback; `triggerChain()` had to be split out
  of `trigger()` so a transaction can run handlers without a second eager pass; `willTrigger()` carries a special
  case for the value-change identifier because `trigger()` also runs the eager pass; and `eager` is tracked per
  *identifier* (`eagerActions: Set<symbol>`) rather than per action, so one eager action makes every action under
  that identifier eager. Registering several thousand handlers on one field nests deeply enough to hit a
  `RangeError` when it fires.

  Fix: one structure, `Map<symbol, FieldActionBase[]>`, walked by index rather than composed into closures —
  `step(list, i)` hands each handler a `supr` that continues at `i - 1`, from the end backwards so the LIFO order
  `actions-map.spec.ts` pins is preserved, and an action can still refuse to call `supr` or transform its result.
  One closure per level reached, at call time, instead of one per registration held forever; no composed chain
  means no cache to invalidate. `unregister()` replaces the array rather than splicing it, so a walk already in
  flight finishes on the array it started with and an unregistration takes effect from the next trigger.
  `eager` becomes a property of the action, and `trigger()` stops running the eager pass on the quiet, which
  removes `triggerChain()` and the special case in `willTrigger()`.

  It closes `unregisterAction` on `FieldBase`, lets `clearValidators()` drop its validators instead of rebuilding
  the map, removes the `whenRolledBack` hook, retires the `RangeError` as a class of failure, and makes an action
  registered inside a transaction reversible (`GAPS.md` D-006). Net code is about flat and one concept goes away.
  Measure `S2a` before and after: the closures move from registration time to trigger time, and a field write
  triggers on every keystroke.
- **A field handed to `CompareTo` or to a `Statement` from an *enclosing* item template is read where it stands.**
  Resolution answers within one record and reads an element belonging to any other as the element itself
  (`src/binding/resolve.ts`), so the rows of a nested list compare against the enclosing template's field rather
  than against the field of the enclosing row they sit in. The name form walks the containers of the field being
  validated and does reach the enclosing row, so the two forms disagree on the same rule. What a rule written
  against a field means is part of the surface being frozen.
- **Async action handlers are neither awaited nor caught** — an `async` `ValueChangedAction` that throws
  ends as an unhandled rejection. Decide and document the contract, because changing it later (setters
  becoming async) is a 2.0.
- **`Group.value` omits a disabled `List` but keeps a disabled `Group`** (`src/group.ts`; `List` does not
  extend `Group`) — payload shape.
- **A non-array assigned to `List.value` is swallowed silently** (`src/list.ts`) — `setValueInternal` writes for an
  array and clears for `null`, so any other type leaves the rows untouched with no error.
- **`List` alone does not fall back to `originalValue`** (`src/list.ts`): `new Field({originalValue: 5})` and
  `new Group({a}, {originalValue: {a: 7}})` start unchanged, while `new List(tpl, {originalValue: […]})` reports
  `isChanged` and reads back `null`, so a list built from a server baseline is dirty before anyone touches it.
- **`DisplayMode`:** an invalid *string* silently becomes `FULL`, an invalid *number* throws
  (`src/display-mode.ts:30-39`).
- **`EmptyField` is a shared mutable singleton** (`src/field.ts`) — `visibility`/`enabled` can be
  overwritten with no warning.
- **Validators are exported twice:** `Validator` is top-level *and* in `Validators`, while the concrete
  validators live only in the namespace (`src/validators/index.ts:3-4`). Pick one shape before both are
  promised.
- **`T` does not propagate all the way**: `List.value`'s setter is `Record<string, any>[]` while its getter is
  `ListValue`, so `list.value = null` is a `TS2322` while `group.value = null` is fine; `Group.value`'s getter
  still claims every key even though a disabled field is omitted at runtime; and the built-in validators carry
  an unused public `T` and never check the field's type.
- **`FieldBase.parent` is declared `Group | undefined`** (`src/field-base.ts`); a `List` installs itself as the
  parent of its row groups (`src/list.ts`), so the honest type is `Group | List`. Widening it breaks the
  documented sibling lookup `field.parent?.fields.other.value`, which is why it has to be decided before 1.0.
- **`isEqual` over two elements answers `true` for any two of the same class**, because an element's state is
  unreachable to a structural walker (`GAPS.md` D-001). `isEqual(a.value, b.value)` is the meaningful
  comparison and is documented as such, but the trap is silent and a machine-readable identity — or a
  documented refusal to support element comparison — is worth settling before the surface freezes.
- **`Required` accepts `'   '` as filled in** and has no `trim` option — after 1.0 the default is frozen for
  the whole 1.x line.
- **Configuration is module-global** (`src/config.ts:7`) and `install(app: any)` ignores `app`; under SSR one
  request changes the setting for everyone. `FormsConfig`/`getConfig`/`setConfig` are not exported.
- **Test gaps on exactly the surface being frozen:** `AbortEventHandlingException`, and the rule that a disabled
  child `Group` still serializes when its own value is non-empty. CI checks that the rolled-up declarations are
  non-empty and declare `Field`, but nothing imports the built artifact or asserts the export list.
- **24 open Dependabot alerts** — 18 high, 5 moderate, 1 low — visible since `package-lock.json` became
  tracked. **None is in the published package's dependency tree**: it declares `lodash` and `lodash-es` as its
  only dependencies and `vue` as its only peer, and ships `dist/*`. The flagged packages are the build chain
  (`brace-expansion`, `fast-uri`, `js-yaml`, `immutable`, `ws`, `esbuild`, `vite`) and the documentation site's
  own runtime (`linkify-it`, `nanoid`, `markdown-it`, `postcss`); the latter are reported under `runtime` scope
  because they are runtime dependencies *of `docs/`*, which shares the lockfile, and nothing under `src/`
  imports any of them. Build and docs-site exposure, not a consumer one, so it does not gate 1.0.
  Needs: `npm audit` with the tree bumped where a fix exists, an `npm outdated` pass now that the lockfile
  pins what CI installs, and a decision on whether to enable Dependabot pull requests — with the lockfile
  tracked they arrive as reviewable diffs instead of silent drift.

---

## Can wait (non-breaking to add later)

`AbortEventHandlingException` does not veto `*Changing*` events (documented as it behaves) ·
`enabled`/`visibility` fire events even without an actual change ·
`Statement` silently accepts non-fields, so a typo in a field name is a dead condition ·
an action registered on an item template after a row was built never reaches that row, because a binding carries
the actions its declaration held at the moment it was bound ·
`Operator.NOT` requires a dummy third argument ·
`Group.addField`/`List.length`/`items` are missing (additive) ·
`Group`/`List` do not aggregate `validating` or `busy`, so a form cannot ask whether anything below it is
running · a rejection out of `Action.execute()` has nowhere to go but the caller: a call that neither awaits the
answer nor attaches a `.catch()` leaves it unhandled, and the library offers no configured error handler to
route it to · a superseded asynchronous result is dropped, but the request
behind it keeps running: `ValidationFunction` receives no `AbortSignal`, so nothing cancels the call at the
network level and fast typing leaves a request in flight per keystroke — the fourth argument is additive, and it
is also what a rolled-back transaction would need to stop a validation it started, which today runs to the end
with its verdict discarded ·
a rollback does not un-register the actions registered while the transaction was open: `ActionsMap` nests each
handler in a closure that calls the previous one, so a single registration cannot be taken back · between
`clearValidators()` and the end of the operation it ran in, a dropped `CompareTo` can still fire and push an
error onto the field it was dropped from, because its listener is released at commit ·
`InAllowedValues` freezes the list at
construction · `ValidationError` has no machine-readable code · error object identity is not preserved
across validations: two runs producing the same message leave the field holding the newer instance, because the
`isEqual` that would have kept the older one compares two `ValidationErrorRenderContent`s including the `computed`
each carries. `Validator.claim()` copies an error another validator already owns, and `field.errors` reads back a
Vue proxy of whatever instance the field holds, so `field.errors[0] === myError` is `false` either way
(documented) · `isSimpleComponentDef(null)` throws ·
`List.insert(item, index)` fills the gap position by position, so an index taken from an API response builds
that many groups and fires that many events synchronously on the main thread ·
`./style.css` is unreachable under node10 resolution · no coverage thresholds.

---

## Open design decisions

One question with no settled answer yet. It is worth deciding before the surface is frozen, because
the cheap option is also the one that keeps the other option available.

### How the action chain supports removal

`ActionsMap` nests each handler in a closure that calls the previous one, so a handler cannot be removed
and two chains cannot be composed.

**A `deactivated` flag on each link**, passing straight through to `supr`. *For:* a few lines, no change in
call-time shape. *Against:* the chain never shrinks, so the stack depth that produces the `RangeError` above
keeps growing.

**An array of handlers, composed into a chain that is rebuilt on registration.** *For:* removal is real, so
dead links leave no depth behind; call-time shape and cost are unchanged. *Against:* more code, and the
composition must preserve the onion semantics — an action decides whether to call `supr` and may transform
its result, which a plain listener loop would lose.

## Pre-existing items

- More coverage in unit tests (see the test-gap list above for where it actually matters).
