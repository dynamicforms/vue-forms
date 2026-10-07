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
app.use(forms, { errorText: (error) => myErrorText(error) });
```

`forms` is a named export; the package's default export is the `Form` namespace of classes, not the plugin.

The second argument is optional — omitting it leaves all options at their defaults.

## Options

`FormsConfig` is the exported type of the options object, so a configuration built separately from the call site
can be typed:

```typescript
const options: Partial<FormsConfig> = { errorText: (error) => myErrorText(error) };
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `errorText` | `(error: ErrorDescription) => RenderContentNonCallable \| undefined` | none | What an error stated by code, params and English detail reads as. Every built-in validator given no `message` reports such an error, a [`ValidationErrorDescription`](/api/validators#validationerrordescription), and so can an error the server returned. The function answers the application's text for it — a string, an `MdString` for markdown or a `SimpleComponentDef` — or `undefined` to leave the English detail. |

`errorText` is called on every read of an error, so an error on screen follows the reactive state the function
reads, such as the locale, without the field revalidating. [Error messages and
translation](/guide/getting-started#error-messages-and-translation) shows it with vue-i18n.

```typescript
setConfig({
  errorText: (error) => (error.code === 'min_value' ? `At least ${error.params.minValue}` : undefined),
});
```

## `getConfig()` and `setConfig()`

```typescript
import { getConfig, setConfig, type FormsConfig } from '@dynamicforms/vue-forms';

setConfig({ errorText });   // writes the options it names, leaves the rest as they stand
getConfig().errorText;      // errorText
```

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `getConfig` | `(): FormsConfig` | The current configuration. The object is the module's own record, so reading a member off it again reports a later write |
| `setConfig` | `(newConfig: Partial<FormsConfig>): void` | Writes the members `newConfig` names and leaves the rest as they stand |
| `FormsConfig` | `{ errorText?: (error: ErrorDescription) => RenderContentNonCallable \| undefined }` | The exported type of the record |

`app.use(forms, options)` does exactly what `setConfig(options)` does. Reach for these where there is no app to
install a plugin on — a test, a script — or to change the configuration after startup. The configuration is
reactive: an error already on screen follows a later write of `errorText`.

---

> See also: [Getting Started](/guide/getting-started), [Messages Widget](/api/components)
