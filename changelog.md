# Changelog

All notable changes to `@dynamicforms/vue-forms` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
