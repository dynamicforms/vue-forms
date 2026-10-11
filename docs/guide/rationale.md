# Rationale

`@dynamicforms/vue-forms` has two purposes: it holds a form's data together with the behaviour between its fields,
and it holds application state that no screen displays, with the same elements and the same features. Rendering is
left to the application.

Behaviour between fields is part of the form definition, not wiring added in components. A field's visibility,
enablement or value can be declared as a condition over other fields. Every change passes through an action pipeline
in which each handler receives the previous one and decides whether to call it, transform its result, or abort the
event. Groups and lists compose recursively, so a nested section or a list row behaves the same way as a single
field.

## Design Goals

- **UI-Agnostic**: A logic layer for form state, validation and dynamic behaviour. Works with native HTML controls, Vuetify, Tailwind, or any custom components. The library ships no components. The few members that relate to the interface are listed in [What the library carries for the interface](#what-the-library-carries-for-the-interface), each with the reason it exists.
- **Fields that react to each other**: Conditional visibility, enablement and values are declared as statements over other fields, and the action pipeline lets a handler intercept, transform or abort an event.
- **Reactive & Type-Safe**: Every member of a field, group or list is a tracked read: assigning a property re-renders whatever read it. A group's value type is inferred from the fields it holds, nested structures included.
- **Structural serialization**: A group's value has the shape of its fields, and `Group.createFromFormData()` builds a form from a plain object.
- **Application state, not only forms**: The same elements hold state that no screen displays, such as a shopping cart, the filters of a list view or the settings of an editor, with the same features a form has: per-element tracked reads, changes made in transactions and announced once, validity and validators, rules for what is sent, and actions that react to a change. [`view()`](/api/view) reads such state as plain data, and the cookbook's
  [Application state](/guide/cookbook#application-state) recipe implements a shopping cart this way.

## When to use it

The library fits state that carries rules: values that are validated, fields whose visibility, access or value
follow other fields, edits that are applied as one operation or reverted, and list rows that each have their own
validity. This applies to a form and to application state alike.

### Compared with form libraries

Form libraries such as vee-validate and FormKit validate fields and track whether a field was touched or changed, as
this library does. FormKit ships input components and a schema format for building forms; vee-validate accepts
schemas from validation libraries such as Zod and Yup. This library ships neither: inputs come from the application
or from a UI layer such as [`@dynamicforms/vuetify-inputs`](https://docs.velis.si/dynamicforms/vuetify-inputs/), and
rules are [`Validator`](/api/validators) instances.

This library has in addition:

- **transactions**: several writes are one operation, announced once, and reverted as a whole by a throw or by
  [`tx.rollback()`](/api/transactions#rollback)
- **rules between fields**, declared on the form: visibility, access and value as
  [conditional actions](/api/actions#conditional-actions) over other fields, and `CompareTo` comparing two fields of
  the same list row
- **refusing a write**: a *Changing* action may alter or refuse a value before it is applied
- **per-element access and visibility**: [`access`](/api/field-base#access) determines what a container sends and
  what is validated; `visibility` determines how an element is drawn

### Compared with Pinia

Pinia holds application state in stores. It has a devtools timeline of mutations and actions, plugins that observe
every action of every store, `storeToRefs()` for destructuring a store into refs, and less memory per value: a
`reactive()` object of three values takes about 0.5 KB, a `Group` of three fields about 6 KB
([Memory per element](/guide/bindings#memory-per-element)). The [devtools](/api/devtools) of this library have an
inspector and no timeline, and its [plugins](/api/plugins) observe writes to elements.

Pinia has no validation, no transactions with rollback, no rules between values, no refusal of a write and no
per-value access or visibility. State that needs none of these fits a Pinia store or a `reactive()` object; state
that needs them fits elements of this library.

## What the library carries for the interface

The library describes data and behaviour; rendering belongs to the application. A few members relate to the
interface. Each is something nearly every form needs and that a form rule controls; without it, every application
would implement it separately, outside the reach of the form's rules. None of them renders anything: each is a
value a rendering layer reads.

| Member | What it holds | Why it is in the library |
|---|---|---|
| [`visibility`](/api/field-base#visibility) | how an element is drawn: `'full'`, `'invisible'`, `'hidden'`, `'suppress'` | showing and hiding a field is the most common rule in a form, and [`ConditionalVisibilityAction`](/api/actions#conditionalvisibilityaction-statement-whentrue-whenfalse) declares it in the form instead of in a template. It is presentation only and does not affect what is sent or validated |
| [`enabled`, `effectiveEnabled`](/api/field-base#prop-enabled) | whether an element accepts input, on its own and including the containers above it | derived from [`access`](/api/field-base#access), which determines what is sent; input acceptance follows from it as it does for an HTML `<input readonly>` or `<input disabled>`, so the two are always consistent |
| [`touched`](/api/field-base#prop-touched) | whether the user has interacted with an element | the condition under which a form shows its errors; the rendering layer sets it, the library never does |
| [`Action`](/examples/action#what-action-carries-for-the-interface) | a label, an icon, and whether it confirms or rejects the form | the element a form's submit and cancel are attached to; the label/icon pair distinguishes it from a `Field`, and a UI library extends it |

Any other data a rendering layer needs (a label, a hint, a width, a component to render with) goes in an element's
[extended properties](/api/field-base#extended-properties). The library stores them and does not read them, so one form
definition can serve more than one rendering layer.

## One build

The package resolves to a single ESM build; there is no CommonJS or UMD build. The library identifies elements
through `instanceof` and module-level `Symbol()` values. A program that loads two copies of the module graph (an ESM
build and a CJS build) has two of every class and two of every symbol, so a `Field` built by one copy fails
`instanceof` in the other. A CommonJS consumer loads the package through `require()` of an ES module, which Node
supports without a flag from 22.12; on 22.0–22.11 it needs `--experimental-require-module`.
