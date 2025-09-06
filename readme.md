# @dynamicforms/vue-forms

A lightweight, reactive data entry forms library for Vue.js that handles form state management without dictating your
UI components.

## Introduction

`@dynamicforms/vue-forms` provides a powerful yet simple way to manage form data, validation, and state in Vue 
applications. The library focuses on the logic layer of forms, giving you complete freedom to use any UI components 
you prefer.

Unlike other form libraries that couple data management with specific UI components, `@dynamicforms/vue-forms` 
separates these concerns, allowing you to build forms that match your design system perfectly.

## Features

- **UI-agnostic**: Works with any Vue UI components or your custom ones
- **Reactive**: Built on Vue's reactivity system for seamless integration
- **Nested structures**: Support for complex data with nested fields and groups
- **Event system**: Rich event handling for field changes, validation, and more
- **TypeScript support**: Full type definitions for excellent developer experience
- **Lightweight**: No dependencies besides Vue and lodash
- **Field types**: Core field types (Field, Action, Group, List) to represent any data structure
- **Validation**: Comprehensive validation system with built-in validators and extensible error handling
- **Conditional logic**: Dynamic form behavior based on field values and conditions
- **Display modes**: Control field visibility with different display modes (Full, Hidden, Invisible, Suppress)

## Installation

```bash
npm install @dynamicforms/vue-forms
```

## Basic Usage Example

Here's a simple example of how to create and use a form with fields and groups:

```typescript
import { reactive } from 'vue';
import { Field, Group, ValueChangedAction } from '@dynamicforms/vue-forms';

// Create a form with fields
const personForm = new Group({
  firstName: Field.create({ value: 'John' }),
  lastName: Field.create({ value: 'Doe' }),
  age: Field.create({ value: 30 }),
  active: Field.create({ value: true })
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

## Events Example

The library provides a powerful event system for field changes and other actions:

```typescript
import { Field, Group, ValueChangedAction, ValidationErrorText } from '@dynamicforms/vue-forms';

const emailField = Field.create({ value: '' })
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
  username: Field.create()
}).registerAction(new ValueChangedAction((field, supr, newValue, oldValue) => {
  console.log('Form data changed:', newValue);
  return supr(field, newValue, oldValue);
}));
```

## Built-in Validators

The library provides several built-in validators for common validation scenarios:

```typescript
import { Field, Group, Validators } from '@dynamicforms/vue-forms';

const validatedForm = new Group({
  // Required field
  username: Field.create({ 
    validators: [new Validators.Required('Username is required')] 
  }),
  
  // Email validation with pattern
  email: Field.create({ 
    validators: [
      new Validators.Pattern(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please enter a valid email address'
      )
    ] 
  }),
  
  // Numeric range validation
  age: Field.create({ 
    value: 25, 
    validators: [
      new Validators.ValueInRange(18, 100, 'Age must be between 18 and 100')
    ] 
  }),
  
  // Allowed values validation
  role: Field.create({ 
    validators: [
      new Validators.InAllowedValues(['admin', 'user', 'guest'])
    ] 
  }),
  
  // Text length validation
  bio: Field.create({
    validators: [
      new Validators.LengthInRange(10, 200, 'Bio must be between 10 and 200 characters')
    ]
  })
});
```

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
    v-if="field.errors && field.errors.length > 0"
    :message="field.errors"
    :classes="['text-error', 'mt-2']"
  />
</template>

<script setup>
import MessagesWidget from '@dynamicforms/vue-forms/components/messages-widget.vue';
import { Field, Validators, ValidationErrorRenderContent, MdString } from '@dynamicforms/vue-forms';

// Example field with validation
const emailField = Field.create({
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
  isCompany: Field.create({ value: false }),
  companyName: Field.create(),
  firstName: Field.create(),
  lastName: Field.create()
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
  name: Field.create(),
  email: Field.create(),
  phone: Field.create()
});

// Create a list with the template
const contactsList = new List(contactTemplate);

// Add items to the list
contactsList.push({ name: 'John Doe', email: 'john@example.com', phone: '123-456-7890' });
contactsList.push({ name: 'Jane Doe', email: 'jane@example.com', phone: '987-654-3210' });

// Access list items
const firstContact = contactsList.get(0);
console.log(firstContact.fields.name.value); // 'John Doe'

// Modify items
firstContact.fields.email.value = 'john.doe@example.com';

// Remove items
contactsList.remove(1);
```

## TypeScript Support

The library is written in TypeScript and provides full type definitions:

```typescript
import { Field, Group, IField } from '@dynamicforms/vue-forms';

// Define field types explicitly
const usernameField = Field.create<string>({ value: '' });
const emailField = Field.create<string>({ value: '' });
const ageField = Field.create<number>({ value: 25 });
const isActiveField = Field.create<boolean>({ value: true });

// Type inference also works with initial values
const implicitTypedField = Field.create({ value: 'string' }); // Type is inferred as string

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
  username: Field.create<string>({ value: '' }),
  email: Field.create<string>({ value: '' }),
  age: Field.create<number>({ value: 25 }),
  isActive: Field.create<boolean>({ value: true }),
  preferences: new Group<{
    darkMode: Field<boolean>;
    notifications: Field<boolean>;
  }>({
    darkMode: Field.create<boolean>({ value: true }),
    notifications: Field.create<boolean>({ value: true })
  })
});

// TypeScript knows the structure and types
const email: string = userForm.fields.email.value;
const age: number = userForm.fields.age.value;
const darkMode: boolean = userForm.fields.preferences.fields.darkMode.value;

// Type safety prevents errors
// userForm.fields.age.value = 'not a number'; // Error: Type 'string' is not assignable to type 'number'
```

## Documentation

For more detailed documentation and examples, check out the documentation (currently only locally runnable).

## Conclusion

`@dynamicforms/vue-forms` provides a clean, flexible approach to form management in Vue applications. By focusing on 
data structures and state management rather than UI components, it offers unparalleled flexibility while maintaining 
a simple, intuitive API.

## License

MIT
