# todo

What stands between the current source and a frozen 1.0 surface, re-verified against 0.12.0, plus the
pre-existing items.

The same findings laid out for reading, with the measurement output and the reasoning behind each severity:
<https://claude.ai/code/artifact/4527a232-fd57-431f-8aac-aacb244d42a7> (private link — visible to the repo
owner only, so treat this file as the authoritative copy).

---

## Recommended before 1.0

- **`bind()` semantics.** `Group.bind()`/`List.bind()` hardcode `new Group`/`new List` instead of
  `this.constructor`, so a subclass of either binds into the base class. The override object also takes the full
  `IBindParams` while forwarding only `originalValue`, `enabled`, `visibility` and the extended properties, so
  `f.bind(v, {errors: […]})` and `f.bind(v, {touched: true})` compile and are silently ignored.
- **Find out what the shipped bundle is made of.** `dist/dynamicforms-vue-forms.js` is 92.7 kB (25.8 kB gzipped)
  and `dist/index.d.ts` is 74.0 kB, for a packed tarball of 112.4 kB. Nothing has ever accounted for those
  numbers: the source is about 4 500 lines with `lodash-es` as its only runtime dependency, and tree-shaking a
  handful of named lodash imports should not cost what this costs. Establish where the weight is — a lodash
  import pulling a chunk it does not need, the markdown pipeline behind `MdString`, `MessagesWidget` dragging
  component machinery in, or simply the honest size of the library — before the surface is frozen, because the
  answer may be an import that has to move.

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
  tracked. **None is in the published package's dependency tree**: it declares `lodash-es` as its
  only dependency and `vue` as its only peer, and ships `dist/*`. The flagged packages are the build chain
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

## Pre-existing items

- More coverage in unit tests (see the test-gap list above for where it actually matters).
