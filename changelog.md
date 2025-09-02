# Changelog

All notable changes to `@dynamicforms/vue-forms` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

- Extendable field properties
- Increase coverage to 95% (from >92% currently))

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
