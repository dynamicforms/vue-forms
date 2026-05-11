# Configuration

The library ships a Vue plugin that sets global options at app startup.

## Vue plugin

```typescript
import { createApp } from 'vue';
import forms from '@dynamicforms/vue-forms';

const app = createApp(App);
app.use(forms, { useMarkdownInValidators: true });
```

The second argument is optional — omitting it leaves all options at their defaults.

## `FormsConfig`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useMarkdownInValidators` | `boolean` | `true` | When `true`, validator error messages are treated as markdown and rendered via the registered `VueMarkdown` component. Set to `false` to always render plain text. |

## Runtime access

```typescript
import { getConfig, setConfig } from '@dynamicforms/vue-forms';

// read
const cfg = getConfig(); // FormsConfig

// update (partial)
setConfig({ useMarkdownInValidators: false });
```

Both functions work after the app has started and take effect immediately.

---

> See also: [Getting Started](/guide/getting-started), [Messages Widget](/api/components)
