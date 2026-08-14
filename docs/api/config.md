# Configuration

The library ships a Vue plugin that sets global options at app startup.

## Vue plugin

```typescript
import { createApp } from 'vue';
import { forms } from '@dynamicforms/vue-forms';

const app = createApp(App);
app.use(forms, { useMarkdownInValidators: false });
```

`forms` is a named export; the package's default export is the `Form` namespace of classes, not the plugin.

The second argument is optional — omitting it leaves all options at their defaults. The configuration is a
single global object shared by the whole app.

## `FormsConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useMarkdownInValidators` | `boolean` | `true` | When `true`, the library's built-in validator messages are wrapped in `MdString` and rendered through the globally registered `vue-markdown` component. When `false`, markdown syntax is stripped from them and they are emitted as plain strings. Messages you pass to a validator yourself are used verbatim — run them through `buildErrorMessage()` if you want them to honour this setting. |

The option is set once, via `app.use(forms, options)`.

### `buildErrorMessage(text)`

Returns an `MdString` when `useMarkdownInValidators` is `true`, otherwise the same text with markdown syntax
stripped. Use it for your own validator messages so they follow the global setting:

```typescript
import { buildErrorMessage, Validators } from '@dynamicforms/vue-forms';

new Validators.Required(buildErrorMessage('**Required**'));
```

---

> See also: [Getting Started](/guide/getting-started), [Messages Widget](/api/components)
