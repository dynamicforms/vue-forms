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

### Packaging

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
- **There is no way to unregister an action.** `ActionsMap` builds a closure chain, and `unregisterFrom()` tells
  a validator to stop answering rather than taking it out of that chain. Registering the same action on one field
  several thousand times nests a chain deep enough to hit a `RangeError` when it fires. `unregisterAction` can be
  added to `FieldBase` without breaking anyone, but it needs the closure chain replaced by something that can drop
  a single handler.
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
- **A non-array assigned to `List.value` is swallowed silently** (`src/list.ts`) — `setValueInternal` writes only
  for an array, so a wrong type leaves the rows untouched with no error.
- **`List` alone does not fall back to `originalValue`** (`src/list.ts`): `new Field({originalValue: 5})` and
  `new Group({a}, {originalValue: {a: 7}})` start unchanged, while `new List(tpl, {originalValue: […]})` reports
  `isChanged` and reads back `null`, so a list built from a server baseline is dirty before anyone touches it.
- **`DisplayMode`:** an invalid *string* silently becomes `FULL`, an invalid *number* throws
  (`src/display-mode.ts:29-32`).
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
  child `Group` still serializes when its own value is non-empty. Nothing tests the built artifact or the export
  list.
- **Documentation:** there is no versioning/stability statement and no supported Vue/browser matrix, and the
  sidebar has no changelog entry.

---

## Can wait (non-breaking to add later)

`AbortEventHandlingException` does not veto `*Changing*` events (documented as it behaves) ·
`enabled`/`visibility` fire events even without an actual change ·
`Statement` silently accepts non-fields, so a typo in a field name is a dead condition ·
an action registered on an item template after a row was built never reaches that row, because a clone carries the
actions its source held at the moment it was cloned ·
`Operator.NOT` requires a dummy third argument · `parent` is `configurable: false` (documented) ·
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
which is the dominant cost of creating a row; an action shared by the rows has to work out which row it is
running over, and a row is validated before it exists as a record; and `clone()` has to be public for `List`
to use it.

**Bind to a shared definition**: the field definition (validators, actions, defaults) is extracted into a
subobject that rows share, and each row holds only mutable state. `clone()` disappears; `bind(data)`
replaces it. *For:* creating a row allocates state only; an action needs no search to tell one row from
another, because a binding is the row; `CompareTo` resolves within the row for free. *Against:*
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
