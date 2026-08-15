# todo

Findings from the 1.0 readiness audit (August 2026, against 0.5.1), plus the pre-existing items.

The same findings laid out for reading, with the measurement output and the reasoning behind each severity:
<https://claude.ai/code/artifact/4527a232-fd57-431f-8aac-aacb244d42a7> (private link — visible to the repo
owner only, so treat this file as the authoritative copy).

Legend: **[V]** reproduced with an executed test in this repo · **[R]** derived from reading the code only,
still needs an empirical check before we act on it.

---

## Blockers for 1.0

These must be settled before the public surface is frozen. Most are bugs you patch; the rest are decisions
about the shape of signatures and of the published package — after 1.0 those cost a 2.0.

### A. Cloning and the action system

- **[R] `ActionsMap.clone()` never calls `boundToField()`.** `registerAction` does two things (`register` +
  `boundToField`), the clone only the first (`src/actions/actions-map.ts`).
  Since `src/list.ts` builds every row with `_itemTemplate.clone()`, conditional actions are permanently
  dead in every list row — a silent failure with no error.
  Fix: have `clone()` take the new owner and call `boundToField(newField)` per action, or add a
  `cloneFor(field)` hook on `FieldActionBase`.

- **[R] `ConditionalStatementAction` shares one `lastResult` across all bound fields.**
  `src/actions/conditional/conditional-statement-action.ts`. The same instance bound to `a`
  and then `b` leaves them disagreeing. The same pattern also breaks a single binding when the source field
  changes between constructing the action and `registerAction`: the constructor already registers a
  `ValueChangedAction` on the source fields and moves `lastResult` while `boundFields` is still empty.
  Contradicts `docs/api/actions.md`.
  Fix: `Map<FieldBase, boolean | undefined>` instead of a single `lastResult`.

### B. Constructors and public types

- **[V] `new Group(fields, params)` without `params.value` wipes every child.** `src/group.ts`.
  `new Group({a: new Field({value: 1})}, {visibility: HIDDEN})` yields `value === {a: null}`, and
  `originalValue` is rebaselined onto the wiped state so `isChanged` reports clean. `docs/api/group.md`
  carries a `::: warning` about it, so it is known behaviour that 1.0 would freeze.
  Fix: `if ('value' in params)`, the same guard `clone()` already uses for `originalValue`.

### C. Validation

- **[R] Validity does not propagate upwards.** `Group.validate()` is only reached through
  `notifyValueChanged`, i.e. only on a value change (`src/field-base.ts`, `src/group.ts`).
  When a child turns invalid by another route (async validator, externally pushed error), `g.valid` becomes
  `false` but `ValidChangedAction` on the group fires zero times — which is exactly the documented
  "enable the Submit button" pattern (`docs/api/actions.md`).
  Fix: `parent?.notifyValidChanged()` in the `_valid !== oldValid` branch.

- **[V] Async validators have no sequencing and no cancellation.** `src/validators/validator.ts` does
  `errors.then(processErrors)` with no token and no `catch`. With a validator taking 150 ms for `'bad'` and
  5 ms for `'good'`, setting `'bad'` then `'good'` ends at `value 'good'`, `valid false`,
  `errors ['bad:bad']`, `validating false` — the field claims validation finished while holding the previous
  value's verdict. The canonical remote-uniqueness example is therefore unreliable.
  Fix: a monotonic token per run, discard everything but the latest. The `ValidationFunction` signature is
  safe to freeze — an `AbortSignal` 4th argument would be additive.

- **[V] `CompareTo` binds to a field instance, so it points at the wrong field after any clone.**
  `src/validators/validator-compare-to.ts`. Reproduced inverted: `pwd='a'`, `other='b'` gives
  `pwd.valid === true`; `cloned='b'`, `other='b'` gives `cloned.valid === false`. Inside a `List` it is
  worse — `otherField` points at the *template's* field, so a row with `a === 'x', b === 'x'` is marked
  invalid. Password/confirm and date-from/date-to are the advertised use cases.
  Fix: resolve the other field by name or callback at validation time. That changes the `CompareTo`
  constructor, so after 1.0 it means 2.0.

### D. Packaging

- **[V] The CJS/UMD artifact `require()`s `lodash-es`, which is ESM-only.** `vite.config.ts:53-56` externalizes
  it in both formats. `node --no-experimental-require-module -e "require('./dist/…umd.cjs')"` gives
  `ERR_REQUIRE_ESM`. Hits Jest with the default CJS transform and every Node < 20.19 / < 22.12;
  `engines.node` is not declared.
  The dual-package decision has to be made before the freeze because the API is identity-based —
  `instanceof` in 17 places and 13 module-level `Symbol()` without `Symbol.for`. Two copies in one graph
  produce `Invalid fields object provided` / `Invalid action type`.
  Fix: do not externalize `lodash-es` in the CJS build (or drop the `require` condition and go ESM-only),
  plus declare `engines`.

- **[V] `peerDependencies: vue ^3.4` but the types need >= 3.5.** With `vue@3.4.38` and
  `skipLibCheck: false`: `TS2707: Generic type 'DefineComponent' requires between 0 and 13 type arguments`
  (`package.json:62`, `dist/index.d.ts:391`). The changelog explicitly promised `skipLibCheck: false`
  support. CI cannot see it — `tsconfig.json:10` sets `skipLibCheck: true` and CI always installs the newest
  Vue. Narrowing `^3.4` to `^3.5` after 1.0 is breaking.
  Fix: raise the peer range (or hide `DefineComponent` behind a hand-written type), and add a CI job against
  the lowest supported Vue.

- **[R] `List.insert()` emits wrong indexes in `ListItemAddedAction`.** `src/list.ts` uses
  `this._value.push(itm)`, which returns the new *length*, not the index. `insert({a: 9}, 3)` on an empty
  list emits `[1, 2, 3, 3]` for four elements — index 0 never announced, 3 announced twice. The only test
  asserts `expect.any(Number)` (`src/list.spec.ts`), which cannot fail. The payload of a public,
  documented event is frozen by 1.0.
  Fix: one line (`- 1`) plus a real test.

---

## Recommended before 1.0

- **`clone()` semantics.** `Group.clone()`/`List.clone()` hardcode `new Group`/`new List` instead of
  `this.constructor`, so a subclass of either clones into the base class, and `clone()` drops every extra
  property (`label`, `placeholder`, …). It also takes the full `IFieldConstructorParams` while forwarding
  only `value`, `originalValue`, `enabled` and `visibility`, so `f.clone({errors: […]})` and
  `f.clone({touched: true})` compile and are silently ignored. This has to be decided now, because the
  `Extendable` work below depends on it.
- **`clone()` rebaselines `originalValue`** (`src/field.ts`, `src/group.ts`) — `List.remove()` returns
  a clone with its dirty state erased.
- **`clearValidators()` on a clone kills validation on the original** (`src/actions/actions-map.ts`
  plus `validator-compare-to.ts`): shared action instances, and `unregister()` mutates the shared
  object. The form reports `valid` when it is not.
- **`clearValidators()` does not cancel in-flight async validation** — the field is left permanently invalid
  with an error nobody can clear (`src/field-base.ts`).
- **Validators run 2..N+1 times during construction, the first calls with `undefined`** — `Field.init()`
  registers them before the `_value` assignment (`src/field.ts`).
- **A shared `ValidationError` object throws** `TypeError: Cannot redefine property: source`
  (`src/validators/validator.ts`, `configurable: false`).
- **A `Ref` as a validator message silently loses reactivity** (`src/validators/validator.ts`
  `unref`s at validation time) — i18n through `computed`/`t()` freezes in the language of the first
  validation, even though the docs list `Ref` as a supported form.
- **`Statement.evaluate()` returns operands instead of a boolean** for AND/OR
  (`src/actions/conditional/statement.ts`) → conditional actions fire on non-transitions (`0` vs
  `false`), and the callback receives a number where the docs promise `boolean`.
- **There is no way to unregister an action** (`src/actions/field-action-base.ts` has an empty stub,
  `ActionsMap` builds a closure chain). List rows leak handlers onto the shared source field permanently;
  around 4565 handlers it hits a `RangeError`. `unregisterAction` can be added to `FieldBase` without
  breaking anyone, but it needs the closure chain replaced by something that can drop a single handler.
- **Async action handlers are neither awaited nor caught** — an `async` `ValueChangedAction` that throws
  ends as an unhandled rejection. Decide and document the contract, because changing it later (setters
  becoming async) is a 2.0.
- **`Group.value` omits a disabled `List` but keeps a disabled `Group`** (`src/group.ts`; `List` does not
  extend `Group`) — payload shape.
- **`Group.value = null` does not clear a nested `List`**, and a non-array value is swallowed silently
  (`src/list.ts`).
- **`Group`'s `_value` cache is not primed** — the first `ValueChangedAction` on a group always reports
  `old = null` (`src/group.ts`); likewise the `List.value` setter leaves `_previousValue` stale
  (`src/list.ts`).
- **`DisplayMode`:** an invalid *string* silently becomes `FULL`, an invalid *number* throws
  (`src/display-mode.ts:29-32`).
- **`Action.label`/`icon` write into the value object behind the setter's back**: no `ValueChangedAction`
  fires, `isChanged` is structurally always `false`, and `new Action({}).label = 'X'` throws on the
  frozen object (`src/action.ts`).
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
- **`Required` accepts `'   '` as filled in** and has no `trim` option — after 1.0 the default is frozen for
  the whole 1.x line.
- **Configuration is module-global** (`src/config.ts:7`) and `install(app: any)` ignores `app`; under SSR one
  request changes the setting for everyone. `FormsConfig`/`getConfig`/`setConfig` are not exported.
- **`lodash-es` is a peerDependency** even though it does not leak into the public surface — move it to
  `dependencies` or inline it. (Not an install burden — npm 7+ installs peers automatically — but it is the
  wrong declaration and it interacts with the CJS blocker above.)
- **No `prepack`/`prepublishOnly`, and `dist/` and `package-lock.json` are gitignored** — publishing from a
  fresh clone ships an empty package, and CI cannot use `npm ci`.
- **Test gaps on exactly the surface being frozen:** `touched` (zero tests, despite the documented
  aggregation and its role in getting-started), `Group.field()`/`createFromFormData()`/`clone()`, the
  disabled-subgroup serialization rule, `AbortEventHandlingException`,
  `EnabledChangedAction`/`VisibilityChangedAction`, `clearValidators()` with non-validator actions, and
  function-valued validator messages (the i18n path). Nothing tests the built artifact or the export list.
- **Documentation:** there is no versioning/stability statement and no supported Vue/Node/browser matrix,
  the sidebar has no changelog entry, and the docs home links to a GitHub repo that does not exist.
- **Stale GitHub URLs in `package.json`.** `repository` and `bugs` (`package.json:56-61`) point at
  `velis74/dynamicforms-vue-forms`, while the actual remote is `dynamicforms/vue-forms`. Cosmetic, not
  broken — the old path answers 301 and redirects to the new one — but npm shows these on the package page,
  so fold it into the documentation pass above rather than giving it its own commit.

---

## Can wait (non-breaking to add later)

`AbortEventHandlingException` does not veto `*Changing*` events (documented as it behaves) ·
`enabled`/`visibility` fire events even without an actual change · an exception from a handler leaves parents
with a stale cache · `Statement` silently accepts non-fields, so a typo in a field name is a dead condition ·
`Operator.NOT` requires a dummy third argument · `parent` is `configurable: false` (documented) ·
`Group.addField`/`List.length`/`items` are missing (additive) ·
`Group`/`List` do not aggregate `validating` · `InAllowedValues` freezes the list at
construction · `ValidationError` has no machine-readable code · error object identity is not preserved
across validations · `isSimpleComponentDef(null)` throws · the UMD global is literally named `[name]` ·
`./style.css` is unreachable under node10 resolution · CI never packs and imports the artifact · no coverage
thresholds.

---

## Pre-existing items

- Make fields extendable so that the programmer may add any number of additional properties
  to the Field / Group. The `@dynamicforms/vuetify-inputs` module should then have a mechanism to bind such
  properties to the inputs themselves.

  Note: adding a `TExtend` generic parameter to `FieldBase`/`Field`/`Group` after 1.0 changes published
  signatures, so this belongs before the freeze — and it depends on the `clone()` semantics decision above.

  ```typescript
  // In field.interface.ts
  export interface Extendable {
    setExtendedValues(values: Partial<typeof this>): void;
  }

  // In Field, which would become Field<T = any, TExtend extends Extendable = Extendable>
  protected init(params?: Partial<IFieldConstructorParams<T> & TExtend>) {
    if (params) {
      const { value: paramValue, ...otherParams } = params;

      // Nastavi osnovne lastnosti
      Object.assign(this, otherParams);

      // Nastavi razširjene lastnosti
      this.setExtendedValues(otherParams as Partial<TExtend>);

      this._value = paramValue ?? this.originalValue;
      if (this.originalValue === undefined) this.originalValue = this._value;
    }
  }

  clone(overrides?: Partial<IFieldConstructorParams<T> & TExtend>): Field<T, TExtend> {
    const cloned = new Field<T, TExtend>({
      value: overrides?.value ?? this.value,
      ...(overrides && 'originalValue' in overrides ? { originalValue: overrides.originalValue } : { }),
      errors: [...(overrides?.errors ?? this.errors)],
      enabled: overrides?.enabled ?? this.enabled,
      visibility: overrides?.visibility ?? this.visibility,
    });

    // Nastavi razširjene lastnosti na klonirani instanci
    cloned.setExtendedValues(this as unknown as Partial<TExtend>);

    // Prepiše z morebitnimi novimi vrednostmi
    if (overrides) {
      cloned.setExtendedValues(overrides as unknown as Partial<TExtend>);
    }

    return cloned;
  }

  // In FieldBase:
  setExtendedValues(_values: Partial<any>): void {
    // Osnovna implementacija je prazna
    // Podrazredi, ki uporabljajo TExtend, bodo to prepisali
  }
  ```

  Most likely `FieldBase` would have to implement a constructor and the clone method, catering for the
  common scenarios.

- More coverage in unit tests (see the test-gap list above for where it actually matters).
