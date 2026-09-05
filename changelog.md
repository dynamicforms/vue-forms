# Changelog

All notable changes to `@dynamicforms/vue-forms` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-09-05

### Added
- `isEqual(a, b)`, a structural comparison that treats a `FieldBase` anywhere in `a` or `b` as the value it holds
  rather than as itself. `isEqual(fieldA, fieldB)` and `isEqual(list.items, other.items)` answer what
  `isEqual(fieldA.value, fieldB.value)` already does, without unwrapping every element by hand — including one
  nested inside a plain object or an array, at any depth. Everything that is not a `FieldBase` compares exactly as
  lodash's own `isEqual` would.

## [1.0.0] - 2026-09-01

### Changed
- No functional change from 0.18.0. This release is the stability commitment: the public API is frozen, and a
  further breaking change bumps the major version rather than the minor one, per Semantic Versioning.

## [0.18.0] - 2026-09-01

### Added
- Every built-in validator's message is translatable. `translateStrings`, from `@dynamicforms/translatable`,
  replaces the English default of one or more of `Required`, `MinValue`, `MaxValue`, `ValueInRange`,
  `MinLength`, `MaxLength`, `LengthInRange`, `Pattern`, `InAllowedValues`, and `ValidationFailed` - an error
  already on screen updates in place, placeholders re-interpolated, the moment it is called; a key it is not
  given for keeps its English default.
- `buildErrorMessage` accepts a `Ref<string>` in addition to a plain string, returning a `ComputedRef` that
  re-applies the markdown/plain-text choice as the ref's value changes.

## [0.17.1] - 2026-08-21

### Changed
- An `AbortEventHandlingException` raised in a chain that has an asynchronous handler in it is answered with rather
  than raised, the way it is in a wholly synchronous one. `Action.execute()` resolves with the
  exception instead of rejecting with it, so a caller that read it off a `catch` branch reads it off the answer:

  ```typescript
  const answer = await save.execute();
  if (answer instanceof AbortEventHandlingException) reportRefusal(answer.message);
  ```

  A handler that reads an abort off its own `supr` call is unaffected: inside the chain it is a throw, and only the
  trigger converts it. A rejection carrying anything other than an abort still reaches the caller as a rejection.

### Fixed
- A handler that ends its run from an asynchronous handler leaves no unhandled rejection behind. The `*Changed*`
  setters discard what the trigger answers with, so an abort travelling as a rejection reached nothing but the
  runtime's unhandled-rejection reporting - under node's default settings, the end of the process.
- `ActionsMap.triggerEager()` ends only the identifier group the abort was raised in where that group is
  asynchronous, as it does where it is synchronous. The other groups run, and the abort is not reported as
  unhandled.

## [0.17.0] - 2026-08-20

### Added
- `Extras`, an empty exported interface that is what the `X` type argument of every element defaults to. A UI
  layer declares the properties it renders forms with once, by augmenting `Extras` in a `declare module` block,
  and every element in the consuming application then carries them — including the fields written inline in a
  `Group` declaration, which no type argument on the group can annotate. Where an element states an `X` of its own
  it replaces the default, so `Field<string, Extras & Local>` is how it carries both, and `Action` defaults to
  `Extras` without the keys of `ActionValue` because `label` and `icon` are members it declares itself. The
  default reaches `FieldBase<T>` as well, so a validator or an action handler reads the augmented properties off
  the element it receives without a cast. Nothing changes for existing code: `Extras` is empty until something
  augments it, and an element that states its own `X` is unaffected.
- `effectiveEnabled` on every element: `true` where the element and every container above it are enabled. A
  rendering layer binds it to draw the inputs of a disabled section disabled, instead of walking the parent chain
  for each of them. It is a read — `enabled` on each element stays what was written to it, a write to a member of
  a disabled container is accepted as before, and what a container serializes is decided by the members' own
  `enabled`.

### Changed
- **Breaking.** `ActionValue` declares `label` and `icon` as `unknown`, and `Action`'s accessors for them read
  their type off the value rather than fixing `string | undefined`. What a label and an icon are is the rendering
  library's to say, and `unknown` is what lets it say so: `interface RichValue extends ActionValue { label?: string
  | MdString }` is legal where a `string` in the base refused it, and a subclass cannot widen an accessor the base
  class typed — that is `TS2416`, which no cast on the subclass's side reaches. A subclass therefore restates the
  two members in its value type and the inherited accessors answer at that type, with no accessor override needed
  unless the read is to be filtered.

  What moves for a consumer: on an `Action` that states no value type, `action.label` and `action.icon` read as
  `unknown`, so `action.label?.toUpperCase()` no longer compiles and the reader states what it expects — `action
  .label as string | undefined`, or a value type on the action. An action built from a literal is narrower on its
  own, because `T` is inferred from it: `new Action({ value: { label: 'Save' } })` reads `label` as `string`.
  Writes are unaffected at every shape, and nothing changes at runtime.

## [0.16.1] - 2026-08-20

### Fixed
- An `Action` keeps a value that states something other than a label or an icon. `Action` is meant to be subclassed
  with a wider value type, and the emptiness test read `label` and `icon` alone: a value naming a render style, a
  name or a set of per-breakpoint options and neither of those two was taken for empty and replaced by the pair of
  `undefined`s, so the action came out holding nothing at all and a button rendered from it came out blank. The
  question is asked over every member the object carries, which answers the same for the shape the base class
  declares.
- An `Action`'s baseline carries exactly what it was declared with. `params.originalValue` was copied into
  `{ label, icon }`, so a widened baseline lost every member beyond those two and the action it belonged to was
  measured against a fraction of what was declared for it.
- An `Action` declared with a value and a matching `originalValue` reports `isChanged` false from construction, and
  so does every `Group` holding it. This is the base class and not only a subclass:
  `new Action({ value: { label: 'S' }, originalValue: { label: 'S' } })` reported `isChanged` true, because
  `isChanged` is a structural comparison and reads own-key sets, and the two objects were built differently - the
  value kept by identity, carrying the one key it was declared with, and the baseline reshaped into the pair the
  base class names. The baseline is a frozen copy of what was declared, and the value itself where nothing declared
  one.
- A bare `new Action()` reports `isChanged` false. Its baseline was never assigned, so the pair of `undefined`s it
  holds was measured against `undefined` and every action constructed without parameters reported itself changed,
  its containers with it.

### Added
- `FieldBase.constructed(params)`, the hook a subclass overrides to complete what the element was built with.
  `Field`, `Action`, `Group` and `List` call it at the end of a construction, inside the transaction the
  construction is and before the element records what it was built as, so what the override writes - `_value`, a
  member, `originalValue` - belongs to the construction rather than being a change of it: no `ValueChangedAction`
  announces it, an element built `enabled: false` does not refuse a write to `_value`, and what the hook leaves is
  what the eager actions and the validators then run over. Where the parameters named no `originalValue` the
  element is baselined on the value the hook left, so it starts unchanged; where they named one it is measured
  against that, as any element is. It receives the parameter
  object the constructor was given, where it was given one. A write made after `super.init()` returns is none of
  that, being a change to a finished element.
- Three specs holding the library from a consumer's seat rather than from its own: a binding layer's computed over
  `value` and the reads it repaints from, an `Action` and a `Field` subclassed with a widened value, and a
  serializer reading `value` and `fullValue` back and writing a record into a form.

### Documentation
- **[Widening the value in a subclass](https://docs.velis.si/dynamicforms/vue-forms/api/actions#widening-the-value-in-a-subclass)**
  on the `Action` reference: what a subclass adds and what it keeps, and that a subclass reading `label` or `icon`
  in a shape of its own declares the getter and the setter together, the setter delegating to the base with
  `super.label = newValue`. A getter declared alone defines the whole property, which then has no setter at all, so
  `action.label = 'Save'` - the documented way to write either member - throws a `TypeError` in module code. A
  narrowed read and an unnarrowed write do not answer each other; `action.value.label` is the unfiltered read.
- The value rules on the same page state what a construction settles on: a `params.value` counts as empty when
  every member it carries is `null` or absent, and `params.originalValue` is frozen carrying every member it was
  given.
- [Extended properties](https://docs.velis.si/dynamicforms/vue-forms/api/field#extended-properties) and the
  [extended properties example](https://docs.velis.si/dynamicforms/vue-forms/examples/extended-properties) hold the
  two rules apart: an action's presentation property of another name is an extended property, while a differently
  shaped read of `label` or `icon` is an accessor pair on the subclass. The
  [Action example](https://docs.velis.si/dynamicforms/vue-forms/examples/action) points at the same section.

## [0.16.0] - 2026-08-20

### Changed
- **Breaking:** a trigger answers with the `AbortEventHandlingException` a handler threw, where it answered `null`.
  A run a handler ended and a run that reached no handler at all were the same answer, so neither the library nor a
  caller could tell them apart. `triggerAction()` hands the exception back, and code testing for `null` sees the
  difference - which is the point, because the two mean different things.
- **Breaking:** `AbortEventHandlingException` thrown from an `EnabledChangingAction` or a `VisibilityChangingAction`
  refuses the write. Those handlers are asked before the value is written, and the exception was caught and the
  write went through anyway, so a handler that meant to stop a change watched it happen. Nothing is written and
  nothing is announced now. Thrown from a `*Changed*` handler it is unchanged: the value is already written by
  then, and ending the run stops the handlers below it and nothing else.

- **Breaking:** an action belongs to the element's declaration, and a binding reads that one rather than a copy of
  it. A rule registered on a `List`'s item template therefore drives every row - the rows that already exist as
  much as the ones added later - and registering on one row registers on the template, because a row is a binding
  of it. `unregisterAction()` and `clearValidators()` read the same way, so a call on one row names the rule every
  row reads. What stays per row is the data: the value, the errors the rule produces there, the verdict.
  A handler that does not call `supr` now ends the run for every handler registered before it on that declaration,
  since the handlers of one declaration stand in one chain.
- Memory per field drops by about half, from roughly 1700 bytes to roughly 870: a row carried its own map of
  actions and now carries the declaration's. A 1000-row list of 8 fields goes from about 13.3 MB to about 6.8 MB.
  `ActionsMap.clone()` is gone with the copying.

- `ActionsMap` holds one array and no maps. The two it kept - one grouping the actions of an identifier, one
  grouping the eager ones - indexed what registration order already states, and a trigger now walks the array
  backwards and passes over the actions of other identifiers. Measured over three actions the walk is about twice
  as fast as `Map.get`, and a standalone field carrying one validator falls from about 1420 bytes to about 655.

- `Operator.NOT` is stated with one operand. It reads its first alone, and the constructor asked for a second one
  that it never read, so `new Statement(field, Operator.NOT)` did not compile. An operator held in a variable -
  what `Operator.fromString()` answers with - still names both, because the compiler cannot tell it from `NOT`, and
  a second operand under `NOT` is accepted as it always was.

- `Action.execute()` documents the failure path it always had: the promise it answers with rejects where the
  handler throws, so awaiting it is how a failure is reported, and a call that neither awaits nor catches leaves
  the rejection to the runtime. `busy` is cleared either way. The template case has its own example, since an
  event handler there is not awaited.

## [0.15.0] - 2026-08-19

### Changed
- **Breaking:** `EmptyField` is gone. It was a module-level singleton `Field` the package exported, shared by
  everyone who touched it, and nothing used it - not the library, not its tests beyond the one asserting its own
  warning, not any of the packages built on it. A missing element is `null`: `Group.field()` answers with it and
  `NullableField<T>` names the type.
- **Breaking:** `Validator` and the types that go with it - `ValidationFunction`, `ValidationFunctionResult`,
  `ValidatorBindingState` - are reached through the `Validators` namespace alone. They were exported from the
  package root as well, while every concrete validator was in the namespace only, so one member of the set had two
  spellings and the rest had one. `import { Validator }` becomes `Validators.Validator`. The error classes,
  `MdString` and `buildErrorMessage` are unaffected: they are what a field hands back rather than what validates
  it, and they stay at the root, where they were never duplicated.
- **Breaking:** nothing in `DisplayMode` falls back to `DisplayMode.FULL` any more. `fromString()` throws for a
  string that names no constant, `fromAny()` throws for a number that is none of them, for a string that names
  none, and for input that is neither a number nor a string; all three errors read
  `<value> is not a DisplayMode constant`, so a caller recognises one wherever it was raised. A mode nobody
  defined is an error where it arrives, rather than a field that renders fully and is never questioned. Code that
  fed a wire payload to `fromString()`/`fromAny()` and relied on the fallback has to catch the error and choose
  the mode it wants, or ask `isDefined()` first.
- **Breaking:** `DisplayMode.isDefined()` judges a string against the constant names instead of routing it through
  `fromString()`, so `isDefined('HIDEN')` answers `false` where it answered `true`. It is the one member that does
  not throw - it answers `false` for a number that is no constant, for a misspelled name, and for input of any
  other type. The `visibility` setter asks it, which makes both spellings of the same mistake throw:
  `field.visibility = 'HIDEN'` and `field.visibility = 999` alike raise
  `Error('visibility must be a DisplayMode constant')` and leave the property as it was, where a misspelled name
  silently became `DisplayMode.FULL`. A constant's name is still accepted, case insensitive.
- A form element whose parameters name no visibility still starts at `DisplayMode.FULL`. That is a starting value,
  and it no longer stands in for input a parse could not read.
- **Breaking:** `parent` is typed per class. `FieldBase.parent` is `Group | List | undefined`, which is what the
  link holds: a row of a `List` gets the `List`. `Field` narrows it to `Group | undefined` and `Action` inherits
  that narrowing, because a `List` holds rows and a row is a `Group`, so a field is never a `List`'s child. The
  sibling lookup `field.parent?.fields.other` therefore compiles unchanged on a field, and `row.parent.fields` is
  a compile error where it was a promise the type could not keep - the declared `Group` was the container's type
  for a member of a group and the wrong one for a row. Code holding an element as a `FieldBase` - which is the
  type an action executor and a `ValidationFunction` receive - narrows the container itself:
  `(field.parent as Group)?.fields.other`.
- **Breaking:** a structural comparison of two elements answers identity. `isEqual(fieldA, fieldB)` read nothing
  either element holds - the state is in private class fields - and answered `true` for any two instances of the
  same class; it is `false` now unless they are the same element, and what they hold is compared as
  `isEqual(a.value, b.value)`. `FieldBase` carries a `Symbol.toStringTag` accessor naming the element's class,
  which is the first thing such a comparison reads and a tag it does not know ends it there. The accessor is on the
  prototype, so an element carries nothing for it, and `Object.prototype.toString.call(field)` answers
  `[object Field]` where it answered `[object Object]`.
- The build tooling moves to `eslint-config-velis` 3, which states its plugins as peer dependencies rather than
  carrying them, so the thirteen it names are declared here: eslint 10, `@typescript-eslint` 8.67,
  `eslint-plugin-unicorn` 73, prettier 3.9, `@types/node` 26 and the rest. `npm audit` goes from 18 findings to 3,
  and the three that remain are VitePress's pinned dev server with no fix published. None of it reaches the
  published package, which declares `lodash-es` and `vue`.

- A rule written against a field of an *enclosing* row now reads the row it runs in. Resolution answered within
  one record and took an element belonging to any other for the one element every record reads alike - true of a
  form field above a list, false of a field of the row a nested list sits in - so the lines of an order compared
  against the item template's `total` rather than against that order's. It walks the containers of the record
  outward before it settles for that, which is what the name form always did, so the two forms agree on the same
  rule.

- **Breaking:** writing what an element already holds is not a change. `visibility` and `enabled` ran their
  `*Changing*` handler, enrolled the element in the open transaction and fired their `*Changed*` event for a write
  of the value already there; they now return before any of it, the way the value setter always has. A handler that
  answers with a value of its own is therefore not reached by such a write.
- A validator that re-runs and produces the message the field already carries leaves the instance standing.
  `ValidationError.sameAs(other)` is what it asks - same class, same code, and the same component, bindings, body
  and classes - because a structural comparison of two errors answers nothing useful: `ValidationErrorRenderContent`
  holds a Vue `computed`, and two of those are never structurally equal, so every run replaced the error and every
  reader of `field.errors` re-rendered over a verdict that had not moved.
- `isSimpleComponentDef(null)` answers `false` rather than raising. `typeof null` is `'object'` and `in` refuses
  null, so the guard reached the operator and threw where it was asked a question it can answer.

- `AbortEventHandlingException` is covered by tests: what a run it ends leaves unreached, that it does not escape
  the setter and leaves the value that was written standing, that `triggerAction()` answers null for that run, that
  it ends only the run it was thrown in, that every other exception reaches the caller and unwinds the transaction,
  and that a `*Changing*` handler throwing it does not veto the write.
- CI loads the built ESM artifact and exercises it - the export list, a list composing and validating, `value`
  against `fullValue` over a disabled member, and a transaction announcing once and rolling back on a throw. The
  specs import `src/`, so nothing else reached what the package actually publishes.
- `defaultDisplayMode` is exported from the package. It names the mode an element starts at, so code that has
  to choose one for input it could not parse states the same constant the library does rather than repeating
  `DisplayMode.FULL`.
- **Breaking:** a disabled `List` is serialized by the `Group` above it while its rows compose something, the way a
  disabled `Group` already was. The exception is one rule now - a disabled container is kept where its composed
  value is non-empty and left out where it is empty - and it holds whichever container the member is. A disabled
  leaf is left out as before. A form that read `group.value` to submit it now carries the rows of a disabled list
  it previously dropped.
- **Breaking:** `List.value` refuses a value that is neither an array nor null with a
  `TypeError('Invalid value provided: a list takes an array of rows, or null to empty it')`, where such a value was
  accepted and silently did nothing. The setter is typed, so this reaches a JavaScript caller or one writing
  through `as any`; the constructor's `value` and `originalValue` are refused the same way.

### Fixed
- A `List` constructed with an `originalValue` and no `value` takes its rows from it, the way a `Field` and a
  `Group` already did: it held no rows, read back `null` and reported `isChanged` as `true` against the very value
  it was declared with. An explicit `value: null` still leaves the list empty - null is a value the caller means -
  and an absent value with no `originalValue` beside it still starts the list empty.

## [0.14.0] - 2026-08-19

### Changed
- **Breaking:** `IBindParams` names `originalValue`, `enabled`, `visibility` and the extended properties, where it
  named everything a constructor takes but the value. `bind()` read three of those and dropped the rest, so
  `f.bind(v, { validators: [...] })`, `{ actions }`, `{ touched }` and `{ errors }` compiled and did nothing. They
  are refused by the type now: `validators` and `actions` are carried from the declaration rather than supplied,
  and `touched` and `errors` are what a binding establishes for itself as it validates.
- **Breaking:** `Group.bind()` and `List.bind()` construct through `this.constructor`, as `Field.bind()` already
  did, so a subclass binds into its own class instead of into the base one. A subclass whose constructor does not
  take `(fields, params)` - or `(itemTemplate, params)` on a `List` - never sees what it is handed and would answer
  with the declaration's data instead of the record's; both refuse that with a `TypeError` naming what to do about
  it, rather than returning a binding whose data is quietly wrong.

## [0.13.0] - 2026-08-19

### Added
- `settled()` on every element answers with a promise that resolves once nothing at or below it is running - no
  asynchronous validation, no `Action.execute()` yet to settle. It resolves at once where nothing is running, so a
  submit path awaits it instead of reading `validating` and `busy` and reading them again. It answers for the
  moment it resolves and states nothing about the one after: work started later leaves the element running again.

### Changed
- **Breaking:** `Group.fullValue` is typed `FieldsToFullValues<T>` and `List.fullValue` is `FieldsToFullValues<T>[]`,
  where both answered `Record<string, any>` or the list's own `value` before. `fullValue` states what an element
  holds where `value` states what it serializes, so every key is present and none is null - reading through a
  nested group needs no `?.`. `List` gains an override of its own: it maps its rows through their `fullValue`
  rather than answering with `value`, so a field disabled inside a row is in it, and an empty list reads back as
  `[]` rather than as null.
- **Breaking:** `busy` states an execution and nothing else. It is `true` while an `Action.execute()` at or below
  the element has yet to settle; an element that is not an action executes nothing and answers `false`. An
  asynchronous validation is what `validating` answers for, on the element and on everything below it. The two
  questions are separate, so a form that gates on an idle tree reads both or awaits `settled()`.
- **Breaking:** `Required` trims a string before it measures it, so a value of spaces alone is no value and the
  field is invalid. Where the spaces are part of what the field holds, `trim` turns it off. The constructor takes
  the options beside the message or on their own:

  ```typescript
  new Validators.Required();                                  // whitespace-only fails
  new Validators.Required({ trim: false });                   // whitespace-only passes
  new Validators.Required('Please enter a name');             // message, trimming still on
  new Validators.Required('Please enter a name', { trim: false });
  ```

  `RequiredOptions` is exported. Only strings are trimmed; an array, an object or any other value is measured as
  it stands. The two first arguments are told apart by shape, so an object naming a component is still a message.
- **Breaking:** the `Statement` constructor refuses an operand it cannot compare. An operand that is `undefined` —
  what `group.fields.typoName` answers with — or a function — a field accessor handed over uncalled — throws a
  `TypeError` naming the position it was written at. Everything else stands: a field, a nested statement, `null`,
  `NaN`, `0`, `''`, an array, an object with `includes`. `Operator.NOT` never reads its second operand, so that
  operand is not checked under it. A name the group does not hold reaches `Statement` as `undefined` only through
  `group.fields`; `group.field('typoName')` answers `null`, which is a value a statement may legitimately compare
  against.
- **Breaking:** `validating` answers for the whole subtree: a group or a list reports true while an asynchronous
  validation is in flight anywhere below it, where it used to answer for its own runs alone. A form asks one
  element what the tree is doing. The answer is a pair of counters rather than a walk, so the read costs nothing
  and a run that starts or settles costs the nesting depth.
- **Breaking:** `busy` is a member of every element, so a parameter of that name is no longer an extended property:
  `new Field({ busy: true })` throws a `TypeError` the way `valid` and `validating` already did. `length` and
  `items` are members of `List` for the same reason, so `new List(tpl, { length: 3 })` and `new List(tpl, { items:
  [] })` throw as well. A presentation layer that carried any of the three as a property of its own states it under
  another name.
- **Breaking:** `GroupValue<T>` is `Partial<FieldsToValues<T>> | null`. A group leaves a disabled member out of the
  value it builds, so every member reads as possibly `undefined` — which is what the runtime always handed out.
- **Breaking:** the five validators that never read their type parameter no longer take one: `Required`, `Pattern`,
  `MinLength`, `MaxLength` and `LengthInRange`. `new Validators.Required<string>()` becomes
  `new Validators.Required()`. `InAllowedValues`, `MinValue`, `MaxValue`, `ValueInRange` and `CompareTo` keep
  theirs, where it types an argument or a callback.
- `InAllowedValues` takes `AllowedValues<T>` — an array, a `Ref<T[]>` or a `() => T[]` — and reads the list at each
  validation instead of at construction. A list that arrives from a server after the validator is built, or one
  another field's value leaves open, is the list the value is measured against and the one `{allowedAsText}` and
  `{allowedValues}` name.
- `group.fields` hands out a guarded view of the member map. Reading it reaches the members themselves; assigning,
  deleting and now also `Object.defineProperty` throw a `TypeError` naming `addField()` or `removeField()` as the
  way to change the set.
- `list.value` accepts `ListValue`, so `list.value = null` — the write that clears a list, and the one
  `group.value = null` makes into every member — type-checks.

### Added
- `ValidationError.code` names what failed, so a program reacting to a particular failure does not have to match
  message text that is translated and configurable. The built-in validators state theirs: `required`, `pattern`,
  `min`, `max`, `range`, `min-length`, `max-length`, `range-length`, `in-allowed-values`, `compare-to`, and
  `validation-failed` on the error the library raises when a validation promise rejects. `ValidationErrorText` and
  `ValidationErrorRenderContent` take it as a third constructor argument; an error built by hand carries whatever
  its author gives it, or nothing.
- A `ValidationFunction` receives a fourth argument, `signal: AbortSignal`, and hands it to the work it
  commissions. It aborts the moment the verdict the run would reach stops counting: a newer run over the same
  field, a field the validator was taken off with `unregisterAction()` or `clearValidators()`, or a transaction
  that was unwound. A cancelled run reaches no verdict at all, so a check that rejects on abort says nothing and
  reports nothing. The cancellation an unregistration brings waits for the commit, so a transaction that rolls
  back puts the validator, its epoch and the run in flight all back, and the field ends up carrying the verdict
  that run reaches rather than reporting itself valid over a value nothing checked. A function with nothing to
  cancel ignores the argument.
- `busy` on every element: true while anything at or below it is still running — an asynchronous validation, or an
  `Action.execute()` below it that has yet to settle. On an `Action` it answers for that action's own `execute()`
  runs, and an asynchronous validation of the action itself is reported by `validating` alone. It is what a form
  asks to disable a submit button while the tree is still deciding.
- `Group.addField(name, field)` and `Group.removeField(name)` change the member set after construction. Both are
  transactional and announce the value once the transaction closes; the group's verdict re-forms over the members
  it holds, and a rule of the added field that names another member of the form reaches it. `addField` throws
  `Error` where the group already holds that name and `TypeError` where the field belongs to another container —
  pass a `bind()` of it. `removeField` hands the field back, detached and free to be taken elsewhere, and answers
  `undefined` for a name the group does not hold. Neither rewrites the baseline behind `isChanged`.
- `List.length` and `List.items`. `length` is the number of rows. `items` is a frozen array of the live rows, built
  once per change of the set: a write inside a row leaves the array a reader took as it is, and so does an
  assignment to `value` that every row survives, while a `push`, `insert`, `remove` or `clear` replaces it.
- `getConfig()`, `setConfig()` and the `FormsConfig` type are exported from the package entry point beside the
  plugin, so the global options can be read and written without the plugin.

### Fixed
- `CompareTo` withdraws the errors it placed on a field when it is taken off that field. `unregisterAction()` on a
  `CompareTo` dropped the registration and left the error standing, so the field stayed invalid on an error no
  validator was left to take back.

## [0.12.1] - 2026-08-19

### Changed
- The build target is ES2022, up from ES2015. The only thing it changed is `field-base.ts`: it is the sole
  file holding private class fields, and an ES2015 output has to lower each of its 51 access sites to a
  WeakMap lookup guarded by an access check. The artifact goes from 92 715 to 87 902 bytes, 25 728 to 24 547
  gzipped, and the private fields ship as themselves. Every runtime the package already declares support for —
  Node 22 and up — runs ES2022 natively.

## [0.12.0] - 2026-08-18

### Changed
- **Breaking:** the package is ESM-only. The `require` condition, the `main` field, the UMD artifact
  (`dynamicforms-vue-forms.umd.cjs` and its map) and the `index.d.cts` copy of the declarations are gone; `exports`
  resolves one build with one set of types. A CommonJS consumer reaches the library through `require()` of an ES
  module, which Node supports from 20.19 and 22.12. `lodash` leaves `dependencies` — it was there only so the UMD
  artifact could require the CJS packaging of `lodash-es` — leaving `lodash-es` as the single runtime dependency.
  Shipping one format also removes the failure a mixed graph produced: the library compares elements with
  `instanceof` and keys its internals with module-level `Symbol()`, so a program holding both copies rejected a
  valid `Field` with `Invalid fields object provided`.
- **Breaking:** `engines.node` is `>=22`, up from `>=18`. Node 18 reached end of life in April 2025, and
  `require()` of an ES module — what a CommonJS consumer now relies on — is stable from 22.12.
- **Breaking:** the `vue` peer range is `^3.5.2`, down from `^3.4`. The declarations `vue-tsc` emits write
  `MessagesWidget` as a `DefineComponent` with 20 type arguments; the type takes 19 through Vue 3.5.1 and 20 from
  3.5.2, so anything below that floor reports `TS2707` in a consumer type-checking with `skipLibCheck: false`.
  Nothing in the source needs a Vue newer than 3.0 — the range states what the shipped artifact is known to work
  against, and CI now type-checks the emitted declarations against exactly that floor on every run.
- **Breaking:** `ActionsMap` holds the actions of one identifier as a list rather than composing them into nested
  closures, and no longer extends `Map<symbol, FieldActionExecute>`. `triggerChain()` and
  `cloneWithoutValidators()` are gone — `trigger()` is the one way to run a group and no longer runs the eager pass
  on the quiet, and `clearValidators()` unregisters its validators instead of rebuilding the map. `unregister()`,
  `triggerEagerFor()` and `hasEager` are new. The order handlers run in is unchanged: newest registration first,
  reaching the ones before it through `supr`.
- **Breaking:** `eager` is read per action instead of per `classIdentifier`. A lazy action standing under the same
  identifier as an eager one was previously dragged into every eager pass; now only the eager ones run.
- `unregisterFrom(binding)` runs inside the operation that drops the registration rather than after it commits, so
  an operation that unwinds puts back both the registration and what the action released.

### Added
- `unregisterAction(action)` on every element drops one action and answers whether the element held it. The
  instance goes on serving every other element it was registered on, so unregistering a validator from one row of a
  `List` leaves the other rows validating. A `Validator` withdraws the errors it put on the element as it goes, so
  the element cannot be left invalid on an error no validator is around to take back.
- `registerActionBefore(action, before)` puts `action` inside a handler already registered: `before` wraps it and
  reaches it through `supr`. Registration order alone could not arrange that, so an action added to a form someone
  else built could only ever become the outermost handler.
- A rollback takes back the actions its transaction registered and puts back the ones it unregistered, so
  "a transaction undoes everything it did" holds without an exception for registrations.

## [0.11.0] - 2026-08-18

### Changed
- **Breaking:** `clone()` is now `bind()`, and takes the data it binds as its first argument. The call does what
  it always did — a new element of the same class, carrying the same registered action and validator instances and
  the same extended properties, detached and with `originalValue` baselined to the data — and it is now named for
  that. The value moves out of the override object and into an argument of its own:

  ```typescript
  const copy = field.clone();                              // before
  const copy = field.bind(field.value);                    // after; field.bind() is the same thing

  const cleared = field.clone({ value: null });            // before
  const cleared = field.bind(null);                        // after

  const row = template.clone({ value: { name: 'John' } }); // before
  const row = template.bind({ name: 'John' });             // after
  ```

  The second argument is the rest of the overrides, typed `IBindParams<T, X>` — `IFieldParams<T, X>` without
  `value`. `originalValue` is still read by key presence, `enabled` and `visibility` still fall back to the element
  bound, extended properties it names are still written over the ones carried over, and `validators` and `actions`
  are still accepted and ignored. Data of `undefined` counts as none supplied and an explicit `null` clears, on
  `Field`, `Group` and `List` alike.
- **Breaking:** `List.remove()` and `List.pop()` hand back the row itself, released of the list, rather than a
  copy of it. `ListItemRemovedAction` receives that same instance, and it is the instance `list.get(index)`
  answered with before the call. What the row holds comes with it: its values, its errors, and the change history behind
  `isChanged` — which the copy erased, so an edited row used to come back reporting `isChanged` as `false`. The row
  carries no `parent`, so it can be pushed straight into another list, or back into this one.

### Added
- **`rebind(data)`** on every element: the exchange `bind()` makes, made in place. The element is the same
  instance afterwards — its identity, its actions, its extended properties and its place in whatever container
  holds it all stand — and it ends up over the new record, with `originalValue` baselined to it, `touched` back to
  `false` and the validators run. It is what recycles one element across records, which is what a virtualised
  renderer does with the rows it keeps:

  ```typescript
  const row = list.get(0)!;
  row.rebind({ name: 'Jane', age: 25 });   // same instance, same component, next record
  ```

  The element announces nothing of its own about the exchange: no `ValueChangedAction` fires for it, the way none
  fires for an element that was just built. Its members do announce theirs, and a verdict that moves is announced
  as always, so a rebound row that is invalid says so to the list holding it. Inside an open `transaction()`, a
  change the element is already owed an announcement for stands, and the commit reports it from where the element
  stood when the transaction opened. On a `Group` the record need not name every member: a key it leaves out is
  taken from the element's `declaration`.
- **`IBindParams<T, X>`**, the exported type of the second argument of `bind()`.

## [0.10.2] - 2026-08-18

### Added
- **Extended properties.** Every form element now carries whatever properties your application declares for it
  beyond the members of its class — a label, a hint, a css class, a permission flag — so a form whose shape
  arrives from a server has somewhere to put them and a UI layer has somewhere to read them from. Declare them as
  the element's second type argument, pass them to the constructor alongside everything else, read them through
  `extra` and write them with `setExtendedValues()`:

  ```typescript
  interface Presentation { label: string; hint?: string }

  const name = new Field<string, Presentation>({ value: 'John', label: 'First name' });
  name.extra.label;                                    // 'First name'
  name.setExtendedValues({ hint: 'as in your passport' });  // label stays as it was
  ```

  `Field<T, X>`, `Action<T, X>`, `Group<Fields, X>` and `List<Fields, X>` all take it, `X` defaults to `{}` and is
  never inferred, so existing code compiles unchanged and an element that declared no extended properties still
  rejects one. The read is tracked like every other read through an element, so a template rendering
  `field.extra.label` re-renders when the property is written, and a write inside a `transaction()` that rolls
  back is put back with it. `clone()` carries them over, and overrides it is given are written over them — which
  also gives every row a `List` builds the properties its item template carries.

  `extra` reads back as `Readonly<Partial<X>>`: a parameter object carries as few of them as it likes and
  `setExtendedValues()` writes as few as it likes, so a property is there once something has put it there.
- **`IFieldParams<T, X>`**, the exported type of the parameter object taken by every constructor and every
  `clone()`. `IFieldConstructorParams<T>` goes on naming the members every element takes.

### Changed
- A constructor parameter naming something the element's class does not declare is now an extended property
  rather than a property written onto the element itself. It was already a compile error to pass one; code that
  passed one past the type system with `as any` and read it back as `field.myProp` now reads it as
  `field.extra.myProp`. Parameters naming a member the class does declare are unaffected: `enabled` still sets
  `enabled`, `valid` still throws a `TypeError`, and an `Action`'s `label` and `icon` still reach its value. A
  subclass of your own is a member the class declares when it declares an accessor; a class field is defined on
  the instance after the base constructor has applied the parameters, so a parameter of that name becomes an
  extended property and the field keeps its initializer.

## [0.10.1] - 2026-08-17

Documentation only. No behaviour changes, and no source under `src/` was touched.

### Added
- **[The model](https://docs.velis.si/dynamicforms/vue-forms/guide/model)**, a new guide page placed ahead of the
  API reference. It states the whole design in one place — elements, declarations and clones, how a `List` builds
  rows, what a record is and how a shared rule resolves within one, when each event fires, where validity comes
  from and where a value comes from — for a reader who has never used the library. The reference pages carry the
  per-symbol truth; this is the shape they belong to.
- **[An `Action` example](https://docs.velis.si/dynamicforms/vue-forms/examples/action)**, showing an action end
  to end: declared with a label and an icon, enabled by the form's validity through a `ConditionalEnabledAction`,
  executed, and reporting `busy` through an asynchronous submit that can fail. It says plainly why `Action` is the
  one deliberate exception to the library being UI-agnostic and that a UI library is expected to extend it, and it
  cross-links to `@dynamicforms/vuetify-inputs`.
- **A single upgrade path from 0.6.1 to 0.10.x** at the top of the migration guide, leading with the three breaks
  that fail with nothing in the console — `watch(field, cb)`, `readonly(field)` and `isEqual` over two elements —
  and ending in a checklist. The per-release sections stay below it for a project crossing one release.
- **A versioning and support statement** in Getting Started: what a `0.x` minor means, and the supported Vue, Node,
  module-format and browser matrix. The changelog is now reachable from the site navigation.

### Fixed
- `Field.value` no longer claims that assigning an object fires `ValueChangedAction` even for the same reference.
  Values are compared by identity: a new object announces a change even when it is deeply equal to the old one, and
  the very object the field already holds announces nothing. Mutate a copy and assign it.
- `field.errors` is documented as it behaves. `valid` follows an error pushed into the array immediately, on the
  field and on every container above it; what waits for `validate()` is the `ValidChangedAction` announcing the
  transition. The array is reactive, so `field.errors[0] === myError` is `false` for the error a validator
  returned — compare by content, or unwrap with `toRaw()`.
- The reactivity claims are corrected everywhere they appeared. A form element has not been a Vue proxy of itself
  since 0.7.0; every read through it is tracked, and the watch form to use is `watch(() => field.value, cb)`.
- `List.value`'s setter is described as it behaves: an array assigns, a `null` — which is what `group.value = null`
  writes into a nested list — releases every row, and any other value leaves the rows untouched.
- `ActionsMap`'s documented surface lists `triggerChain()` and `willTrigger()`, which it has always had, and
  `Statement`'s `operand1Value` / `operand2Value` are documented.
- A hand-written validator that reads a sibling is shown calling `field.markRecordIncomplete()`, which is what a
  `List` row needs to carry its own verdict from the moment it exists. The `List` example no longer revalidates
  each row from a `ListItemAddedAction`, which covered `push()` and `insert()` and missed every other way a row is
  built.
- `MessagesWidget` renders a `componentName` directly only for the common HTML tag names; every other name,
  including an uncommon tag, is resolved as a globally registered component.

## [0.10.0] - 2026-08-17

### Added
- `field.declaration` names the element a field was declared as: itself for a field built from parameters, and the
  field it was cloned from for a clone, transitively. Every row a `List` builds from an item template is a clone,
  so `list.get(0).fields.a.declaration === template.fields.a`.
- `field.bindingsOf(declaration)` lists the elements of a subtree that were declared as the given one —
  `list.bindingsOf(template.fields.a)` is the `a` field of every row.
- `Statement.evaluate(scope?)` takes the element whose record the field operands are read in, so one statement
  serves every row of a `List`. Without an argument it reads the fields it was built from, as before.
- `CompareTo` accepts the field to compare against as a name or as a callback receiving the field being validated,
  next to the field itself. The exported type of the parameter is `Validators.CompareToTarget`.
- `FieldActionBase.state(key, init)` holds what an action remembers between runs against the element it ran over,
  or against the record that element belongs to. An action instance is shared by every clone of the element it was
  registered on, so what it keeps on itself is shared by every row; what it keeps here is not, and is released with
  the element.
- `field.markRecordIncomplete()` lets an eager action say that it looked for a second element of the record and the
  record was not assembled yet. The container that completes the record runs the element's eager actions again, and
  so does a container that takes the record in afterwards.

### Fixed
- Conditional actions work inside a `List`. Registered on the item template, a conditional action serves every row,
  each row holds a result of its own, and a change in one row reaches that row alone. Previously the rows shared a
  single result and a row built by the list never had the action bound at all, so the condition was silently dead.
- `CompareTo` compares within the row it is validating. It read the item template's field, so a row whose two
  fields matched was reported invalid and a row where they differed was reported valid — password/confirmation and
  date-from/date-to being the cases it exists for.
- `clearValidators()` on one element leaves the same validator instance validating every other element it was
  registered on. Dropping the validators of one row of a `List` silenced the validator in every row, so the form
  reported itself valid when it was not.
- A statement's fields are read once per record rather than once per row of listeners: one handler is registered on
  each field the statement reads, however many rows read it.
- A row that holds the very values its item template holds carries its own verdict. A cross-field rule is run again
  once the record is assembled, so a `List` row, an item the list builds to fill a gap, the group `remove()` hands
  back and a `clone()` all report what their own fields support instead of reporting themselves valid.
- A cross-field rule registered on a single row is that row's rule. A change of the field it compares against, or
  of a field its statement reads, no longer plants errors on the rows that never took the rule on — errors those
  rows had no validator to clear.
- Registering a validator again after `clearValidators()` re-arms it fully: it listens to the field it compares
  against again, where before it only re-validated on writes of the field's own value.
- A `CompareTo` naming a field the form above the list holds resolves it. A row reaches the form only once the list
  takes it in, which is now where the rule is run again.

### Changed
- **Breaking:** `CompareTo`'s first constructor parameter widens from `FieldBase` to
  `FieldBase | string | ((field: FieldBase) => FieldBase | null | undefined)`. Passing a field keeps working, and
  is now resolved within the record being validated rather than read as the one field it names.
- **Breaking:** the two optional hooks of `FieldActionBase` are renamed: `boundToField(field)` is
  `boundToBinding(binding)`, and it now runs for every element the action comes to serve rather than only for the
  one it was registered on; `unregister()` is `unregisterFrom(binding)`, which names the element the validator was
  dropped from. An action that overrode neither is unaffected.
- **Breaking:** a cross-field rule that was inert inside a `List` now applies, so a form holding one may report
  errors, hide fields or disable fields it did not before. The verdicts are the ones the data always called for.
- `ActionsMap.bindTo(owner)` tells every action in a map that it serves `owner`; cloning an element calls it, which
  is what makes an action registered on an item template serve every row.
- `Validator` keeps its per-field run sequence through `bindingState(field)`, and a subclass widens that record by
  overriding `newBindingState()`. The exported type is `ValidatorBindingState`.

## [0.9.0] - 2026-08-17

### Added
- `Action.busy` reports whether an execution of the action has yet to settle. `execute()` raises it as the chain
  is entered and clears it once the run has settled, whether it resolves or rejects; overlapping runs are counted,
  so it stands until the last of them settles. It is a form-state flag a button binds to in order to disable
  itself while a submit runs.

### Changed
- **Breaking:** `Action.execute(params?)` is asynchronous. It answers what the `ExecuteAction` chain returned,
  as a promise, where it previously discarded the result and answered `undefined`. The chain is still entered
  synchronously, so a handler has already run by the time the call returns, but a handler that throws now rejects
  the promise instead of throwing out of the `execute()` call - a caller that wrapped `execute()` in `try/catch`
  has to `await` it or attach a `.catch()`. A call that does neither leaves the rejection unhandled, which under
  node's default settings ends the process; a Vue template handler needs no change, because Vue attaches its own
  catch to the promise a handler returns. `params` is now optional.
- **Breaking:** writing `Action.label` or `Action.icon` assigns a new value object instead of writing into the
  one the action holds. Both are now ordinary value changes: `ValueChangedAction` fires, `isChanged` answers over
  them, and a disabled action refuses the write, where previously none of the three happened. A value object you
  passed as `params.value` and kept a reference to no longer follows the action once either setter has run;
  reading still sees your writes to that object until then. Writing the label or icon the action already holds
  changes nothing and announces nothing, and clearing one with `undefined` leaves the action reporting itself
  unchanged against a baseline that never carried it.

### Fixed
- `label` and `icon` are assignable on an action constructed without a value. `new Action({}).label = 'X'` threw
  a `TypeError`, because the action held the frozen `originalValue` baseline as its value.

## [0.8.0] - 2026-08-17

### Added
- `transaction(fn)` runs several writes as one atomic change. The events they produce are announced once, at the
  end, over the net result: two writes to two members of a group announce one `ValueChangedAction` on the group
  instead of two, and a value that goes `A` -> `B` -> `A` inside one transaction announces nothing at all. A
  nested call joins the transaction it found. The callback must be synchronous - `transaction()` throws a
  `TypeError` the moment it returns a thenable - so a transaction structurally cannot cross an `await`.
- A transaction can be undone. `tx.rollback()` unwinds it without an error and the call answers `undefined`, and
  **a throw out of the callback rolls back and rethrows**. A rollback puts back the whole of every element the
  transaction modified - `value`, `originalValue`, `touched`, `errors`, `enabled`, `visibility`, the validators a
  `clearValidators()` dropped, and a `List`'s rows, with the rows the transaction created dropped and the ones it
  removed re-adopted at their old positions - and announces nothing. An asynchronous validation started inside a
  transaction that was rolled back runs to the end and its verdict is discarded, so a field is never left invalid
  over a value the form never held. What a rollback cannot undo are side effects - a handler that called a server
  already did - and actions registered while it was open, which stay registered.
- The handle `transaction(fn)` hands its callback is usable only for the duration of that call. Calling
  `rollback()` on a handle kept beyond it throws a `TypeError` rather than unwinding whatever transaction happens
  to be open at the time.

### Changed
- **Breaking:** events are announced when the operation carrying them finishes rather than as it runs, and each
  is announced once. Every mutating operation is a transaction; where you open none, the operation is the
  transaction, so a single write still announces exactly one change. What moves is the timing and the count for
  everything else:
  - an operation that changed one element several times announces the net change, and announces nothing where
    the element ends where it started;
  - a handler is never shown a half-applied state. `insert()` past the end of a list pads the gap first and
    announces each addition over the set the operation ended on, where it used to announce each over the set that
    stood at the time;
  - the order within one operation is now the causal one: an element announces its value before the verdict
    formed over it, and the deepest element announces before the container above it. A field carrying a validator
    used to announce its new verdict *before* its new value.
- **Breaking:** a handler that throws no longer leaves a container half-applied. The operation rolls back and the
  throw propagates, so `group.value = {...}` whose members' handlers fail partway leaves the group exactly as it
  was, with its verdict and its value caches intact. `AbortEventHandlingException` is unchanged and still stops
  the chain without undoing anything.
- Validators run at the write that triggers them, which is inside the transaction, so a validator reading a
  sibling sees the sibling's working value. Their verdict is what the commit announces.
- **Breaking:** `ActionsMap.cloneWithoutValidators()` returns the copy without releasing the validators it left
  out; `unregister()` on each of them is now the caller's to make, and the new `ActionsMap.validators` lists
  them. `clearValidators()` on a field is unchanged for a caller: it still releases them, once the operation it
  ran in has finished rather than as it runs, so an operation that unwinds leaves the field's validators intact.
- Measured on 1000 rows of 8 fields, against 0.7.0: a whole-list assignment 18.8 ms to 24.3 ms, one field write
  0.0081 ms to 0.0097 ms, `remove()` and `push()`-filling within a few per cent. The added cost is the record a
  rollback restores from, taken once per element an operation modifies, plus the commit's own bookkeeping.

## [0.7.0] - 2026-08-17

### Changed
- **Breaking:** `watch(field, cb)` and `watch([field], cb)`, with a form element passed directly as the watch
  source, no longer fire. A form element is no longer a Vue proxy of itself - its mutable state is held in a
  reactive object beside it, and the element carries `__v_skip` - so the deep traversal Vue starts for a reactive
  source stops immediately and the watcher subscribes to nothing. Nothing is logged and nothing throws, so this
  is worth searching for: `watch(() => field.value, cb)` is the replacement, and every other read is unchanged.
  Templates, `computed`, `watchEffect` and a getter passed to `watch` all track field members exactly as before.
  `toRaw(field)` now returns the field itself. A write the value setter refuses - the same value, or any value
  on a disabled field - no longer re-runs the effects that read the value.
- **Breaking:** `readonly(element)` no longer protects anything, and fails as silently as the watch above. Vue's
  `readonly()` stops on `__v_skip` and hands the element straight back, so `readonly(field) === field`,
  `isReadonly()` on the result is `false`, and a write through it reaches the field. Hand out the value -
  `field.value` and `group.value` are frozen - or a `computed` over it.
- **Breaking:** an element's state is held in private class fields, so nothing outside the element reaches it.
  `parent` and `fieldName` are read-only accessors over that state instead of own properties - assigning either
  yourself throws a `TypeError` rather than being silently accepted. `Object.keys(element)`,
  `Object.getOwnPropertySymbols(element)`, `JSON.stringify(element)` and lodash `isEqual` see none of an
  element's state: a structure that contains its own descendants' back-references is walked by all four without
  climbing back up, and `isEqual` over two elements answers `true` for any two instances of the same class.
  Compare `a.value` with `b.value` instead.
- A `List` no longer walks itself to answer a change. Every mutation and every field edit anywhere inside a
  list used to rebuild the whole list's value, deep-compare it with the previous one and re-check the
  validity of every field of every row, so one `insert()` cost work proportional to the entire list and
  filling a list was quadratic in its length. `Group.value` and `List.value` are now cached behind a version
  that a write raises along its own branch, `valid` is read through a lazily built computed and maintained
  for events as a tally, and a mutation that nothing listens to no longer builds a value at all. Measured on
  1000 rows of 8 fields: filling by `push()` 13.1 s to 0.37 s, writing one field 33 ms to 0.017 ms, reading
  `list.valid` 11.3 ms to 0.0006 ms, `remove()` 27 ms to 0.75 ms. `list.value = rows` reuses the row objects
  positionally instead of rebuilding them, so a same-length assignment keeps each row's identity and a keyed
  `v-for` stops remounting every row. A reused row is reset to the state the row built for that position would
  have been in, down to `originalValue`, `isChanged`, `touched` and its errors, and the new set is installed
  whole, so a validator reading `list.value` during the assignment sees the whole list at every point.
- A `DisplayMode` lookup no longer rebuilds the enum's value list on every call, and a form element
  allocates its action map only when it has an action to hold.
- The object `Group.value` and `List.value` read back is frozen, rows included: the same object answers every
  read until the next change, and writing into it throws in strict mode. Assign a new value instead.
  `originalValue` holds a copy of its own, so it is never the object `value` reads back.
- A `List` releases the rows it drops - `remove()`, `pop()`, `clear()` and an assignment that shortens the list.
  A released row loses its `parent`, stops counting towards the list's validity and can be pushed into another
  list or back into the one that held it. A container still refuses an element that belongs to one, with a
  `TypeError`. `remove()` returns a clone of the row, as before.

## [0.6.1] - 2026-08-17

### Added
- `FieldBase.validationEpoch`, a read-only counter of the validator generations a field has been through.
  `clearValidators()` raises it, and a validator that reads it when a run starts can tell that the result it is
  about to apply belongs to validators the field no longer carries. Custom asynchronous validators can use it
  the same way the built-in `Validator` does.

### Fixed
- `ListItemAddedAction` reports the real index of every element `insert()` creates. The elements inserted as
  padding, to reach an index past the end of the list, were each announced with the index one past their own
  position, so `list.insert(item, 3)` on an empty list reported `1, 2, 3, 3` instead of `0, 1, 2, 3`.
- `Statement.evaluate()` returns a boolean for every operator. `AND`, `OR` and `XOR` returned the operand
  itself and `IN` returned whatever the container's `includes()` produced, so a conditional callback received
  e.g. the number `0` instead of `false`, and `ConditionalStatementAction` fired again when that operand
  changed to `false` - a non-transition. For these operators the truth values are unchanged.
- `NOT_IN` is the negation of `IN`. An `operand2` that carries no callable `includes` - `null`, `undefined`, a
  number, a plain object - made both operators report `false`, so a statement and its negation agreed. `IN` is
  `false` for such an operand and `NOT_IN` is `true`.
- One `ValidationError` instance may be reported by more than one validator. The second validator to receive it
  threw `TypeError: Cannot redefine property: source`. Each validator now holds an error of its own - the
  instance itself, or a copy that keeps its prototype and every property and therefore renders identically -
  and withdraws only that one, in whatever order the fields are cleared. Two validators on the same field that
  both report one instance consequently leave two errors on it, as two equal instances always have.
- A `Group` constructed with parameters that carry no `value` keeps the values its member fields were built
  with. `new Group({ a: new Field({ value: 1 }) }, { visibility: DisplayMode.HIDDEN })` cleared every member
  to `null`; it is now `{ a: 1 }`, and `isChanged` is `false`. A `value` of `undefined` counts as no value, so
  spreading an optional property empties nothing; `{ value: null }` is a value the caller means and does clear
  the members, and `originalValue` alone still seeds the value.
- `new Field({ value: null })` keeps the `null`. An explicitly null value fell back to `originalValue`; only an
  absent or `undefined` one does now.
- `clone()` takes a value override only from a value the caller supplied. `clone({ value: null })` clones with
  the `null` instead of falling back to the value of the field it was cloned from, so
  `group.clone({ value: null })` clears the clone's members and a `List` cloned that way comes out empty. A
  `value` of `undefined` is not a value the caller supplied and behaves like an absent key: `field.clone()`,
  `field.clone({})` and `field.clone({ value: undefined })` all keep the current value, so spreading an
  optional property blanks nothing. `originalValue` is still read by the presence of its key.
- A child that turns invalid without its value changing propagates its validity to the enclosing `Group` or
  `List`, so `ValidChangedAction` fires there and the container's `valid` follows. The climb stops at the
  first ancestor whose own validity does not change.
- A `Group` and a `List` announce at most the net validity transition per operation, never a verdict over a
  state they held only halfway through one. Assigning `{ a: 'x', b: '' }` to a group whose `a` was empty and
  `b` filled fired `ValidChangedAction` twice, `true` and then `false`; so did assigning to a single member of
  a group that carries a validator of its own, assigning a whole list, and `validate(true)` on either
  container - each of which walks the members one at a time. The container now forms its verdict once, over
  the finished state: one event when the operation flips its validity, none when it leaves it where it found
  it, and the same at every level of nesting. Each member still announces its own transition.
- `Group.value = null` clears a nested `List`. A `List` ignored an assignment that was not an array, so a list
  nested in a group kept its rows while every sibling field was emptied, and `group.clone({ value: null })`
  cloned it with its rows intact.
- `ValueChangedAction` carries the real previous value. The first change of a `Group` member, and every
  change of a `List` after an assignment, reported `null` as the previous value.
- Asynchronous validators are sequenced per field. A verdict from a run that a newer run has superseded is
  discarded instead of overwriting the newer one, and a rejected validation promise no longer surfaces as an
  unhandled rejection: if its run is still the current one, the validator replaces its own errors on the
  field with a single `Validation could not be completed` error and reports the reason once as
  `console.error('Validation failed', reason)`; if it has been superseded it is dropped silently, with
  nothing logged. A validator that cannot reach its server therefore produces a failed validation and not a
  passing one, so a value that was never checked cannot be submitted. The failure error is an ordinary error
  of that validator: the next successful run of the same validator withdraws it. `field.validating` returns
  to `false` in every case.
- `clearValidators()` cancels validation that is still in flight. A result arriving from a cleared validator
  is dropped, leaving the field with no errors, `valid === true` and `validating === false`.
- `clearValidators()` announces the validity it produces. It set `valid` silently, so no `ValidChangedAction`
  fired and an enclosing `Group` or `List` went on reporting itself invalid over a field that no longer had a
  validator. The transition now takes the ordinary path: the event fires on the field when the verdict changes,
  nothing is announced when it does not, and the containers above re-evaluate.
- Eager actions passed to a `Field`, `Group`, `List` or `Action` constructor - validators among them - run
  exactly once during construction, over the constructed value. Each registration ran them once more, over
  whatever the element held at that moment: `undefined` on a `Field` or an `Action`, `null` on a `List`, so a
  validator reading the value had to guard against a value the element never held.
- A validator message given as a `Ref` or a `computed` keeps its reactivity: it is unwrapped where it is read,
  so a change to the ref changes the rendered message. A ref holding an `MdString` still renders as markdown,
  with its `options` and `plugins`.
- The CJS/UMD artifact requires `lodash` instead of the ESM-only `lodash-es`, so `require()` of the package
  resolves on every supported Node version and under Jest. The ES artifact still imports `lodash-es`.
- The `repository` and `bugs` URLs point at the current location, `https://github.com/dynamicforms/vue-forms`.

### Changed
- `List.insert()` resolves a negative index before it reports one. The number it returns, and the index it
  announces with `ListItemAddedAction`, are the position the item occupies rather than the argument as given:
  on a two-element list `insert(item, -1)` reports `1` and `insert(item, -99)` reports `0`, where both used to
  report the argument back. Where the item lands is unchanged - the argument has always reached `splice`,
  which counts back from the end and stops at the start - so a caller who ignores both the return value and
  the event payload sees the same list.
- A `Group` constructor no longer fires `ValueChangedAction` for the value it is given. `new Group(fields,
  { value, actions: [new ValueChangedAction(fn)] })` called `fn` once during construction, with `null` as the
  old value, because the members were filled in through the public setter; they are now filled in directly and
  the cache is primed from the result. A handler that relied on that call to see the initial value should read
  `group.value` after construction instead.
- The UMD build exposes the global `DynamicFormsVueForms`, with `vue` read as `Vue` and lodash as `_`.
- `lodash` and `lodash-es` are declared as `dependencies`, so they install with the package. `vue` is the only
  peer dependency.
- `engines.node` declares `>= 18`.
- `prepack` builds the package, so `npm pack` and `npm publish` cannot produce a tarball whose `dist` predates
  the sources it was cut from.
- `package-lock.json` is tracked in the repository, so a checkout resolves the dependency tree the release was
  built and tested against and CI can install with `npm ci`.

### Documentation
- The API reference describes what this release settles: the order in which a constructor applies its
  parameters and the single eager run that closes it, `validationEpoch`, the reach of `clearValidators()`, the
  value rule of `clone()`, the boolean result of `Statement.evaluate()` and `IN`/`NOT_IN` over an operand
  without `includes`, the resolved index `insert()` returns and announces, and when `ValidChangedAction` fires
  on a container. The readme documents the two build flavours and their lodash packaging, the Node
  requirement, and asynchronous validation.
- The GitHub links in the readme, on the documentation home page and in the site's social links point at
  `https://github.com/dynamicforms/vue-forms`.

## [0.6.0] - 2026-08-15

### Removed (breaking)
- `Field.create()` and `Action.create()`. Fields are constructed with `new`, the way groups and lists always were:
  `new Field({ value: 1 })`, `new Action({ value: { label: 'Save' } })`. The constructor guard that used to make
  `new Field()` throw is gone as well. Type inference is unchanged - `new Field({ value: 'a' })` is `Field<string>`.
- The `reactiveValue` member on `Field`, `Group` and `List`. Every field is now a Vue reactive object from
  construction on, so `field.value` is itself reactive and needs no computed wrapper. Replace
  `const out = form.reactiveValue` plus `{{ out }}` with `{{ form.value }}`.
- The `IField` and `IFieldAction` interfaces. Use the classes `FieldBase` (or `FieldBase<T>`) and
  `FieldActionBase` instead. The interfaces duplicated the class surface and promised a structural
  implementability the runtime never allowed: `Group` rejects a field that is not `instanceof FieldBase`, and
  `ActionsMap` rejects an action that is not `instanceof FieldActionBase`.

### Changed (breaking)
- `IFieldConstructorParams` now lists only the writable members - `value`, `originalValue`, `enabled`,
  `visibility`, `touched`, `errors`, plus `actions` and `validators`. Passing a derived member such as
  `new Field({ value: 1, valid: true })` used to type-check and then throw at runtime; it is now a type error.
- `IFieldConstructorActionsList` lost its type parameter and its members are typed `FieldActionBase[]`.
- A `Field` subclass applies its parameters from the constructor, so the protected `init(params)` hook runs
  before the subclass's own class field initializers - the factory used to run it after the instance was fully
  constructed. An initializer now overwrites what `init` assigned to the same member, and `init` reads such a
  member as `undefined`. Move that state into the `init` override.
- `field.validating` is a getter over the number of validators still running, so it is read-only. Asynchronous
  validators bracket their work with the new `beginValidating()` / `endValidating()` methods. It is typed
  `boolean` rather than the literal `false`, so `if (field.validating === true)` no longer reports TS2367.
- `Group.value` and `List.value` carry their real value types: for `Group<{ name: Field<string> }>`,
  `group.value` is `{ name: string } | null` where it used to collapse to `any`, and `List.value` is
  `ListValue`. `Group.value`'s setter accepts a partial value structure, which is what it has always done at
  runtime.

### Added
- `FieldBase.beginValidating()` and `FieldBase.endValidating()`, the pair an asynchronous validator brackets its
  work with to report that it is running.
- The value types `FieldsToValues`, `GroupValue`, `GroupValueInput` and `ListValue` are exported.

### Fixed
- `Group` and `List` are reactive from construction, as `Field` and `Action` already were. `Group.errors` - which
  is where a group-level validator writes - `Group.visibility`, `Group.enabled`, group-level `Group.valid`, and
  the structural changes made by `List.push()`, `insert()`, `remove()`, `pop()` and `clear()` now trigger a Vue
  re-render. They were plain properties on a plain object, so a group-level validation message, a
  `ConditionalVisibilityAction` on a group and a `v-for` over a list never repainted.
- `List.clone()` on an empty list. It spread `value`, which is `null` while the list holds no rows, so both
  `new List(template).clone()` and cloning a `Group` that holds an empty list threw a `TypeError`.
- A `Group` field may be named after an `Object.prototype` member, `__proto__` included.
  `new Group({ toString: new Field() })` used to throw "Field toString is already in this form", and a field
  named `__proto__` - which `JSON.parse` does produce - was dropped from `fields` and from `value`. The group's
  own value setter reads only own keys of the object it is given, so a field named after a prototype member is
  no longer assigned that member's value.
- `Action.label` and `Action.icon` are settable on an action constructed without a value, such as
  `new Action({ actions: [new ExecuteAction(...)] })`. Its value object was the frozen baseline used for
  `originalValue`, so assigning either threw "Cannot assign to read only property".
- Add `types` conditions to package `exports`, so consumers using `moduleResolution: bundler`, `node16` or
  `nodenext` resolve the library's types instead of falling back to `any` (TS7016). A separate `index.d.cts` is
  emitted for the `require` branch.
- Expose the stylesheet as `@dynamicforms/vue-forms/style.css` - it was shipped in `dist` but unreachable
  through `exports`. Documented in the getting started guide and the `MessagesWidget` reference.

### Changed
- Set `rootDir` explicitly in `tsconfig.build.json` and verify declaration output size in CI. TS 6.0 stops
  inferring it, and without it the rolled up `index.d.ts` comes out empty with a green build.

### Documentation
- Audited the whole of `docs/` against the source. Corrected statements that no longer matched the code
  (`enabled` cascading, `Statement` reactivity, the `EnabledChangingAction` return value, list defaults and
  every built-in validator's default message), and documented previously undocumented public API: `Action`,
  `FieldBase`, `AbortEventHandlingException`, `buildErrorMessage`, `EmptyField`, `RenderableValue` and the
  `Nullable*` type aliases.
- Removed passages that narrated the library's own history - a superseded claim left standing next to its
  correction, reassurances about doubts the reader never had, and leftovers of a mechanical API rename.

## [0.5.0] - 2026-01-28
- Remove default class from MessagesWidget

## [0.4.7] - 2025-10-29

### Added
- Support functions for `RenderContent` to support dynamically retrieving text and allow for translations.

## [0.4.6] - 2025-09-24

### Added
- Add plugins and options to MdString supporting markdown-it extensibility

## [0.4.5] - 2025-09-19

### Added
- Add field touched property to indicate when user had at least visited a field

## [0.4.4] - 2025-09-08

### Added
- Add revalidate parameter to field validate method forcing revalidation

## [0.4.2,0.4.3] - 2025-09-06

### Added
- add classes to ValidationError (and descendants)
- add messages-widget

## [0.4.0] - 2025-09-02

### Changed - breaking changes
- renamed in error-message-builder: CustomModalContentComponentDef → SimpleComponentDef 

### Added
- Alias for ValidationErrorRenderContent: RenderableValue (it's not only usable for errors)
- Support for v-html content in RenderableValue

## [0.3.5] - 2025-06-03

### Added
- Support type generics on group.value / group.reactiveValue

## [0.3.3 - 0.3.4] - 2025-05-30

### Added
- **Extending classes**: Support for extending the vue-forms classes, particularly the Action class

## [0.3.0] - 2025-05-19

### Removed
- Removed all async versions of functions due to implementation complexity

### Added
- **Async Validator Support**: Re-introduced async validation with loading states
- **Improved Reactivity**: Enhanced reactivity for Field and Action components
- Simplified validator architecture for better maintainability

### Fixed
- Better reactive behaviour for field state management

## [0.2.6] - 2025-05-19

### Added
- **Field.clearValidators()**: Method to dynamically clear all validators from a field

## [0.2.5] - 2025-05-17

### Added
- **CompareTo Validator**: Cross-field validation for comparing values between fields

## [0.2.4] - 2025-04-19

### Fixed
- Updated repository URL in package configuration

### Added (dev helpers)
- Package visualizer for bundle analysis
- Enhanced IDE configuration for Vite

## [0.2.3] - 2025-04-18

### Fixed
- Fixed undefined value comparisons in MinValue/MaxValue/ValueInRange validators
- Fixed ValidationErrorRenderContent reactivity issues
- Improved documentation static build process

## [0.2.2] - 2025-04-17

### Added
- **Validator System**: Built-in validators
    - Required, Pattern, MinValue/MaxValue/ValueInRange validators
    - MinLength/MaxLength/LengthInRange validators for text/array validation
    - InAllowedValues validator for restricted value sets
- **Async Operations**: Support for asynchronous field operations and validation
- **Eager Actions**: Actions that execute immediately on registration and value changes
- **Enhanced Action System**:
    - Refactored classIdentifier system for better performance
    - Added boundToField method for action-field relationship tracking
- **Conditional Logic**: Complete implementation of conditional form behavior
    - Statement and Operator system for complex conditions
    - ConditionalVisibilityAction, ConditionalEnabledAction, ConditionalValueAction
- **Extensive Testing**: Comprehensive unit test coverage for all validators
- **Documentation Examples**: Interactive demos for validators and conditional statements
- **Markdown Support**: Configurable markdown rendering in validation error messages

### Improved
- Enhanced type safety in Group field methods
- Fixed circular import issues

## [0.1.5] - 2025-03-21

### Added
- Export of FieldBase class to allow extending

## [0.1.4] - 2025-03-19

### Fixed
- DisplayMode export issues in type declarations

## [0.1.3] - 2025-03-19

### Improved
- **Type Declarations**: Enhanced TypeScript support without requiring Reactive<> wrappers
- Simplified type usage for end users

## [0.1.2] - 2025-03-19

### Added
- **Forced Reactivity**: Field and Action instances are now automatically reactive
- **reactiveValue Property**: Available on all field types for computed value access
- **Enhanced Exports**: Better export organization with default namespace and individual imports

### Improved
- Reorganized module exports for better developer experience
- Enhanced reactivity system across all components

## [0.1.1] - 2025-03-12

### Changed
- **Dependencies**: Migrated from lodash to lodash-es for better tree shaking

## [0.1.0] - 2025-03-06

### Added
- **Core Architecture**: FieldBase abstraction with Field, Group, List, and Action implementations
- **Reactive State Management**: Built on Vue's reactivity system
- **Event System**: Action-driven architecture with event chains
- **Validation Framework**: Error tracking and validation state management
- **Display Modes**: SUPPRESS, HIDDEN, INVISIBLE, and FULL visibility control
- **Form Relationships**: Parent-child relationships with value change propagation
- **Development Setup**: Vite build system, Vitest testing, ESLint configuration
- **TypeScript Support**: Full generic type support for Field components
- **Documentation**: Complete VitePress documentation site with interactive examples
