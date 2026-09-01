# Rationale

Headless form libraries are not scarce. What varies between them is how much of a form's *behaviour* they model,
as opposed to just its state.

`@dynamicforms/vue-forms` treats behaviour between fields as part of the form definition rather than as wiring you
add in your components. A field's visibility, enablement or value can be declared as a condition over other fields.
Every change travels through an action pipeline in which each handler receives the previous one and decides whether
to call it, transform its result, or abort the event outright. Groups and lists compose recursively, so a nested
section or a list row behaves the same way a single field does — and rendering stays entirely yours.

## Design Goals

- **UI-Agnostic**: A logic layer for form state, validation and dynamic behaviour. Works with native HTML controls, Vuetify, Tailwind, or any custom components. The only component the library ships is the optional `MessagesWidget` for rendering validation errors, and the one deliberate exception is [`Action`](/examples/action#why-action-is-not-ui-agnostic), whose value is a label and an icon.
- **Fields that react to each other**: Conditional visibility, enablement and values are declared as statements over other fields, and the action pipeline lets a handler intercept, transform or abort an event.
- **Reactive & Type-Safe**: Every member of a field, group or list is a tracked read — assign a property and whatever read it re-renders, with no `ref` to unwrap. A group's value type is inferred from the fields it holds, nested structures included.
- **Structural serialization**: A group's value is the shape of its fields, and `Group.createFromFormData()` turns a plain object back into a form.

## What this library will not do

**Ship more than one build.** The package resolves to a single ESM build; there is no CommonJS or UMD artifact.
The library establishes an element's identity through `instanceof` and module-level `Symbol()` values, and a
program that loads two copies of the module graph — an ESM build alongside a CJS one — holds two of every class
and two of every symbol, so a `Field` built by one half fails `instanceof` in the other. Shipping one build removes
the possibility rather than asking a consumer's bundler to avoid it. A CommonJS consumer reaches the package
through `require()` of an ES module, which Node supports from 20.19 and 22.12 onward.
