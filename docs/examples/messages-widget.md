# Messages Widget Example

This example demonstrates how to use the `messages-widget` component for displaying various types of messages and validation errors in `@dynamicforms/vue-forms`.

## Demo

Here's a live demo of the messages widget with different message types and styling options:

<MessagesWidgetDemo />

## Overview

The `messages-widget` component is a flexible message display component that can render:

- Simple string messages
- Arrays of `ValidationError` objects
- Markdown content (requires `VueMarkdown` component)
- Custom component messages

## Source Code

Here's how to use the messages widget:

### Basic Usage

```vue
<template>
  <!-- Simple string message -->
  <messages-widget 
    message="This is a simple error message"
    classes="text-error"
  />
  
  <!-- With validation errors -->
  <messages-widget 
    v-if="field.errors && field.errors.length > 0"
    :message="field.errors"
    classes="custom-error-style"
  />
</template>

<script setup>
import MessagesWidget from '@dynamicforms/vue-forms/components/messages-widget.vue';
</script>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | `string \| ValidationError[]` | - | The message(s) to display |
| `classes` | `ClassTypes \| ClassTypes[]` | `'text-error'` | CSS classes to apply |

Where `ClassTypes` can be:
- `string` - Single class name
- `string[]` - Array of class names  
- `Record<string, boolean>` - Object with conditional classes

### ValidationError Types

The component supports different types of validation errors:

#### Text Errors
```js
import { ValidationErrorText } from '@dynamicforms/vue-forms';

const textError = new ValidationErrorText('Username is required', 'custom-class');
```

#### Markdown Errors
```js
import { ValidationErrorRenderContent, MdString } from '@dynamicforms/vue-forms';

const markdownError = new ValidationErrorRenderContent(
  new MdString('**Error**: This field contains *invalid* data.')
);

const markdownErrorWithPlugin = new ValidationErrorRenderContent(
  new MdString(`
  **Error**: This field contains *invalid* data. See 
  [Instructions](https://example.com){target="_blank" rel="noopener noreferrer"}
  `, 
      undefined,
      [MarkdownItAttrs],
  )
);
```

#### Custom Component Errors
```js
class CustomAlertError extends ValidationErrorText {
  get componentName() { 
    return 'v-alert'; 
  }
  
  get componentBindings() { 
    return { 
      type: 'warning',
      variant: 'tonal'
    }; 
  }
  
  get componentBody() { 
    return this.text; 
  }
}
```

### With Form Fields

```js
import { Group, Field, Validators } from '@dynamicforms/vue-forms';

const form = new Group({
  email: Field.create({
    value: '',
    validators: [
      new Validators.Pattern(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        'Please enter a valid email address'
      )
    ]
  })
});
```

```vue
<template>
  <v-text-field
    v-model="form.fields.email.value"
    label="Email"
  />
  
  <!-- Display validation errors using messages widget -->
  <messages-widget
    v-if="form.fields.email.errors && form.fields.email.errors.length > 0"
    :message="form.fields.email.errors"
    :classes="['text-error', 'mt-2']"
  />
</template>
```

### Styling Classes

The component accepts flexible class definitions:

```vue
<template>
  <!-- String class -->
  <messages-widget message="Error" classes="text-error" />
  
  <!-- Array of classes -->
  <messages-widget 
    message="Warning" 
    :classes="['text-warning', 'font-weight-bold']" 
  />
  
  <!-- Conditional classes object -->
  <messages-widget 
    message="Info" 
    :classes="{ 'text-success': isValid, 'text-error': !isValid }" 
  />
</template>
```

### Custom CSS

You can define custom styles for your messages:

```css
.custom-error-style {
  color: #d32f2f;
  background-color: #ffebee;
  padding: 8px 12px;
  border-radius: 4px;
  border-left: 4px solid #d32f2f;
}

.df-messages-widget-markdown > :first-child,
.df-messages-widget-markdown > :last-child {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
```

## Key Features

- **Flexible Message Types**: Supports strings, validation errors, markdown, and custom components. In addition, all of 
  these can also be passed as a function returning these types to allow for dynamic resolution such as i18n. 
- **Customizable Styling**: Multiple ways to apply CSS classes
- **Markdown Support**: Rich text formatting when VueMarkdown is available
- **Validation Integration**: Works seamlessly with form validation errors
- **Custom Components**: Render any Vue component as an error message

## Try It Yourself

Experiment with the messages widget by:

1. **Simple Messages**: Enter different text messages and see how they render
2. **Validation Errors**: Try invalid email formats or age values to see validation errors
3. **Markdown Content**: Edit the markdown textarea to see rich text formatting
4. **Custom Components**: Click the button to add custom alert components
5. **Styling Options**: Change CSS classes to see different visual styles

## Markdown Support

For markdown support, ensure you have a `VueMarkdown` component registered:

```js
// In your main app file
import VueMarkdown from 'vue-markdown-render'; // or your preferred markdown component

app.component('VueMarkdown', VueMarkdown); // make sure it's not vue-markdown
```

If no markdown component is registered, markdown content will be displayed as plain text with a console warning.

Use `MdString` to create a markdown string. You can also include options and plugins that are accepted in `VueMarkdown`
component in MdString. For example, you need to include `MarkdownItAttrs` plugin to support additional attributes like 
`target` and `rel` in markdown links:

```js
new MdString(`
**Error**: This field contains *invalid* data. See 
[Instructions](https://example.com){target="_blank" rel="noopener noreferrer"}
`, 
  undefined,
  [MarkdownItAttrs],
)
```

Of course, you can also create your own markdown string class, that extends `MdString`, so you don't have to 
include the plugin every time.

```js
class MdStringWithAttrs extends MdString {
    constructor(value: string) {
        super(value, undefined, [MarkdownItAttrs]);
    }
}

new MdStringWithAttrs(`
  **Error**: This field contains *invalid* data. See 
  [Instructions](https://example.com){target="_blank" rel="noopener noreferrer"}
`);
```


<script setup>
import MessagesWidgetDemo from '../components/messages-widget-demo.vue';
</script>
