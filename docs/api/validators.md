# Validators

Validators are specialized actions that run automatically when a field's value changes. They populate `field.errors` and update `field.valid`.

All built-in validators are available on the `Validators` namespace:

```typescript
import { Validators } from '@dynamicforms/vue-forms';
```

The namespace contains validators only — `Validator`, `Required`, `Pattern`, `MinValue`, `MaxValue`, `ValueInRange`, `MinLength`, `MaxLength`, `LengthInRange`, `InAllowedValues` and `CompareTo`. The error classes and `MdString` are exported from the package root instead:

```typescript
import { ValidationErrorText, ValidationErrorRenderContent, MdString, Validator } from '@dynamicforms/vue-forms';
```

Pass validators when creating a field — `Field.create({ validators: [...] })`, `new Group(fields, { validators: [...] })`, `new List(itemTemplate, { validators: [...] })` — or register them later with `registerAction()`.

Each validator only ever replaces its own errors when it re-runs; errors contributed by other validators or added from the outside (e.g. server-side errors) are left untouched.

## `new Validators.Validator(validationFn)`

Base class for custom validators. Extend it or instantiate it directly for one-off rules.

```typescript
import { Validators, ValidationErrorRenderContent } from '@dynamicforms/vue-forms';

const myValidator = new Validators.Validator(async (newValue, oldValue, field) => {
  if (newValue === 'forbidden') {
    return [new ValidationErrorRenderContent('This value is not allowed')];
  }
  return null; // no errors
});
```

**`validationFn` signature:**
```typescript
(newValue: T, oldValue: T, field: IField<T>) => ValidationError[] | null | Promise<ValidationError[] | null>
```

Return `null` or `[]` to indicate no errors.

Validators are eager: they run immediately at field creation, immediately when passed to `registerAction()` on an existing field, and again on `field.validate(true)`. A field can therefore be `valid === false` before the user has interacted with it at all — use `touched` to decide when to actually display the errors.

When the validation function returns a `Promise`, `field.validating` is set to `true` right away (the field counts concurrently running async validators) and `field.errors` / `field.valid` are only updated once the promise resolves, at which point `validating` goes back to `false`. UI should block submit while `validating === true` as well.

### `buildErrorMessage(markdown)`

```typescript
import { buildErrorMessage, ValidationErrorRenderContent, Validators } from '@dynamicforms/vue-forms';

const myValidator = new Validators.Validator((newValue) => {
  if (newValue === 'forbidden') {
    return [new ValidationErrorRenderContent(buildErrorMessage('This value is **not allowed**'))];
  }
  return null;
});
```

Returns an `MdString` when [`useMarkdownInValidators`](/api/config) is enabled (the default), otherwise the same string with the markdown markup stripped. Use it in your own validators so their messages honour the global setting the same way the built-in ones do.

## Built-in validators

All default messages below are the literal strings passed to `buildErrorMessage()`, so with the default configuration they end up as `MdString` and are rendered as markdown — see [`useMarkdownInValidators`](/api/config).

### `new Validators.Required(message?)`

Fails when the value is empty (zero-length string, empty array, empty plain object, or `null`/`undefined`).

```typescript
Field.create({ value: '', validators: [new Validators.Required('This field is required')] })
```

| Parameter | Type | Default |
|-----------|------|---------|
| `message` | `RenderContentRef` | `'Please enter a value'` |

---

### `new Validators.Pattern(pattern, message?)`

Fails when the string representation of the value does not match `pattern`. The value is converted with `String(value)` before testing, so `undefined` is tested as the string `"undefined"`. The `{pattern}` placeholder renders the whole regex literal, including slashes and flags (`/^\d{4}$/`). Avoid the `g` flag — `RegExp.test` keeps `lastIndex` between calls with it.

```typescript
new Validators.Pattern(/^\d{4}$/, 'Must be a 4-digit number')
```

| Parameter | Type | Default |
|-----------|------|---------|
| `pattern` | `RegExp` | required |
| `message` | `RenderContentRef` | `'Value must match pattern "**{pattern}**"'` |

---

### `new Validators.MinValue(minValue, message?)`

Fails when `value < minValue`, and also when the value is `undefined` (the check is strictly `=== undefined`, so `null` is not caught by it). For optional fields register the validator conditionally or write your own `Validator`.

| Parameter | Type | Default |
|-----------|------|---------|
| `minValue` | `T` | required |
| `message` | `RenderContentRef` | `'Value must be larger or equal to **{minValue}**'` |

---

### `new Validators.MaxValue(maxValue, message?)`

Fails when `value > maxValue`, and also when the value is `undefined` (the check is strictly `=== undefined`, so `null` is not caught by it). For optional fields register the validator conditionally or write your own `Validator`.

| Parameter | Type | Default |
|-----------|------|---------|
| `maxValue` | `T` | required |
| `message` | `RenderContentRef` | `'Value must be less than or equal to **{maxValue}**'` |

---

### `new Validators.ValueInRange(minValue, maxValue, message?)`

Fails when `value < minValue` or `value > maxValue`, and also when the value is `undefined` (the check is strictly `=== undefined`, so `null` is not caught by it). For optional fields register the validator conditionally or write your own `Validator`.

```typescript
new Validators.ValueInRange(0, 100, 'Must be between 0 and 100')
```

| Parameter | Type | Default |
|-----------|------|---------|
| `minValue` | `T` | required |
| `maxValue` | `T` | required |
| `message` | `RenderContentRef` | `'Value must be between **{minValue}** and **{maxValue}**'` |

---

### `new Validators.MinLength(minLength, message?)`

Fails when the length of the value is less than `minLength`. Supports strings, arrays, and plain objects.

| Parameter | Type | Default |
|-----------|------|---------|
| `minLength` | `number` | required |
| `message` | `RenderContentRef` | `'Length must be larger or equal to **{minLength}**'` |

---

### `new Validators.MaxLength(maxLength, message?)`

Fails when the length of the value exceeds `maxLength`.

| Parameter | Type | Default |
|-----------|------|---------|
| `maxLength` | `number` | required |
| `message` | `RenderContentRef` | `'Length must be less than or equal to **{maxLength}**'` |

---

### `new Validators.LengthInRange(minLength, maxLength, message?)`

Fails when the length of the value is outside `[minLength, maxLength]`.

```typescript
new Validators.LengthInRange(10, 200, 'Must be between 10 and 200 characters')
```

| Parameter | Type | Default |
|-----------|------|---------|
| `minLength` | `number` | required |
| `maxLength` | `number` | required |
| `message` | `RenderContentRef` | `'Length must be between **{minLength}** and **{maxLength}**'` |

---

### `new Validators.InAllowedValues(allowedValues, message?)`

Fails when the value is not in `allowedValues`.

```typescript
new Validators.InAllowedValues(['admin', 'user', 'guest'])
```

| Parameter | Type | Default |
|-----------|------|---------|
| `allowedValues` | `T[]` | required |
| `message` | `RenderContentRef` | `'Must be one of [**{allowedAsText}**]'` |

`{allowedAsText}` is `allowedValues.join(', ')`, computed once in the constructor; when it is longer than 60 characters it is truncated to 40 characters and suffixed with `... (N items total)`. The full list is available through `{allowedValues}`.

---

### `new Validators.CompareTo(otherField, isValidComparison, message)`

Cross-field validator that re-validates whenever this field **or** `otherField` changes.

```typescript
new Validators.CompareTo(
  passwordField,
  (myValue, otherValue) => myValue === otherValue,
  'Passwords must match'
)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `otherField` | `IField` | The field to compare against |
| `isValidComparison` | `(myValue: T, otherValue: T) => boolean` | Return `true` when valid |
| `message` | `RenderContentRef` | Error message — required, there is no default |

## Error types

### `ValidationError`

Base class. It returns `componentName === 'Comment'`, empty bindings and an empty body, so `MessagesWidget` renders it as an empty `<comment>` element (Vue also logs `Failed to resolve component: Comment` unless you register a component under that name yourself). Use it as the base for your own error classes by overriding `componentName`, `componentBindings`, `componentBody` and `extraClasses`.

### `ValidationErrorText`

```typescript
new ValidationErrorText('Something went wrong', /* optional CSS classes */)
```

Renders as plain text. Accessible via `.text` and `.classes`.

### `ValidationErrorRenderContent`

```typescript
new ValidationErrorRenderContent(message, /* optional CSS classes */)
```

Accepts a `RenderContentRef`: a `string`, an `MdString` (markdown), a `SimpleComponentDef` object, a `Ref` to any of those, or a function `() => string | MdString | SimpleComponentDef` (useful for reactive or translated messages — the function is evaluated on every render). The same type is used for the `message` parameter of every built-in validator. The consuming UI component reads `componentName`, `componentBindings`, `componentBody` and `extraClasses` to render it.

`SimpleComponentDef`:

| Property | Type | Description |
|----------|------|-------------|
| `componentName` | `string` | Name of a globally registered component (or a plain HTML element name) |
| `componentProps` | `Record<any, any>` | Optional props/bindings passed to the component |
| `componentVHtml` | `string` | Optional body rendered inside the component |

### `MdString`

```typescript
import { MdString } from '@dynamicforms/vue-forms';
new MdString('**bold** error message')
```

Wraps a string to signal that it should be rendered as markdown. Rendering markdown messages requires a globally registered `vue-markdown` component; without it `MessagesWidget` logs a warning and falls back to displaying the raw markdown source.

## Message placeholders

All built-in error messages support `{placeholder}` substitution. The available placeholders depend on the validator:

| Placeholder | Available in |
|-------------|-------------|
| `{newValue}` | all |
| `{oldValue}` | all |
| `{field}` | all |
| `{pattern}` | `Pattern` |
| `{minValue}` | `MinValue`, `ValueInRange` |
| `{maxValue}` | `MaxValue`, `ValueInRange` |
| `{minLength}` | `MinLength`, `LengthInRange` |
| `{maxLength}` | `MaxLength`, `LengthInRange` |
| `{allowedValues}` | `InAllowedValues` |
| `{allowedAsText}` | `InAllowedValues` |
| `{otherField}` | `CompareTo` |

Substitution is purely textual (`String.replaceAll`). Placeholders whose value is an object — `{field}`, `{otherField}`, and `{newValue}`/`{oldValue}` on group/list or object-valued fields — are rendered as `[object Object]`; use a function message (`() => ...`) to read whatever you need off the field instead. Note also that `{allowedValues}` produces `admin,user` while `{allowedAsText}` produces `admin, user` (truncated when longer than 60 characters).

---

> See also: [Validators example](/examples/validators)
