# @dynamicforms/vue-forms

A lightweight, reactive data entry forms library for Vue.js that handles form state management without dictating your
UI components.

## Introduction

`@dynamicforms/vue-forms` manages form data, validation and state, and leaves rendering entirely to you.

What it models beyond state is the behaviour *between* fields. Visibility, enablement and values can be declared
as conditions over other fields, and every change travels through an action pipeline in which each handler decides
whether to pass the event on and may reshape its result. Groups and lists compose recursively, so the same
mechanism applies at every level of a nested form.

### Design Goals

- **UI-Agnostic**: A logic layer for form state, validation and dynamic behaviour. Works with any Vue components, including your own.
- **Fields that react to each other**: Conditional visibility, enablement and values are declared as statements over other fields, and an action pipeline lets a handler intercept, transform or abort an event.
- **Reactive & Type-Safe**: Fields, groups and lists are Vue reactive objects, and a group's value type is inferred from the fields it holds, nested structures included.
- **Structural serialization**: A group's value is the shape of its fields, and `Group.createFromFormData()` turns a plain object back into a form.
- **Lightweight**: `vue` (^3.4) is the only peer dependency, and `lodash` and `lodash-es` — one per build — the only runtime ones.

## Features

- **UI-agnostic**: Works with any Vue UI components or your custom ones
- **Reactive**: Fields, groups and lists are Vue reactive objects — read and assign their properties directly, with
  no `ref` to unwrap and no computed mirror to keep in sync
- **Nested structures**: Support for complex data with nested fields and groups
- **Event system**: Rich event handling for field changes, validation, and more
- **Transactional**: every mutating operation is atomic — events are announced once, over the net change, and a
  handler that throws leaves the form exactly as it was
- **TypeScript support**: Full type definitions for excellent developer experience
- **Lightweight**: `vue` (^3.4) is the only peer dependency; the runtime dependencies are `lodash` and `lodash-es`,
  one for each of the two builds
- **Field types**: Core field types (Field, Action, Group, List) to represent any data structure
- **Validation**: Comprehensive validation system with built-in validators and extensible error handling
- **Conditional logic**: Dynamic form behavior based on field values and conditions
- **Display modes**: Control field visibility with different display modes (Full, Hidden, Invisible, Suppress)

## Installation

```bash
npm install @dynamicforms/vue-forms
```

The package ships two builds of the same source: an ESM build that imports `lodash-es` and a CJS/UMD build that
requires `lodash`. Both lodash packages are declared as dependencies and install with the package, so an `import` and
a `require()` both resolve without further setup. Node 18 or newer is required, and `vue` (^3.4) is the only peer
dependency. Type definitions ship for both entry points; the stylesheet is `@dynamicforms/vue-forms/style.css`.

## Setup

The library ships a Vue plugin for its global options:

```typescript
import { forms } from '@dynamicforms/vue-forms';

app.use(forms, { useMarkdownInValidators: false });
```

The import must be a named one — the default export is a namespace of the library members, not the plugin.

`useMarkdownInValidators` defaults to `true`, which means the default messages of the built-in validators are markdown
(`MdString`). Rendering those requires a globally registered `vue-markdown` component; set the option to `false` if you
want plain text instead.

## Basic Usage Example

Every form element is created with the constructor: `new Field({ ... })`, `new Action({ ... })`,
`new Group({ ... })`, `new List(template)`. The instance is a Vue reactive object from that moment on, so reading
`field.value` in a template tracks it and `field.value = x` re-renders — there is no `ref` to unwrap and no
computed mirror to maintain.

Here's a simple example of how to create and use a form with fields and groups:

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
personForm.fields.age.enabled = false;

// Form serializes only enabled fields
console.log(personForm.value);  // { firstName: 'Jane', lastName: 'Doe', active: true }
```

An `Action` is a field whose value is a label / icon pair and which can be executed:

```typescript
import { Action, ExecuteAction } from '@dynamicforms/vue-forms';

const saveAction = new Action({
  value: { label: 'Save' },
  actions: [new ExecuteAction((field, supr, params) => { console.log('saving', params); })]
});

await saveAction.execute({ form: personForm });  // 'saving { form: ... }'; saveAction.busy until it settles
```

## Events Example

The library provides a powerful event system for field changes and other actions:

```typescript
import { Field, Group, ValueChangedAction, ValidationErrorText } from '@dynamicforms/vue-forms';

const emailField = new Field({ value: '' })
  .registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
    // Custom validation on value change
    if (!newValue.includes('@')) {
      field.errors = [new ValidationErrorText('Invalid email format')];
    } else {
      field.errors = [];
    }
    
    // Always call supr to continue the action chain
    return supr(field, newValue, oldValue);
  }));

// Or register events on a form
const form = new Group({
  email: emailField,
  username: new Field()
}).registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('Form data changed:', newValue);
  return supr(field, newValue, oldValue);
}));
```

Assigning `field.errors` directly replaces the whole array, including errors owned by validators — prefer a
`Validator` (see below) when all you want is to add a validation rule.

Events are announced when the operation carrying them finishes, over the net change. Wrap several writes in a
`transaction()` and they announce as one:

```typescript
import { transaction } from '@dynamicforms/vue-forms';

// one ValueChangedAction on the form, not two
transaction(() => {
  form.fields.email.value = 'janez@example.com';
  form.fields.username.value = 'janez';
});
```

A throw out of the callback rolls the whole transaction back and rethrows, so a form is never left half-applied.

## Built-in Validators

The library provides several built-in validators for common validation scenarios:

```typescript
import { Field, Group, Validators } from '@dynamicforms/vue-forms';

const validatedForm = new Group({
  // Required field
  username: new Field({ 
    validators: [new Validators.Required('Username is required')] 
  }),
  
  // Email validation with pattern
  email: new Field({ 
    validators: [
      new Validators.Pattern(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please enter a valid email address'
      )
    ] 
  }),
  
  // Numeric range validation
  age: new Field({ 
    value: 25, 
    validators: [
      new Validators.ValueInRange(18, 100, 'Age must be between 18 and 100')
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
      new Validators.LengthInRange(10, 200, 'Bio must be between 10 and 200 characters')
    ]
  })
});
```

Validators run eagerly — a field is validated the moment it is created, so a form built from empty required fields is
invalid immediately. Use `field.touched` to decide when to show the errors in the UI.

A validation function may return a `Promise`. `field.validating` is `true` while such a run is pending, and the
verdict applied to the field is always the one belonging to the newest run, so a slow check cannot overwrite a faster
one started after it. A validator message given as a `Ref` or `computed` is resolved when the message is rendered, so
a translated message follows a locale switch without revalidating. `field.clearValidators()` drops the validators,
empties the errors and cancels whatever validation is still in flight.

## Messages Widget Component

The library includes a `messages-widget` Vue component for displaying validation errors and messages:

```vue
<template>
  <!-- Simple string message -->
  <messages-widget 
    message="This is an error message"
    classes="text-error"
  />
  
  <!-- Display field validation errors -->
  <messages-widget 
    v-if="emailField.errors.length > 0"
    :message="emailField.errors"
    :classes="['text-error', 'mt-2']"
  />
  
  <!-- Markdown message -->
  <messages-widget :message="markdownErrors" />
</template>

<script setup>
import { MessagesWidget, Field, Validators, ValidationErrorRenderContent, MdString } from '@dynamicforms/vue-forms';

// Example field with validation
const emailField = new Field({
  value: '',
  validators: [
    new Validators.Pattern(
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Please enter a valid email address'
    )
  ]
});

// Markdown message support (requires VueMarkdown component)
const markdownErrors = [
  new ValidationErrorRenderContent(
    new MdString('**Error**: This field contains *invalid* data.')
  )
];
</script>
```

The messages widget supports:
- **String messages**: Simple text messages
- **ValidationError arrays**: Rich error objects with styling and components
- **Markdown content**: Rich text formatting (requires VueMarkdown component)
- **Custom components**: Render any Vue component as an error message
- **Flexible styling**: Multiple ways to apply CSS classes

## Conditional Form Behavior

Create dynamic forms with conditional logic using Statements and Operators:

```typescript
import { 
  Field, Group, Statement, Operator,
  ConditionalVisibilityAction, ConditionalEnabledAction 
} from '@dynamicforms/vue-forms';

const form = new Group({
  isCompany: new Field({ value: false }),
  companyName: new Field(),
  firstName: new Field(),
  lastName: new Field()
});

// Show company name field only when isCompany is true
const showCompanyNameStatement = new Statement(form.fields.isCompany, Operator.EQUALS, true);
form.fields.companyName.registerAction(
  new ConditionalVisibilityAction(showCompanyNameStatement)
);

// Show personal name fields only when isCompany is false
const showPersonalFieldsStatement = new Statement(form.fields.isCompany, Operator.EQUALS, false);
form.fields.firstName.registerAction(
  new ConditionalVisibilityAction(showPersonalFieldsStatement)
);
form.fields.lastName.registerAction(
  new ConditionalVisibilityAction(showPersonalFieldsStatement)
);
```

## Advanced Data Structures (Lists)

Work with array data using the List component:

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

// Access list items: get() returns undefined for an invalid index
const firstContact = contactsList.get(0)!;
console.log(firstContact.fields.name.value); // 'John Doe'

// Modify items
firstContact.fields.email.value = 'john.doe@example.com';

// Remove items
contactsList.remove(1);
```

Every list mutation is tracked, so a `v-for` over `contactsList.value` re-renders on `push()`, `insert()`,
`remove()`, `pop()` and `clear()` without any extra wiring.

## TypeScript Support

The library is written in TypeScript and provides full type definitions:

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

// The serialized value is typed too, member by member
const values = userForm.value!;
const emailFromValue: string = values.email;
const prefs: { darkMode: boolean; notifications: boolean } | null = values.preferences;

// Type safety prevents errors
// userForm.fields.age.value = 'not a number'; // Error: Type 'string' is not assignable to type 'number'
```

The value shape is derived from the fields map by the exported `FieldsToValues<T>`, with `GroupValue<T>` and
`GroupValueInput<T>` as the group's read and write types, and `ListValue` for lists. Constructor parameters have
their own exported type, `IFieldConstructorParams<T>`, shared by all four element classes and by `clone()`:

```typescript
import { Field, IFieldConstructorParams } from '@dynamicforms/vue-forms';

const defaults: Partial<IFieldConstructorParams<string>> = { value: '', enabled: false };
const field = new Field(defaults);
```

It admits only the writable members — `value`, `originalValue`, `enabled`, `visibility`, `touched`, `errors`,
`validators` and `actions`. Derived members such as `valid` and `isChanged` are getters, and passing one is a
compile error.

`FieldBase<T>` is the abstract base of `Field`, `Action`, `Group` and `List`, and the type to use in your own
signatures whenever you accept any form element:

```typescript
import { FieldBase } from '@dynamicforms/vue-forms';

function isDirty(field: FieldBase): boolean {
  return field.isChanged;
}
```

## Documentation

For more detailed documentation and examples, check out the [documentation](https://docs.velis.si/dynamicforms/vue-forms).

Upgrading from 0.5.x? The
[migration guide](https://docs.velis.si/dynamicforms/vue-forms/guide/migration) lists every breaking change with
before/after code.

## Conclusion

`@dynamicforms/vue-forms` provides a clean, flexible approach to form management in Vue applications. By focusing on 
data structures and state management rather than UI components, it offers unparalleled flexibility while maintaining 
a simple, intuitive API.

## License

MIT
