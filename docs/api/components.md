# Components

## `MessagesWidget`

Renders a `string` or an array of [`RenderableValue`](#renderablevalue) objects — a `ValidationError` is one.
Commonly used to display field validation errors.

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
| `message` | `string \| RenderableValue[]` | yes | Message(s) to display |
| `classes` | `ClassTypes` | no | CSS classes applied to each rendered message |

`classes` is applied to every rendered message together with the error's own classes (`extraClasses`); markdown
messages also receive `df-messages-widget-markdown`. A `string` message renders a single `<span>`; an array renders
one node per value (multiple root nodes).

`code` is not rendered. It is the machine-readable name of what failed, which the built-in validators state and a
program matches on instead of the message text — see [error codes](/api/validators#error-codes).

`ClassType` is `string | string[] | Record<string, boolean>`, and `ClassTypes` is `ClassType | ClassType[]` —
nested arrays are allowed, and the widget builds one internally.

### `RenderableValue`

```typescript
new RenderableValue(content?, /* optional CSS classes */)
```

Content to render — a `string` (plain text), an `MdString` (markdown), a `SimpleComponentDef`
(`{ componentName, componentProps?, componentVHtml? }`), a `Ref` of any of these, or a function returning one —
with the CSS classes it is rendered with. It describes itself as what renders it, which is all `MessagesWidget` and
any other renderer reads:

| Member | Description |
|--------|-------------|
| `componentName` | `'template'` for plain text, `'vue-markdown'` for markdown, the component's name for a `SimpleComponentDef` |
| `componentBindings` | The markdown's `source`, `options` and `plugins`, or the component's props |
| `componentBody` | The plain text, or the component's `componentVHtml` |
| `extraClasses` | The classes given to the constructor |
| `resolvedText` | The content as it reads now: a reference unwrapped and a function called |
| `kind` | `'string'`, `'md'` or `'component'`: which form the content takes now |

The content may be a `Ref`, a `computed` or a function returning the value; it is resolved on every read, so it
stays reactive: changing what the reference holds changes the rendered value on the spot. A cell, a header or a
title is a `RenderableValue`; an error is a [`ValidationError`](/api/validators#validationerror), which extends it
with a code, params and an origin.

### Content types

| Type | Definition |
|------|-----------|
| `RenderContentNonCallable` | `string \| MdString \| SimpleComponentDef` |
| `RenderContentCallable` | `() => RenderContentNonCallable` |
| `RenderContent` | `RenderContentNonCallable \| RenderContentCallable` |
| `RenderContentRef` | `RenderContent \| Ref<RenderContent>` — the type accepted by `RenderableValue`, `ValidationError` and every built-in validator's `message` parameter |

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

Wraps a markdown string for a `RenderableValue` or a `ValidationError`. Accepts optional `markdown-it` options and plugins.

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

The library's built-in validator messages are plain text; one takes this path where the application's
[`errorText`](/api/config) answers an `MdString` for it. An `MdString` you build yourself always takes it.

---

> See also: [Messages Widget example](/examples/messages-widget), [Configuration](/api/config), [Validators](/api/validators)
