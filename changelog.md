# Changelog

All notable changes to `@dynamicforms/vue-forms` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

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
