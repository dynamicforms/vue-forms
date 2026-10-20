# @dynamicforms/vue-forms

A reactive library for Vue.js that holds forms and application state without dictating your UI components:
validation, rules between fields, transactions and lists.

## Introduction

`@dynamicforms/vue-forms` manages form data, validation and state; rendering is left to the application. The same
elements also hold application state that no screen displays, such as a shopping cart or the filters of a list view.

In addition to state, the library models the behaviour *between* fields. Visibility, enablement and values can be
declared as conditions over other fields, and every change passes through an action pipeline in which each handler
decides whether to pass the event on and may modify its result. Groups and lists compose recursively, so the same
mechanism applies at every level of a nested form.

### Design Goals

- **UI-Agnostic**: a logic layer for state, validation and dynamic behaviour, rendered by any Vue components,
  including your own. The few members that relate to the interface are listed in
  [Rationale](https://docs.velis.si/dynamicforms/vue-forms/guide/rationale#what-the-library-carries-for-the-interface).
- **Fields that react to each other**: the behaviour between fields is part of the form definition, not wiring in
  components.
- **Reactive & Type-Safe**: every member is a tracked read, and the types follow the declared structure.
- **Structural serialization**: a group's value has the shape of its fields.
- **Application state, not only forms**: the same elements hold state that no screen displays, such as a shopping
  cart, the filters of a list view or the settings of an editor, with the same features a form has.

## Features

- **Transactional**: every mutating operation is atomic. Events are announced once, over the net change, and a
  handler that throws leaves the form unchanged. `transaction()` makes several writes one operation, and
  `tx.rollback()` reverts one without throwing
- **Validation**: built-in validators, custom synchronous and asynchronous rules, cross-field comparisons, and
  errors that contain a `code` and render as text, markdown or a component of your own
- **Conditional logic**: visibility, enablement and values declared as statements over other fields
- **Event system**: every change passes through an action pipeline; a handler may pass it on, modify it or stop it
- **Access**: `'editable'`, `'readonly'`, `'disabled'` and `'disabled-null'` determine whether an element accepts
  input and what it sends in its form's value (its own value, `null`, or nothing); validation applies to what is
  sent. `visibility` determines how it is drawn
- **Application state**: a cart, the filters of a list view or editor settings built from the same elements, with
  per-element tracked reads, transactions, validation and rules for what is sent
- **Plain-data views**: `view(group)` reads an element as plain properties (`form.address.city`,
  `v-model="form.name"`), with the element itself as `form.$`
- **Lists that scale**: a `List` is designed to hold thousands of rows. Writing one field of one row costs that row
  and the depth of its nesting, a `push()` costs one row, and reading `value` or `valid` again with no change in
  between costs nothing
- **Declared once, bound per record**: a list's item template is declared once; one validator instance and one
  conditional rule serve every row, and each row has its own result
- **Nested structures**: fields, groups and lists compose recursively, at every level
- **Extended properties**: a field holds the data your UI renders it with (a label, a hint, a width), declared as a
  second type argument, checked by the compiler and read through `extra`
- **Serialization**: `Group.createFromFormData()` builds a form from a plain object
- **TypeScript support**: full type definitions, and a group's value type inferred from the fields it holds,
  nested structures included

## Installation

```bash
npm install @dynamicforms/vue-forms
```

The package is ESM-only and requires Node 22 or newer. A CommonJS consumer reaches it through `require()` of an ES
module, which Node supports without a flag from 22.12; on 22.0–22.11 it needs `--experimental-require-module`. Type
definitions ship with the build. The package ships no components and no styles.

## Basic Usage Example

Creating and using a form with fields and groups:

```typescript
import { Field, Group } from '@dynamicforms/vue-forms';

// Create a form with fields
const personForm = new Group({
  firstName: new Field({ value: 'John' }),
  lastName: new Field({ value: 'Doe' }),
  age: new Field({ value: 30 }),
  active: new Field({ value: true })
});

// Access values
console.log(personForm.value);  // { firstName: 'John', lastName: 'Doe', age: 30, active: true }

// Update a field
personForm.fields.firstName.value = 'Jane';

// Disable a field
personForm.fields.age.access = 'disabled';

// The form leaves a disabled field out of what it sends
console.log(personForm.value);  // { firstName: 'Jane', lastName: 'Doe', active: true }
```

Every element is created with its constructor: `new Field({ ... })`, `new Action({ ... })`, `new Group({ ... })`,
`new List(template)`. Every read through it is tracked, so reading `field.value` in a template tracks it and
`field.value = x` re-renders. The element itself is not a Vue proxy, so `watch()` takes a getter of the member read:
`watch(() => field.value, cb)`.

An `Action` is a command: an element with a label and an icon that can be executed and sends nothing to its
container's value. `SubmitAction` and `RejectAction` submit and reset a form, and `form.confirm()` / `form.reject()`
execute them:

```typescript
import { Action, CommandException, Field, Group, RejectAction, SubmitAction } from '@dynamicforms/vue-forms';

const form = new Group({
  name: new Field({ value: 'John' }),
  save: new Action({
    value: { label: 'Save', defaultConfirm: true },
    actions: [new SubmitAction((action) => action.parent, (value) => api.save(value))],
  }),
  cancel: new Action({
    value: { label: 'Cancel', defaultReject: true },
    actions: [new RejectAction((action) => action.parent)],
  }),
});

form.value;                  // { name: 'John' }: actions send nothing
form.fields.save.executable; // false while the form is invalid or a submit is running

// waits for validation, sends a valid form and rebinds the form to the result
const result = await form.confirm();
if (result instanceof CommandException) {
  // the submit was refused or failed
} else if (result !== undefined) {
  const { sent, received } = result;
}
```

`confirm()` returns `undefined` where it executes nothing, such as while `save` is not executable. The cookbook's
[Submitting](https://docs.velis.si/dynamicforms/vue-forms/guide/cookbook#submitting) recipe describes every outcome.

An `Action` carries a label and an icon because a form's submit and cancel are drawn as buttons, and it is one of
the few members that relate to the interface. A UI library extends its value:
[`@dynamicforms/vuetify-inputs`](https://docs.velis.si/dynamicforms/vuetify-inputs/examples/df-actions.html) adds
render options and per-breakpoint variants.

## Events Example

Field changes and other events are handled by actions:

```typescript
import { Field, Group, ValueChangedAction } from '@dynamicforms/vue-forms';

const form = new Group({
  email: new Field({ value: '' }),
  username: new Field({ value: '' }),
});

// Fill in the username from the email while the username field is not touched
form.fields.email.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  if (!form.fields.username.touched) form.fields.username.value = newValue.split('@')[0];
  // calling supr passes the event on to the next handler; not calling it stops the chain
  return supr(field, newValue, oldValue);
}));

// Or register events on a form
form.registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('Form data changed:', newValue);
  return supr(field, newValue, oldValue);
}));
```

Events are announced over the net change when the operation that contains them finishes. Several writes wrapped
in a `transaction()` are announced as one:

```typescript
import { transaction } from '@dynamicforms/vue-forms';

// one ValueChangedAction on the form, not two
transaction(() => {
  form.fields.email.value = 'janez@example.com';
  form.fields.username.value = 'janez';
});
```

An exception thrown from the callback rolls back the whole transaction and is rethrown.

## Built-in Validators

Built-in validators for common rules:

```typescript
import { Field, Group, Validators } from '@dynamicforms/vue-forms';

const validatedForm = new Group({
  // Required field
  username: new Field({ 
    validators: [new Validators.Required({ code: 'app.username_required', detail: 'Username is required' })] 
  }),
  
  // Email validation with pattern
  email: new Field({ 
    validators: [
      new Validators.Pattern(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        { code: 'app.invalid_email', detail: 'Please enter a valid email address' }
      )
    ] 
  }),
  
  // Numeric range validation
  age: new Field({ 
    value: 25, 
    validators: [
      new Validators.ValueInRange(18, 100, { code: 'app.age_range', detail: 'Age must be between {minValue} and {maxValue}' })
    ] 
  }),
  
  // Allowed values validation
  role: new Field({ 
    validators: [
      new Validators.InAllowedValues(['admin', 'user', 'guest'])
    ] 
  }),
  
  // Text length validation
  bio: new Field({
    validators: [
      new Validators.LengthInRange(10, 200, { code: 'app.bio_length', detail: 'Bio must be between 10 and 200 characters' })
    ]
  })
});
```

Validators run eagerly: a field is validated when it is created, so a form built from empty required fields is
invalid immediately. `field.touched` determines when the UI shows the errors. `Required` trims a string before
measuring it, so a value of only spaces counts as empty; `new Validators.Required({ trim: false })` keeps spaces as
part of the value.

An error is data: a `code` (`vue-forms.required`, `vue-forms.pattern`, `vue-forms.min_length`, …), the `params` it
failed with, and an English `detail`. A code is `<namespace>.<code>`; the library's namespace is `vue-forms`,
exported as `ERROR_NAMESPACE`. The library does not render an error. The application, or a UI library such as
`@dynamicforms/vuetify-inputs`, converts it into text, translated by its code. A validator's last argument,
`{ code, detail }`, replaces the validator's default code and English detail; the library uses that code as given,
and the application prefixes its own codes with a namespace of its own.

A validation function may return a `Promise`; `field.validating` is `true` while it runs, and only the newest run
determines the result. [Asynchronous validation](https://docs.velis.si/dynamicforms/vue-forms/api/validators#asynchronous-validation)
describes cancellation, `busy`, `pending` and `clearValidators()`.

## Conditional Form Behavior

Conditional logic is declared with `Statement` and `Operator`:

```typescript
import {
  Field,
  Group,
  Statement,
  Operator,
  ConditionalVisibilityAction,
  ConditionalAccessAction,
} from '@dynamicforms/vue-forms';

const form = new Group({
  isCompany: new Field({ value: false }),
  companyName: new Field(),
  firstName: new Field(),
  lastName: new Field()
});

// Show and send the company name only when isCompany is true
const isCompany = new Statement(form.fields.isCompany, Operator.EQUALS, true);
form.fields.companyName.registerAction(new ConditionalVisibilityAction(isCompany));
form.fields.companyName.registerAction(new ConditionalAccessAction(isCompany));

// Show and send the personal name fields only when isCompany is false
const isPerson = new Statement(form.fields.isCompany, Operator.EQUALS, false);
[form.fields.firstName, form.fields.lastName].forEach((field) => {
  field.registerAction(new ConditionalVisibilityAction(isPerson));
  field.registerAction(new ConditionalAccessAction(isPerson));
});
```

## Advanced Data Structures (Lists)

`List` holds array data:

```typescript
import { Field, Group, List } from '@dynamicforms/vue-forms';

// Define a template for list items
const contactTemplate = new Group({
  name: new Field(),
  email: new Field(),
  phone: new Field()
});

// Create a list with the template
const contactsList = new List(contactTemplate);

// Add items to the list
contactsList.push({ name: 'John Doe', email: 'john@example.com', phone: '123-456-7890' });
contactsList.push({ name: 'Jane Doe', email: 'jane@example.com', phone: '987-654-3210' });

// Access list items: items returns the rows, get() returns undefined for an invalid index
console.log(contactsList.length);            // 2
const firstContact = contactsList.get(0)!;
console.log(firstContact.fields.name.value); // 'John Doe'

// Modify items
firstContact.fields.email.value = 'john.doe@example.com';

// Remove items
contactsList.remove(1);
```

Every list mutation is tracked, so a `v-for` over `contactsList.items` re-renders on `push()`, `insert()`,
`remove()`, `pop()` and `clear()` without extra wiring. `items` returns a frozen array of the live rows, rebuilt
once per change of the set of rows.

## TypeScript Support

The library is written in TypeScript and ships full type definitions:

```typescript
import { Field, Group, GenericFieldsInterface } from '@dynamicforms/vue-forms';

// Define field types explicitly
const usernameField = new Field<string>({ value: '' });
const emailField = new Field<string>({ value: '' });
const ageField = new Field<number>({ value: 25 });
const isActiveField = new Field<boolean>({ value: true });

// Type inference also works with initial values
const implicitTypedField = new Field({ value: 'string' }); // Type is inferred as string

// Define your form structure with types
interface UserFormData extends GenericFieldsInterface {
  username: Field<string>;
  email: Field<string>;
  age: Field<number>;
  isActive: Field<boolean>;
  preferences: Group<{
    darkMode: Field<boolean>;
    notifications: Field<boolean>;
  }>;
}

// Create the form with type checking
const userForm = new Group<UserFormData>({
  username: new Field<string>({ value: '' }),
  email: new Field<string>({ value: '' }),
  age: new Field<number>({ value: 25 }),
  isActive: new Field<boolean>({ value: true }),
  preferences: new Group<{
    darkMode: Field<boolean>;
    notifications: Field<boolean>;
  }>({
    darkMode: new Field<boolean>({ value: true }),
    notifications: new Field<boolean>({ value: true })
  })
});

// TypeScript knows the structure and types
const email: string = userForm.fields.email.value;
const age: number = userForm.fields.age.value;
const darkMode: boolean = userForm.fields.preferences.fields.darkMode.value;

// The group's value is typed too, member by member. Every member is optional, because a 'disabled' member is
// left out of the object the group builds, and nullable, because a 'disabled-null' one is sent as null
const values = userForm.value;
const emailFromValue: string | null | undefined = values.email;
const prefs: { darkMode?: boolean | null; notifications?: boolean | null } | null | undefined = values.preferences;

// Type safety prevents errors
// userForm.fields.age.value = 'not a number'; // Error: Type 'string' is not assignable to type 'number'
```

The value shape is derived from the fields map by the exported `FieldsToValues<T>`, with `GroupValue<T>` and
`GroupValueInput<T>` as the group's read and write types, and `ListValue<R>` for lists. Constructor parameters have
their own exported type, `IFieldParams<T, X>`, shared by all four element classes:

```typescript
import { Field, IFieldParams } from '@dynamicforms/vue-forms';

const defaults: IFieldParams<string> = { value: '', access: 'readonly' };
const field = new Field(defaults);
```

It accepts only the writable members (`value`, `originalValue`, `access`, `visibility`, `touched`, `errors`,
`validators` and `actions`), listed by `IFieldConstructorParams<T>`. Derived members such as `valid` and
`isChanged` are getters, and passing one is a compile error.

`X` declares the additional properties an element holds: the parameter object accepts them, `extra` reads them
and `setExtendedValues()` writes them. A form built from a server's description stores in them the label, hint or
css class a UI layer binds to its inputs:

```typescript
interface Presentation { label: string; hint?: string }

const name = new Field<string, Presentation>({ value: 'John', label: 'First name' });
name.extra.label; // 'First name', and a template reading it re-renders when it is written
name.setExtendedValues({ hint: 'as in your passport' });
```

`FieldBase<T>` is the abstract base of `Field`, `Action`, `Group` and `List`, and the type to use in your own
signatures that accept any form element:

```typescript
import { FieldBase } from '@dynamicforms/vue-forms';

function isDirty(field: FieldBase): boolean {
  return field.isChanged;
}
```

## Documentation

Full documentation and examples: [documentation](https://docs.velis.si/dynamicforms/vue-forms).

[The model](https://docs.velis.si/dynamicforms/vue-forms/guide/model) describes how the library fits together:
elements, declarations, transactions, where validity comes from and how a `List` builds its rows.
[Rationale](https://docs.velis.si/dynamicforms/vue-forms/guide/rationale) describes when the library fits, compared
with form libraries and with Pinia.

Upgrading an existing project? The
[migration guide](https://docs.velis.si/dynamicforms/vue-forms/guide/migration) has one section per release, newest
first, from 3.0.0 back to 0.6.0, and a combined section for upgrading from a release before 0.12.

## License

MIT
