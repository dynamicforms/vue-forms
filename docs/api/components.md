# Components

## `MessagesWidget`

Renders a `string` or an array of `ValidationError` objects. Commonly used to display field validation errors.

```vue
<template>
  <messages-widget
    v-if="field.errors.length"
    :message="field.errors"
    classes="text-error"
  />
</template>

<script setup>
import { MessagesWidget } from '@dynamicforms/vue-forms';
</script>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `message` | `string \| ValidationError[]` | yes | Message(s) to display |
| `classes` | `ClassTypes` | no | CSS classes applied to each rendered message |

`ClassTypes` is `string | string[] | Record<string, boolean>`.

### `ValidationError` types

| Class | Description |
|-------|-------------|
| `ValidationErrorText` | Plain text message; optionally a custom `componentName` / `componentBindings` / `componentBody` can render any Vue component |
| `ValidationErrorRenderContent` | Markdown message — accepts an `MdString` |

Any message value (including `string`) can also be a **function** returning the value, enabling lazy / i18n resolution.

### `MdString`

Wraps a markdown string for `ValidationErrorRenderContent`. Accepts optional `markdown-it` options and plugins.

```typescript
import { MdString } from '@dynamicforms/vue-forms';
import MarkdownItAttrs from 'markdown-it-attrs';

new MdString('**bold** text', undefined, [MarkdownItAttrs]);
```

### Markdown support

`MessagesWidget` looks for a globally registered `vue-markdown` component. If none is found, markdown content falls back to plain text with a console warning. Register it in your app entry point:

```typescript
import VueMarkdown from 'vue-markdown-render';
app.component('VueMarkdown', VueMarkdown);
```

---

> See also: [Messages Widget example](/examples/messages-widget), [Configuration](/api/config), [Validators](/api/validators)
