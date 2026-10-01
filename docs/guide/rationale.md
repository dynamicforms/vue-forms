# Rationale

Headless form libraries are not scarce. What varies between them is how much of a form's *behaviour* they model,
as opposed to just its state.

`@dynamicforms/vue-forms` treats behaviour between fields as part of the form definition rather than as wiring you
add in your components. A field's visibility, enablement or value can be declared as a condition over other fields.
Every change travels through an action pipeline in which each handler receives the previous one and decides whether
to call it, transform its result, or abort the event outright. Groups and lists compose recursively, so a nested
section or a list row behaves the same way a single field does — and rendering stays entirely yours.

## Design Goals

- **UI-Agnostic**: A logic layer for form state, validation and dynamic behaviour. Works with native HTML controls, Vuetify, Tailwind, or any custom components. The only component the library ships is the optional `MessagesWidget` for rendering validation errors. The few members that speak about the interface are listed in [What the library carries for the interface](#what-the-library-carries-for-the-interface), each with the reason it is there.
- **Fields that react to each other**: Conditional visibility, enablement and values are declared as statements over other fields, and the action pipeline lets a handler intercept, transform or abort an event.
- **Reactive & Type-Safe**: Every member of a field, group or list is a tracked read — assign a property and whatever read it re-renders, with no `ref` to unwrap. A group's value type is inferred from the fields it holds, nested structures included.
- **Structural serialization**: A group's value is the shape of its fields, and `Group.createFromFormData()` turns a plain object back into a form.
- **Application state, not only forms**: A form is state that happens to be shown. The same elements hold state no screen shows — a shopping cart, the filters of a list view, the settings of an editor — with everything a form gets: reads tracked per element, changes made in transactions and announced once, validity and validators, rules for what is sent, and actions that react to a change. [`view()`](/api/view) reads such state as plain data, and the cookbook's
  [Application state](/guide/cookbook#application-state) recipe keeps a shopping cart that way.

## What the library carries for the interface

The library describes data and behaviour, and rendering is the application's. A handful of members say something
about the interface all the same. Each is something nearly every form needs and that a rule of the form decides —
leaving it out would push it into every application, written again beside each form and out of reach of the rules
that should drive it. None of them renders anything: each states something a rendering layer reads.

| Member | What it states | Why it is in the library |
|---|---|---|
| [`visibility`](/api/field#visibility) | how an element is drawn: `'full'`, `'invisible'`, `'hidden'`, `'suppress'` | showing and hiding a field is the commonest rule a form has, and [`ConditionalVisibilityAction`](/api/actions#conditionalvisibilityaction-statement-whentrue-whenfalse) declares it with the form rather than in a template. It is presentation alone and changes nothing about what is sent or validated |
| [`enabled`, `effectiveEnabled`](/api/field#properties) | whether an element accepts input, on its own and with the containers above it | read from [`access`](/api/field#access), which decides what is sent; the input half follows from it the way it does for an HTML `<input readonly>` or `<input disabled>`, so the two cannot disagree |
| [`touched`](/api/field#properties) | whether the user has interacted with an element | the condition under which a form shows its errors; the library never sets it, the rendering layer does |
| validation errors as render content | a message as text, markdown or a component | an error is shown to a user, so what it carries is how it is shown; the optional `MessagesWidget` renders it, and nothing else depends on it |
| [`Action`](/examples/action#why-action-is-not-ui-agnostic) | a label and an icon | the element a form's submit and cancel hang on; the pair is what makes it a concept rather than a `Field`, and a UI library widens it |

Everything else a rendering layer needs — a label, a hint, a width, a component to render with — goes in an
element's [extended properties](/api/field#extended-properties). The library carries them and does not read them,
which is what lets one form definition serve more than one rendering layer.

## What this library will not do

**Ship more than one build.** The package resolves to a single ESM build; there is no CommonJS or UMD artifact.
The library establishes an element's identity through `instanceof` and module-level `Symbol()` values, and a
program that loads two copies of the module graph — an ESM build alongside a CJS one — holds two of every class
and two of every symbol, so a `Field` built by one half fails `instanceof` in the other. Shipping one build removes
the possibility rather than asking a consumer's bundler to avoid it. A CommonJS consumer reaches the package
through `require()` of an ES module, which Node supports from 20.19 and 22.12 onward.
