# Validators

Validators are specialized actions that run automatically when a field's value changes. They populate `field.errors` and update `field.valid`.

All built-in validators are available on the `Validators` namespace:

```typescript
import { Validators } from '@dynamicforms/vue-forms';
```

Pass validators to `Field.create()` via the `validators` array, or register them later with `registerAction()`.

## `Validators.Validator(validationFn)`

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

Return `null` or `[]` to indicate no errors. The validator is eager — it runs once immediately at field creation with the initial value.

## Built-in validators

### `Validators.Required(message?)`

Fails when the value is empty (zero-length string, empty array, empty object, or `null`/`undefined`).

```typescript
Field.create({ value: '', validators: [new Validators.Required('This field is required')] })
```

| Parameter | Type | Default |
|-----------|------|---------|
| `message` | `RenderContentRef` | `'Please enter a value'` |

---

### `Validators.Pattern(pattern, message?)`

Fails when the string representation of the value does not match `pattern`.

```typescript
new Validators.Pattern(/^\d{4}$/, 'Must be a 4-digit number')
```

| Parameter | Type | Default |
|-----------|------|---------|
| `pattern` | `RegExp` | required |
| `message` | `RenderContentRef` | `'Value must match pattern "{pattern}"'` |

---

### `Validators.MinValue(minValue, message?)`

Fails when `value < minValue`.

| Parameter | Type | Default |
|-----------|------|---------|
| `minValue` | `T` | required |
| `message` | `RenderContentRef` | `'Value must be larger or equal to {minValue}'` |

---

### `Validators.MaxValue(maxValue, message?)`

Fails when `value > maxValue`.

| Parameter | Type | Default |
|-----------|------|---------|
| `maxValue` | `T` | required |
| `message` | `RenderContentRef` | `'Value must be less than or equal to {maxValue}'` |

---

### `Validators.ValueInRange(minValue, maxValue, message?)`

Fails when `value < minValue` or `value > maxValue`.

```typescript
new Validators.ValueInRange(0, 100, 'Must be between 0 and 100')
```

| Parameter | Type | Default |
|-----------|------|---------|
| `minValue` | `T` | required |
| `maxValue` | `T` | required |
| `message` | `RenderContentRef` | `'Value must be between {minValue} and {maxValue}'` |

---

### `Validators.MinLength(minLength, message?)`

Fails when the length of the value is less than `minLength`. Supports strings, arrays, and plain objects.

| Parameter | Type | Default |
|-----------|------|---------|
| `minLength` | `number` | required |
| `message` | `RenderContentRef` | `'Length must be larger or equal to {minLength}'` |

---

### `Validators.MaxLength(maxLength, message?)`

Fails when the length of the value exceeds `maxLength`.

| Parameter | Type | Default |
|-----------|------|---------|
| `maxLength` | `number` | required |
| `message` | `RenderContentRef` | `'Length must be less than or equal to {maxLength}'` |

---

### `Validators.LengthInRange(minLength, maxLength, message?)`

Fails when the length of the value is outside `[minLength, maxLength]`.

```typescript
new Validators.LengthInRange(10, 200, 'Must be between 10 and 200 characters')
```

| Parameter | Type | Default |
|-----------|------|---------|
| `minLength` | `number` | required |
| `maxLength` | `number` | required |
| `message` | `RenderContentRef` | `'Length must be between {minLength} and {maxLength}'` |

---

### `Validators.InAllowedValues(allowedValues, message?)`

Fails when the value is not in `allowedValues`.

```typescript
new Validators.InAllowedValues(['admin', 'user', 'guest'])
```

| Parameter | Type | Default |
|-----------|------|---------|
| `allowedValues` | `T[]` | required |
| `message` | `RenderContentRef` | `'Must be one of [{allowedAsText}]'` |

---

### `Validators.CompareTo(otherField, isValidComparison, message)`

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
| `message` | `RenderContentRef` | Error message |

## Error types

### `ValidationError`

Base class. Renders as an empty HTML comment. Override `componentName`, `componentBindings`, and `componentBody` for custom rendering.

### `ValidationErrorText`

```typescript
new ValidationErrorText('Something went wrong', /* optional CSS classes */)
```

Renders as plain text. Accessible via `.text` and `.classes`.

### `ValidationErrorRenderContent`

```typescript
new ValidationErrorRenderContent(message, /* optional CSS classes */)
```

Accepts `string`, `MdString` (for markdown), or a `SimpleComponentDef` object. The consuming UI component reads `componentName`, `componentBindings`, and `componentBody` to render it.

### `MdString`

```typescript
import { MdString } from '@dynamicforms/vue-forms';
new MdString('**bold** error message')
```

Wraps a string to signal that it should be rendered as markdown.

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

---

> See also: [Validators example](/examples/validators)
