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
- **Validation**: Simple validation system with extensible error handling

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

## Events Example

The library provides a powerful event system for field changes and other actions:

```typescript
import { Field, Group, ValueChangedAction, ValidationErrorText } from '@dynamicforms/vue-forms';

const emailField = new Field({ value: '' })
  .registerAction(new ValueChangedAction(async (field, supr, newValue, oldValue) => {
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
}).registerAction(new ValueChangedAction(async (field, supr, newValue, oldValue) => {
  console.log('Form data changed:', newValue);
  return supr(field, newValue, oldValue);
}));
```

## TypeScript Support

The library is written in TypeScript and provides full type definitions:

```typescript
import { Field, Group, IField } from '@dynamicforms/vue-forms';

// Define your form structure with types
interface UserFormData {
  username: Field;
  email: Field;
  preferences: Group<{
    darkMode: Field;
    notifications: Field;
  }>;
}

// Create the form with type checking
const userForm = new Group<UserFormData>({
  username: new Field({ value: '' }),
  email: new Field({ value: '' }),
  preferences: new Group({
    darkMode: new Field({ value: true }),
    notifications: new Field({ value: true })
  })
});

// TypeScript knows the structure
const darkMode: boolean = userForm.fields.preferences.fields.darkMode.value;
```

## Conclusion

`@dynamicforms/vue-forms` provides a clean, flexible approach to form management in Vue applications. By focusing on 
data structures and state management rather than UI components, it offers unparalleled flexibility while maintaining 
a simple, intuitive API.

For more detailed documentation and examples, check out the [source code](https://github.com/velis74/dynamicforms-vue-forms) or reach out to the author 
for assistance.

## License

MIT
