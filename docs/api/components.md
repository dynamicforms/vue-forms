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
import { Field, MessagesWidget, Validators } from '@dynamicforms/vue-forms';

const field = new Field({ value: '', validators: [new Validators.Required()] });
</script>
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `message` | `string \| ValidationError[]` | yes | Message(s) to display |
| `classes` | `ClassTypes` | no | CSS classes applied to each rendered message |

`classes` is applied to every rendered message together with the error's own classes (`extraClasses`); markdown
messages also receive `df-messages-widget-markdown`. A `string` message renders a single `<span>`; a
`ValidationError[]` renders one node per error (multiple root nodes).

`ClassType` is `string | string[] | Record<string, boolean>`, and `ClassTypes` is `ClassType | ClassType[]` —
nested arrays are allowed, and the widget builds one internally.

### `ValidationError` types

| Class | Description |
|-------|-------------|
| `ValidationError` | Base class: override `componentName`, `componentBindings`, `componentBody` and `extraClasses` to define your own error rendering |
| `ValidationErrorText` | `new ValidationErrorText(text, classes?)` — plain text rendered as a `<div>` carrying the widget `classes` plus the instance `classes`. Override the getters in a subclass to render something else |
| `ValidationErrorRenderContent` | `new ValidationErrorRenderContent(content, classes?)` — content may be a `string` (plain), an `MdString` (markdown), a `SimpleComponentDef` (`{ componentName, componentProps?, componentVHtml? }`), a `Ref` of any of these, or a function returning one |
| `RenderableValue` | Same as `ValidationErrorRenderContent`, named for content that is not an error (help, hints) |

The content given to `ValidationErrorRenderContent` may be a `Ref` or a function returning the value; it is
resolved on every read, which enables lazy / i18n resolution. The widget's `message` prop itself must be a
`string` or a `ValidationError[]`.

### Content types

| Type | Definition |
|------|-----------|
| `RenderContentNonCallable` | `string \| MdString \| SimpleComponentDef` |
| `RenderContentCallable` | `() => RenderContentNonCallable` |
| `RenderContent` | `RenderContentNonCallable \| RenderContentCallable` |
| `RenderContentRef` | `RenderContent \| Ref<RenderContent>` — the type accepted by `ValidationErrorRenderContent` and by every built-in validator's `message` parameter |

A `componentName` that is a plain HTML tag name is rendered directly; any other name is resolved as a globally
registered component.

For developers writing their own renderers, the type guards `isSimpleComponentDef(content)` and
`isCallableFunction(content)` are exported as well.

### `MdString`

Wraps a markdown string for `ValidationErrorRenderContent`. Accepts optional `markdown-it` options and plugins.

```typescript
import { MdString } from '@dynamicforms/vue-forms';
import MarkdownItAttrs from 'markdown-it-attrs';

new MdString('**bold** text', undefined, [MarkdownItAttrs]);
```

### Stylesheet

`MessagesWidget` relies on the `.df-messages-widget-markdown` rules shipped in the library stylesheet. It is not
bundled into the JavaScript, so import it once in your app entry point:

```typescript
import '@dynamicforms/vue-forms/style.css';
```

### Markdown support

`MessagesWidget` looks for a globally registered `vue-markdown` component. If none is registered, the raw
markdown source is rendered inside a `<div>` and a warning is logged. Register it in your app entry point:

```typescript
import VueMarkdown from 'vue-markdown-render';
app.component('VueMarkdown', VueMarkdown);
```

Whether the library's built-in validator messages take this path at all depends on `useMarkdownInValidators`
(see [Configuration](/api/config)); an `MdString` you build yourself always takes it.

---

> See also: [Messages Widget example](/examples/messages-widget), [Configuration](/api/config), [Validators](/api/validators)
