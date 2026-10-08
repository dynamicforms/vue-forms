# Rationale

Headless form libraries differ in how much of a form's *behaviour* they model in addition to its state.

`@dynamicforms/vue-forms` makes behaviour between fields part of the form definition; it is not wiring added in
components. A field's visibility, enablement or value can be declared as a condition over other fields. Every
change passes through an action pipeline in which each handler receives the previous one and decides whether to
call it, transform its result, or abort the event. Groups and lists compose recursively, so a nested section or a
list row behaves the same way as a single field. Rendering is left to the application.

## Design Goals

- **UI-Agnostic**: A logic layer for form state, validation and dynamic behaviour. Works with native HTML controls, Vuetify, Tailwind, or any custom components. The library ships no components. The few members that relate to the interface are listed in [What the library carries for the interface](#what-the-library-carries-for-the-interface), each with the reason it exists.
- **Fields that react to each other**: Conditional visibility, enablement and values are declared as statements over other fields, and the action pipeline lets a handler intercept, transform or abort an event.
- **Reactive & Type-Safe**: Every member of a field, group or list is a tracked read: assigning a property re-renders whatever read it, with no `ref` to unwrap. A group's value type is inferred from the fields it holds, nested structures included.
- **Structural serialization**: A group's value has the shape of its fields, and `Group.createFromFormData()` builds a form from a plain object.
- **Application state, not only forms**: The same elements hold state that no screen displays, such as a shopping cart, the filters of a list view or the settings of an editor, with the same features a form has: per-element tracked reads, changes made in transactions and announced once, validity and validators, rules for what is sent, and actions that react to a change. [`view()`](/api/view) reads such state as plain data, and the cookbook's
  [Application state](/guide/cookbook#application-state) recipe implements a shopping cart this way.

## What the library carries for the interface

The library describes data and behaviour; rendering belongs to the application. A few members relate to the
interface. Each is something nearly every form needs and that a form rule controls; without it, every application
would implement it separately, outside the reach of the form's rules. None of them renders anything: each is a
value a rendering layer reads.

| Member | What it holds | Why it is in the library |
|---|---|---|
| [`visibility`](/api/field#visibility) | how an element is drawn: `'full'`, `'invisible'`, `'hidden'`, `'suppress'` | showing and hiding a field is the most common rule in a form, and [`ConditionalVisibilityAction`](/api/actions#conditionalvisibilityaction-statement-whentrue-whenfalse) declares it in the form instead of in a template. It is presentation only and does not affect what is sent or validated |
| [`enabled`, `effectiveEnabled`](/api/field#properties) | whether an element accepts input, on its own and including the containers above it | derived from [`access`](/api/field#access), which determines what is sent; input acceptance follows from it as it does for an HTML `<input readonly>` or `<input disabled>`, so the two are always consistent |
| [`touched`](/api/field#properties) | whether the user has interacted with an element | the condition under which a form shows its errors; the rendering layer sets it, the library never does |
| [`Action`](/examples/action#why-action-is-not-ui-agnostic) | a label and an icon | the element a form's submit and cancel are attached to; the label/icon pair distinguishes it from a `Field`, and a UI library extends it |

Any other data a rendering layer needs (a label, a hint, a width, a component to render with) goes in an element's
[extended properties](/api/field#extended-properties). The library stores them and does not read them, so one form
definition can serve more than one rendering layer.

## What this library will not do

**Ship more than one build.** The package resolves to a single ESM build; there is no CommonJS or UMD build.
The library identifies elements through `instanceof` and module-level `Symbol()` values. A program that loads two
copies of the module graph (an ESM build and a CJS build) has two of every class and two of every symbol, so a
`Field` built by one copy fails `instanceof` in the other. A single build excludes this case. A CommonJS consumer
loads the package through `require()` of an ES module, which Node supports from 20.19 and 22.12 onward.
