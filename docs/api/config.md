# Configuration

The library ships a Vue plugin that sets global options at app startup, and a pair of functions that read and write
the same options without it.

The configuration is **module-global**, not per app: there is one record, held by the module every importer shares.
`app.use(forms, options)` and `setConfig()` both write that record, so in a process running several Vue apps — a
server-side render, a test file mounting more than one — the configuration applied last is the one all of them
read.

## Vue plugin

```typescript
import { createApp } from 'vue';
import { forms } from '@dynamicforms/vue-forms';

const app = createApp(App);
app.use(forms, { useMarkdownInValidators: false });
```

`forms` is a named export; the package's default export is the `Form` namespace of classes, not the plugin.

The second argument is optional — omitting it leaves all options at their defaults.

## Options

`FormsConfig` is the exported type of the options object, so a configuration built separately from the call site
can be typed:

```typescript
const options: Partial<FormsConfig> = { useMarkdownInValidators: false };
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useMarkdownInValidators` | `boolean` | `true` | When `true`, the library's built-in validator messages are wrapped in `MdString` and rendered through the globally registered `vue-markdown` component. When `false`, markdown syntax is stripped from them and they are emitted as plain strings. Messages you pass to a validator yourself are used verbatim — run them through `buildErrorMessage()` if you want them to honour this setting. |

### `buildErrorMessage(text)`

Returns an `MdString` when `useMarkdownInValidators` is `true`, otherwise the same text with markdown syntax
stripped. Use it for your own validator messages so they follow the global setting:

```typescript
import { buildErrorMessage, Validators } from '@dynamicforms/vue-forms';

new Validators.Required(buildErrorMessage('**Required**'));
```

## `getConfig()` and `setConfig()`

```typescript
import { getConfig, setConfig, type FormsConfig } from '@dynamicforms/vue-forms';

setConfig({ useMarkdownInValidators: false });   // writes the options it names, leaves the rest as they stand
getConfig().useMarkdownInValidators;             // false
```

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `getConfig` | `(): FormsConfig` | The current configuration. The object is the module's own record, so reading a member off it again reports a later write |
| `setConfig` | `(newConfig: Partial<FormsConfig>): void` | Writes the members `newConfig` names and leaves the rest as they stand |
| `FormsConfig` | `{ useMarkdownInValidators: boolean }` | The exported type of the record. Every member is required in it; `setConfig` takes a `Partial` of it |

`app.use(forms, options)` does exactly what `setConfig(options)` does. Reach for these where there is no app to
install a plugin on — a test, a script, a library of your own building messages — or to change the setting after
startup. The reads are not tracked: a validator built before the change keeps the message it was built with, and
`buildErrorMessage()` reads the setting at the moment it is called.


---

> See also: [Getting Started](/guide/getting-started), [Messages Widget](/api/components)
