# todo

Findings from the 1.0 readiness audit (August 2026, against 0.5.1), plus the pre-existing items.

The same findings laid out for reading, with the measurement output and the reasoning behind each severity:
<https://claude.ai/code/artifact/4527a232-fd57-431f-8aac-aacb244d42a7> (private link — visible to the repo
owner only, so treat this file as the authoritative copy).

Legend: **[V]** reproduced with an executed test in this repo · **[R]** derived from reading the code only,
still needs an empirical check before we act on it.

---

## Blockers for 1.0

These must be settled before the public surface is frozen. Roughly half are not "bugs you patch" but
decisions about the shape of types and signatures — after 1.0 they cost a 2.0.

### A. Vue integration

- **[V] `Group` and `List` own state is not reactive.** `Field.create()` wraps the instance in `reactive()`
  (`src/field.ts:47`); `Group` and `List` have no `create()` and are never wrapped, so `_visibility`,
  `_enabled`, `errors` and `List._value` are plain properties on a plain object.

  What works: `group.value`, `.valid`, `.touched` are getters that read the children, and the children *are*
  reactive, so the dependency registers on the child. Value and validity propagation is fine.

  What is dead: `group.errors` (exactly where **group-level validators** write, `validator.ts:57`), so
  group-level validation is invisible in the UI; `group.visibility`/`enabled`, so
  `ConditionalVisibilityAction` on a group never repaints; and `List._value`, so `push`/`insert`/`remove`/
  `clear` never reach a `v-for`.

  Fix: `static create()` with a `reactive()` wrapper for `Group`/`List`. The constructor can
  `return reactive(this)` so existing `new Group(...)` calls keep working.

  Note: no test in `group.spec.ts` or `list.spec.ts` uses `watchEffect`, `watch`, `isReactive` or `mount()` —
  they exercise the manual action/event system, which is independent of Vue reactivity and works correctly.
  Two parallel propagation mechanisms, tests cover one.

- **[V] `reactiveValue` is a stale scalar on `Field` and `Action`.** `src/field-base.ts:21` creates
  `computed(() => this.value)` as a class field, i.e. over the raw `this`, before the `reactive()` wrapper.
  Result: `isRef(f.reactiveValue) === false` and the value freezes at the first read. On `Group` the same
  member is a genuine `ComputedRef`, so the classes disagree with each other.
  `ComputedRef<T>` is already published on `IField` (`src/field.interface.ts:8`) and recommended in
  `docs/api/field.md:35` — changing the type or semantics after 1.0 needs a 2.0.
  Fix: create the computed after the `reactive()` wrap (or expose it through a getter) and unify all three
  classes.

### B. Cloning and the action system

- **[R] `ActionsMap.clone()` never calls `boundToField()`.** `registerAction` does two things (`register` +
  `boundToField`, `src/field-base.ts:89-98`), the clone only the first (`src/actions/actions-map.ts:53-57`).
  Since `src/list.ts:40` builds every row with `_itemTemplate.clone()`, conditional actions are permanently
  dead in every list row — a silent failure with no error.
  Fix: have `clone()` take the new owner and call `boundToField(newField)` per action, or add a
  `cloneFor(field)` hook on `IFieldAction`.

- **[R] `ConditionalStatementAction` shares one `lastResult` across all bound fields.**
  `src/actions/conditional/conditional-statement-action.ts:12,20-28,46-48`. The same instance bound to `a`
  and then `b` leaves them disagreeing. The same pattern also breaks a single binding when the source field
  changes between constructing the action and `registerAction`: the constructor already registers a
  `ValueChangedAction` on the source fields and moves `lastResult` while `boundFields` is still empty.
  Contradicts `docs/api/actions.md:201`.
  Fix: `Map<IField, boolean | undefined>` instead of a single `lastResult`.

- **[V] `List.clone()` throws on an empty list.** `src/list.ts:79` spreads `this.value`, which is `null` for
  an empty list (`src/list.ts:56`). Both `new List(tpl).clone()` and `new Group({x: new List(tpl)}).clone()`
  throw a `TypeError`. An empty nested list is the normal state of a fresh form, and `docs/api/list.md`
  documents this as expected behaviour including "no workaround" for `Group.clone()`.
  Fix: `?? this.value ?? []`, one line, plus a test for each case.

### C. Constructors and public types

- **[V] `new Group(fields, params)` without `params.value` wipes every child.** `src/group.ts:31-36`.
  `new Group({a: Field.create({value: 1})}, {visibility: HIDDEN})` yields `value === {a: null}`, and
  `originalValue` is rebaselined onto the wiped state so `isChanged` reports clean. `docs/api/group.md:29-31`
  carries a `::: warning` about it, so it is known behaviour that 1.0 would freeze.
  Fix: `if ('value' in params)`, the same guard `clone()` already uses for `originalValue`.

- **[R] `IFieldConstructorParams = IField & …` admits properties that throw.** `src/field.interface.ts:38`,
  `Object.assign` in `src/field.ts:26` and `src/group.ts:34`. `Field.create({value: 1, valid: true})`
  compiles under `--strict` against the published `dist/index.d.ts` and throws
  `TypeError: 'set' on proxy: trap returned falsish for property 'valid'`. Conversely
  `f.clone({errors: [...]})` compiles and is silently ignored — `clone()` forwards only four properties
  (`src/field.ts:74-79`). Narrowing the type after 1.0 removes members from a published type.
  Fix: separate `IFieldConstructorProps` (writable members only) from `IFieldCloneOverrides`.

- **[R] `registerAction(action: IFieldAction)` is unsatisfiable.** `ActionsMap` requires
  `instanceof FieldActionBase` and otherwise throws `Invalid action type`
  (`src/actions/actions-map.ts:13`), so a structural implementation of the publicly exported interface
  compiles and then throws. `IFieldAction` does not even carry the `classIdentifier` the dispatch uses
  (`src/field.interface.ts:24,43-45`).
  Fix: either type the parameter as `FieldActionBase`, or require `classIdentifier` in `IFieldAction`.
  Both are breaking after 1.0.

### D. Validation

- **[R] Validity does not propagate upwards.** `Group.validate()` is only reached through
  `notifyValueChanged`, i.e. only on a value change (`src/field-base.ts:70-75`, `src/group.ts:137-156`).
  When a child turns invalid by another route (async validator, externally pushed error), `g.valid` becomes
  `false` but `ValidChangedAction` on the group fires zero times — which is exactly the documented
  "enable the Submit button" pattern (`docs/api/actions.md:109`).
  Fix: `parent?.notifyValidChanged()` in the `_valid !== oldValid` branch.

- **[V] Async validators have no sequencing and no cancellation.** `src/validators/validator.ts:61-72` does
  `errors.then(processErrors)` with no token and no `catch`. With a validator taking 150 ms for `'bad'` and
  5 ms for `'good'`, setting `'bad'` then `'good'` ends at `value 'good'`, `valid false`,
  `errors ['bad:bad']`, `validating false` — the field claims validation finished while holding the previous
  value's verdict. The canonical remote-uniqueness example is therefore unreliable.
  Fix: a monotonic token per run, discard everything but the latest. The `ValidationFunction` signature is
  safe to freeze — an `AbortSignal` 4th argument would be additive.

- **[V] `CompareTo` binds to a field instance, so it points at the wrong field after any clone.**
  `src/validators/validator-compare-to.ts:12-45`. Reproduced inverted: `pwd='a'`, `other='b'` gives
  `pwd.valid === true`; `cloned='b'`, `other='b'` gives `cloned.valid === false`. Inside a `List` it is
  worse — `otherField` points at the *template's* field, so a row with `a === 'x', b === 'x'` is marked
  invalid. Password/confirm and date-from/date-to are the advertised use cases.
  Fix: resolve the other field by name or callback at validation time. That changes the `CompareTo`
  constructor, so after 1.0 it means 2.0.

- **[V] `field.validating` is published with the literal type `false`.** `public readonly validating = false`
  (`src/field-base.ts:29`) narrows to a literal in the declarations (`dist/index.d.ts:170`), so
  `if (f.validating === true)` reports `TS2367` against the published types — and
  `docs/api/validators.md:45` recommends exactly that pattern.
  Fix: `public validating: boolean = false` (or a getter over `validatingCount`), and drop the
  `@ts-expect-error` in `validator.ts:63,70`.

### E. Packaging

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

- **[R] `List.insert()` emits wrong indexes in `ListItemAddedAction`.** `src/list.ts:143-144` uses
  `this._value.push(itm)`, which returns the new *length*, not the index. `insert({a: 9}, 3)` on an empty
  list emits `[1, 2, 3, 3]` for four elements — index 0 never announced, 3 announced twice. The only test
  asserts `expect.any(Number)` (`src/list.spec.ts:74`), which cannot fail. The payload of a public,
  documented event is frozen by 1.0.
  Fix: one line (`- 1`) plus a real test.

---

## Recommended before 1.0

- **`clone()` semantics.** `Group.clone()`/`List.clone()` hardcode `new Group`/`new List` instead of
  `this.constructor` (`src/group.ts:163`, `src/list.ts:78`), `clone()` drops every extra property
  (`label`, `placeholder`, …), and `create()` does not preserve the subtype in the types. This has to be
  decided now, because the `Extendable` work below depends on it.
- **`clone()` rebaselines `originalValue`** (`src/field.ts:76`, `src/group.ts:165`) — `List.remove()` returns
  a clone with its dirty state erased.
- **`clearValidators()` on a clone kills validation on the original** (`src/actions/actions-map.ts:61-63`
  plus `validator-compare-to.ts:47-49`): shared action instances, and `unregister()` mutates the shared
  object. The form reports `valid` when it is not.
- **`clearValidators()` does not cancel in-flight async validation** — the field is left permanently invalid
  with an error nobody can clear (`src/field-base.ts:104-108`).
- **Validators run 2..N+1 times during construction, the first calls with `undefined`** — `src/field.ts:25`
  registers before the `_value` assignment on `:27`.
- **A shared `ValidationError` object throws** `TypeError: Cannot redefine property: source`
  (`src/validators/validator.ts:45-47`, `configurable: false`).
- **A `Ref` as a validator message silently loses reactivity** (`src/validators/validator.ts:100-109`
  `unref`s at validation time) — i18n through `computed`/`t()` freezes in the language of the first
  validation, even though the docs list `Ref` as a supported form.
- **`Statement.evaluate()` returns operands instead of a boolean** for AND/OR
  (`src/actions/conditional/statement.ts:47,49`) → conditional actions fire on non-transitions (`0` vs
  `false`), and the callback receives a number where the docs promise `boolean`.
- **There is no way to unregister an action** (`src/actions/field-action-base.ts:31` is an empty stub,
  `ActionsMap` builds a closure chain). List rows leak handlers onto the shared source field permanently;
  around 4565 handlers it hits a `RangeError`. Adding `unregisterAction` to `IField` later is breaking for
  structural implementors — add it as an optional member now at the very least.
- **Async action handlers are neither awaited nor caught** — an `async` `ValueChangedAction` that throws
  ends as an unhandled rejection. Decide and document the contract, because changing it later (setters
  becoming async) is a 2.0.
- **`Group.value` omits a disabled `List` but keeps a disabled `Group`** (`src/group.ts:96`; `List` does not
  extend `Group`) — payload shape.
- **`Group.value = null` does not clear a nested `List`**, and a non-array value is swallowed silently
  (`src/list.ts:48-52`).
- **`Group`'s `_value` cache is not primed** — the first `ValueChangedAction` on a group always reports
  `old = null` (`src/group.ts:18`); likewise the `List.value` setter leaves `_previousValue` stale
  (`src/list.ts:59-65`).
- **`DisplayMode`:** an invalid *string* silently becomes `FULL`, an invalid *number* throws
  (`src/display-mode.ts:29-32`).
- **`Action.label`/`icon` write into the value object behind the setter's back**: no `ValueChangedAction`
  fires, `isChanged` is structurally always `false`, and `Action.create({}).label = 'X'` throws on the
  frozen object (`src/action.ts:21-34,52-61`).
- **`EmptyField` is a shared mutable singleton** (`src/field.ts:90-94`) — `visibility`/`enabled` can be
  overwritten with no warning.
- **Validators are exported twice:** `Validator` is top-level *and* in `Validators`, while the concrete
  validators live only in the namespace (`src/validators/index.ts:3-4`). Pick one shape before both are
  promised.
- **`T` does not propagate** (`class Field<T> extends FieldBase` with no argument,
  `List.value: Record<string, any>[]`, `list.value = null` is a `TS2322` while `group.value = null` is fine);
  the built-in validators carry an unused public `T` and never check the field's type.
- **`IField.parent` is `any`** (`src/field.interface.ts:18`); the real type is `Group | List`, since
  `src/list.ts:43` installs a `List` as the parent.
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
  function-valued validator messages (the i18n path). Nothing tests the built artifact or the export list —
  the minified bundle reports `Don't use constructor to instantiate D` where the docs promise the class name.
- **Documentation:** there is no versioning/stability statement and no supported Vue/Node/browser matrix,
  `## Unreleased` still carries two todo lines (`changelog.md:35-36`), the sidebar has no changelog entry,
  and the docs home links to a GitHub repo that does not exist.

---

## Can wait (non-breaking to add later)

`AbortEventHandlingException` does not veto `*Changing*` events (documented as it behaves) ·
`enabled`/`visibility` fire events even without an actual change · an exception from a handler leaves parents
with a stale cache · `Statement` silently accepts non-fields, so a typo in a field name is a dead condition ·
`Operator.NOT` requires a dummy third argument · `abstract new` vs `new` mismatch in `triggerAction` ·
`parent` is `configurable: false` (documented) · `Group.addField`/`List.length`/`items` are missing
(additive) · `Group`/`List` do not aggregate `validating` · `InAllowedValues` freezes the list at
construction · `ValidationError` has no machine-readable code · error object identity is not preserved
across validations · `isSimpleComponentDef(null)` throws · the UMD global is literally named `[name]` ·
`./style.css` is unreachable under node10 resolution · CI never packs and imports the artifact · no coverage
thresholds.

---

## Pre-existing items

- Make the `IField` interface extendable so that the programmer may add any number of additional properties
  to the Field / Group. The `@dynamicforms/vuetify-inputs` module should then have a mechanism to bind such
  properties to the inputs themselves.

  Note: adding a `TExtend` generic parameter to `IField`/`Field`/`Group` after 1.0 changes published
  signatures, so this belongs before the freeze — and it depends on the `clone()` semantics decision above.

  ```typescript
  //In IField and FieldBase interface declarations
  export interface Extendable {
    setExtendedValues(values: Partial<typeof this>): void;
  }

  export interface IField<T = any, TExtend extends Extendable = Extendable> extends TExtend {
    // obstoječe lastnosti
    clone(overrides?: Partial<IField<T>, TExtend>): IField<T, TExtend>;
  }

  //In FieldBase
  constructor(params?: Partial<IField<T> & TExtend>) {
    super();
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

  clone(overrides?: Partial<IField<T> & TExtend>): Reactive<Field<T, TExtend>> {
    const cloned = Field.create<T, TExtend>({
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
