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

`code` is not rendered. It is the machine-readable name of what failed, which the built-in validators state and a
program matches on instead of the message text — see [error codes](/api/validators#error-codes).

`ClassType` is `string | string[] | Record<string, boolean>`, and `ClassTypes` is `ClassType | ClassType[]` —
nested arrays are allowed, and the widget builds one internally.

### `ValidationError` types

| Class | Description |
|-------|-------------|
| `ValidationError` | `new ValidationError(code?)` — base class: override `componentName`, `componentBindings`, `componentBody` and `extraClasses` to define your own error rendering |
| `ValidationErrorText` | `new ValidationErrorText(text, classes?, code?)` — plain text rendered as a `<div>` carrying the widget `classes` plus the instance `classes`. Override the getters in a subclass to render something else |
| `ValidationErrorRenderContent` | `new ValidationErrorRenderContent(content, classes?, code?)` — content may be a `string` (plain), an `MdString` (markdown), a `SimpleComponentDef` (`{ componentName, componentProps?, componentVHtml? }`), a `Ref` of any of these, or a function returning one |
| `RenderableValue` | Same as `ValidationErrorRenderContent`, named for content that is not an error (help, hints) |

The content given to `ValidationErrorRenderContent` may be a `Ref`, a `computed` or a function returning the value;
it is resolved on every read, so it stays reactive: changing what the reference holds changes the rendered message
on the spot, without revalidating the field that carries the error. A validator message built as
`computed(() => t('validation.required'))` therefore follows a locale switch. The widget's `message` prop itself
must be a `string` or a `ValidationError[]`.

### Content types

| Type | Definition |
|------|-----------|
| `RenderContentNonCallable` | `string \| MdString \| SimpleComponentDef` |
| `RenderContentCallable` | `() => RenderContentNonCallable` |
| `RenderContent` | `RenderContentNonCallable \| RenderContentCallable` |
| `RenderContentRef` | `RenderContent \| Ref<RenderContent>` — the type accepted by `ValidationErrorRenderContent` and by every built-in validator's `message` parameter |

A `componentName` that is one of the common HTML tag names — the block, text, list, table and form elements — is
rendered as that element directly. Every other name, an uncommon HTML tag included, is resolved as a globally
registered component.

### Type guards

Two are exported, for code that renders a `RenderContentRef` itself rather than through `MessagesWidget`.

```typescript
function isSimpleComponentDef(content?: RenderContentRef): content is SimpleComponentDef;
function isCallableFunction(content?: RenderContentRef): content is RenderContentCallable;
```

Both resolve a `Ref` before they answer. `isSimpleComponentDef` is true for an object carrying a `componentName`,
and false for everything else — a string, an `MdString`, a function, `undefined` and `null` alike. `isCallableFunction`
is true for a function, which is the form to call before rendering what it answers with:

```typescript
const resolved = isCallableFunction(content) ? content() : unref(content);
if (isSimpleComponentDef(resolved)) renderComponent(resolved.componentName, resolved.componentProps);
else if (resolved instanceof MdString) renderMarkdown(resolved.toString(), resolved.options, resolved.plugins);
else renderText(String(resolved));
```

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
