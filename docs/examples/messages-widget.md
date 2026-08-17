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

A plain string renders as a single `<span>`; an array of errors renders one element per error (a `<div>` for text and
markdown errors, the resolved component otherwise).

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
import { MessagesWidget } from '@dynamicforms/vue-forms';
</script>
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `message` | `string \| ValidationError[]` | yes | - | The message(s) to display |
| `classes` | `ClassTypes` | no | - | CSS classes to apply |

`ClassTypes` is `ClassType | ClassType[]`, where `ClassType` can be:
- `string` - Single class name
- `string[]` - Array of class names  
- `Record<string, boolean>` - Object with conditional classes

Arrays may mix these forms, e.g. `[{ 'text-error': true }, 'mt-2']`.

### ValidationError Types

The component supports different types of validation errors:

#### Text Errors
```js
import { ValidationErrorText } from '@dynamicforms/vue-forms';

const textError = new ValidationErrorText('Username is required', 'custom-class');
```

The optional second argument sets per-message classes (`extraClasses`); MessagesWidget merges them with its own
`classes` prop on each rendered message.

#### Markdown Errors
```js
import { ValidationErrorRenderContent, MdString } from '@dynamicforms/vue-forms';

const markdownError = new ValidationErrorRenderContent(
  new MdString('**Error**: This field contains *invalid* data.')
);
```

See [Markdown Support](#markdown-support) for markdown options and plugins.

#### Reactive and Translated Errors

The content may also be a `Ref`, a `computed` or a function; it is resolved every time the message is read, so the
rendered text follows the reference:

```js
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Field, Validators } from '@dynamicforms/vue-forms';

const { t } = useI18n();

const field = new Field({
  value: '',
  validators: [new Validators.Required(computed(() => t('validation.required')))],
});
```

Switching the locale retranslates the error already sitting on the field — the reference is read at render time, not
at validation time, so nothing has to revalidate. Placeholders such as `{newValue}` are substituted at that same
moment, and a reference holding an `MdString` still renders as markdown with its options and plugins.

#### Custom Component Errors
```js
import { ValidationErrorText } from '@dynamicforms/vue-forms';

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

`componentName` must be either a plain HTML tag or the name of a **globally registered** component
(`app.component('v-alert', VAlert)`) — MessagesWidget resolves it with `resolveComponent()` in its own scope, so
locally imported components are not visible.

For custom components the `componentBody` is passed as the `innerHTML` prop (not as slot content), so it is rendered
as raw HTML — never put untrusted input there.

### With Form Fields

```js
import { Group, Field, Validators } from '@dynamicforms/vue-forms';

const form = new Group({
  email: new Field({
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
```

The `.df-messages-widget-markdown` rules (which strip the outer margins, paddings and tighten the line height of
rendered markdown) ship with the library — import them once in your app entry point:

```js
import '@dynamicforms/vue-forms/style.css';
```

## Key Features

- **Flexible Message Types**: Supports strings, validation errors, markdown, and custom components. The content of a
  `ValidationErrorRenderContent` may also be a function, a `Ref` or a `computed` returning the string / MdString /
  component definition, resolved on every read and therefore reactive — the i18n path. The `message` prop itself must
  be a string or an array of `ValidationError`s. 
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

app.component('VueMarkdown', VueMarkdown);
```

Register the component under the name `VueMarkdown` (or `vue-markdown`); MessagesWidget resolves it as `vue-markdown`.
Any Vue 3 markdown renderer will do — the examples here use `vue-markdown-render`.

If no markdown component is registered, markdown content will be displayed as plain text with a console warning.

Use `MdString` to create a markdown string. You can also include options and plugins that are accepted in `VueMarkdown`
component in MdString. For example, you need to include `MarkdownItAttrs` plugin to support additional attributes like 
`target` and `rel` in markdown links:

```js
import MarkdownItAttrs from 'markdown-it-attrs';

new MdString(`
**Error**: This field contains *invalid* data. See 
[Instructions](https://example.com){target="_blank" rel="noopener noreferrer"}
`, 
  undefined,
  [MarkdownItAttrs],
)
```

You can subclass `MdString` to bundle options and plugins once:

```ts
import MarkdownItAttrs from 'markdown-it-attrs';

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


> See also: [Components → MessagesWidget](/api/components), [Validators](/api/validators), [Configuration](/api/config)

<script setup>
import MessagesWidgetDemo from '../components/messages-widget-demo.vue';
</script>
