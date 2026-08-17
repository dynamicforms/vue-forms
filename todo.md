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

### B. Validation

- **[V] `CompareTo` binds to a field instance, so it points at the wrong field after any clone.**
  `src/validators/validator-compare-to.ts`. Reproduced inverted: `pwd='a'`, `other='b'` gives
  `pwd.valid === true`; `cloned='b'`, `other='b'` gives `cloned.valid === false`. Inside a `List` it is
  worse — `otherField` points at the *template's* field, so a row with `a === 'x', b === 'x'` is marked
  invalid. Password/confirm and date-from/date-to are the advertised use cases.
  Fix: resolve the other field by name or callback at validation time. That changes the `CompareTo`
  constructor, so after 1.0 it means 2.0.

### C. Packaging

- **[V] `peerDependencies: vue ^3.4` but the types need >= 3.5.** With `vue@3.4.38` and
  `skipLibCheck: false`: `TS2707: Generic type 'DefineComponent' requires between 0 and 13 type arguments`
  (the `peerDependencies` entry in `package.json`, `DefineComponent` in `dist/index.d.ts`). The changelog
  explicitly promised `skipLibCheck: false`
  support. CI cannot see it — `tsconfig.json:10` sets `skipLibCheck: true` and CI always installs the newest
  Vue. Narrowing `^3.4` to `^3.5` after 1.0 is breaking.
  Fix: raise the peer range (or hide `DefineComponent` behind a hand-written type), and add a CI job against
  the lowest supported Vue.

- **[V] Whether to keep shipping a CJS/UMD entry point at all.** The API is identity-based — `instanceof` in
  17 places and 13 module-level `Symbol()` without `Symbol.for` — so two copies of the package in one graph
  produce `Invalid fields object provided` / `Invalid action type`. ESM-only removes that hazard for good, and
  removes a working entry point with it, which is why it is a decision to take before the freeze rather than a
  patch: dropping the `require` condition after 1.0 costs a 2.0.

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
- **There is no way to unregister an action** (`src/actions/field-action-base.ts` has an empty stub,
  `ActionsMap` builds a closure chain). List rows leak handlers onto the shared source field permanently;
  around 4565 handlers it hits a `RangeError`. `unregisterAction` can be added to `FieldBase` without
  breaking anyone, but it needs the closure chain replaced by something that can drop a single handler.
- **Async action handlers are neither awaited nor caught** — an `async` `ValueChangedAction` that throws
  ends as an unhandled rejection. Decide and document the contract, because changing it later (setters
  becoming async) is a 2.0.
- **`Group.value` omits a disabled `List` but keeps a disabled `Group`** (`src/group.ts`; `List` does not
  extend `Group`) — payload shape.
- **A non-array assigned to `List.value` is swallowed silently** (`src/list.ts`) — `setValueInternal` writes only
  for an array, so a wrong type leaves the rows untouched with no error.
- **`List` alone does not fall back to `originalValue`** (`src/list.ts`): `new Field({originalValue: 5})` and
  `new Group({a}, {originalValue: {a: 7}})` start unchanged, while `new List(tpl, {originalValue: […]})` reports
  `isChanged` and reads back `null`, so a list built from a server baseline is dirty before anyone touches it.
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
- **Test gaps on exactly the surface being frozen:** `AbortEventHandlingException`, the rule that a disabled
  child `Group` still serializes when its own value is non-empty, and `clearValidators()` with non-validator
  actions — nothing asserts that an ordinary `ValueChangedAction` survives it. Nothing tests the built artifact
  or the export list.
- **Documentation:** there is no versioning/stability statement and no supported Vue/browser matrix, and the
  sidebar has no changelog entry.

---

## Can wait (non-breaking to add later)

`AbortEventHandlingException` does not veto `*Changing*` events (documented as it behaves) ·
`enabled`/`visibility` fire events even without an actual change · an exception from a handler leaves parents
with a stale cache · `Statement` silently accepts non-fields, so a typo in a field name is a dead condition ·
`Operator.NOT` requires a dummy third argument · `parent` is `configurable: false` (documented) ·
`Group.addField`/`List.length`/`items` are missing (additive) ·
`Group`/`List` do not aggregate `validating` · a superseded asynchronous result is dropped, but the request
behind it keeps running: `ValidationFunction` receives no `AbortSignal`, so nothing cancels the call at the
network level and fast typing leaves a request in flight per keystroke — the fourth argument is additive ·
`InAllowedValues` freezes the list at
construction · `ValidationError` has no machine-readable code · error object identity is not preserved
across validations, and `Validator.claim()` copies an error another validator already owns, so the instance
the field holds is not the one the validation function returned · `isSimpleComponentDef(null)` throws ·
`List.insert(item, index)` fills the gap position by position, so an index taken from an API response builds
that many groups and fires that many events synchronously on the main thread ·
`./style.css` is unreachable under node10 resolution · CI never packs and imports the artifact · no coverage
thresholds.

---

## Open design decisions

Two questions with no settled answer yet. Both are worth deciding before the surface is frozen, because
the cheap option in each case is also the one that keeps the other option available.

### How a List gets its rows

**Clone per row** (what the code does): the item template is deep-copied for every row, actions included.
*For:* rows have independent identity, so `v-for` keying and component reuse work with no extra machinery;
per-event property access is direct. *Against:* every row rebuilds an `ActionsMap` and its closure chain,
which is the dominant cost of creating a row; it is the root of the shared-action defects above; and
`clone()` has to be public for `List` to use it.

**Bind to a shared definition**: the field definition (validators, actions, defaults) is extracted into a
subobject that rows share, and each row holds only mutable state. `clone()` disappears; `bind(data)`
replaces it. *For:* creating a row allocates state only; the shared-action defects cannot occur, because
there is one action set and per-binding state; `CompareTo` resolves within the row for free. *Against:*
`bind()` must recurse through nested structure and return stable objects, or `watch` over a field fires on
every render; and `registerAction` on one row necessarily affects all rows, which needs documenting rather
than solving — the closure chain has no defined composition order for a shared chain plus a per-row one.

The two are close enough in cost that the choice is about correctness, not performance. Binding stays
reachable as long as `clone()` is not part of the public surface, which makes that the one question to
answer now.

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

If rows come to share one definition, actions are registered once rather than per row, and the depth problem
shrinks enough that the flag alone would do.

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

      // assign the base properties
      Object.assign(this, otherParams);

      // assign the extended properties
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

    // assign the extended properties on the clone
    cloned.setExtendedValues(this as unknown as Partial<TExtend>);

    // overwrite them with the overrides, if any
    if (overrides) {
      cloned.setExtendedValues(overrides as unknown as Partial<TExtend>);
    }

    return cloned;
  }

  // In FieldBase:
  setExtendedValues(_values: Partial<any>): void {
    // the base implementation is empty
    // subclasses using TExtend override it
  }
  ```

  Most likely `FieldBase` would have to implement a constructor and the clone method, catering for the
  common scenarios.

- More coverage in unit tests (see the test-gap list above for where it actually matters).
