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

Pass validators when creating a field — `new Field({ validators: [...] })`, `new Group(fields, { validators: [...] })`, `new List(itemTemplate, { validators: [...] })` — or register them later with `registerAction()`.

Each validator only ever replaces its own errors when it re-runs; errors contributed by other validators or added from the outside (e.g. server-side errors) are left untouched.

The same `ValidationError` instance may be returned by more than one validator, whether they sit on one field or on
several. A validator reporting an instance another validator already owns contributes a copy of it, which keeps the
prototype and every own property and therefore renders identically. Each validator withdraws only what it
contributed, so two rules of one field reporting the same instance leave two entries in `field.errors` — report the
message from a single rule if you want it to appear once.

`field.errors` is a reactive array, so what it reads back is a Vue proxy of the error a validator produced rather
than that object itself. Rendering is unaffected — every getter answers through the proxy — but
`field.errors[0] === myError` is `false`. Compare by content, or unwrap with `toRaw()`.

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

**`validationFn` signature** — exported as `ValidationFunction<T>`:
```typescript
type ValidationFunctionResult = ValidationError[] | null;
type ValidationFunction<T = any> = (
  newValue: T,
  oldValue: T,
  field: FieldBase<T>,
) => ValidationFunctionResult | Promise<ValidationFunctionResult>;
```

Return `null` or `[]` to indicate no errors. Import `ValidationFunction` when you write a reusable validation
function separately from the `Validator` that wraps it.

Validators are eager: they run once at field creation, over the value the constructor produced, immediately when
passed to `registerAction()` on an existing field, on every value change, on `field.validate(true)`, and once more
where a run reached no verdict because the record it reads was not assembled yet (see
[Reading a second field](#reading-a-second-field)). A field can therefore be `valid === false` before the user has
interacted with it at all — use `touched` to decide when to actually display the errors.

One validator instance validates every field it is registered on, the clones of that field included, so a validator
on a `List`'s item template validates every row. What it remembers about a field it validated — its run sequence,
and whatever a subclass adds — is held against that field: `protected bindingState(field)` answers with it, and
`protected newBindingState()` is what a subclass overrides to widen it, returning `{ ...super.newBindingState(), … }`.
The exported type of the record `Validator` itself keeps is `ValidatorBindingState`.

### Reading a second field

A rule that reads a second field of the same record — the sibling of a `List` row, the field a `CompareTo`
compares against — can run before that record exists: a row is built member by member, so a member's first
validation happens while it holds neither its siblings nor its row. Reaching nothing there is **no verdict**, not a
pass. Say so with `field.markRecordIncomplete()` and return `null`; the container that completes the record runs
the validator again over the record it then has, and a run that still reaches nothing says so again, so the
container above answers for it.

```typescript
new Validators.Validator((newValue, oldValue, field) => {
  const row = field.parent;
  if (!row) {
    field.markRecordIncomplete();
    return null;
  }
  return row.fields.quantity.value > 0 && newValue == null
    ? [new ValidationErrorText('Unit price is required when quantity is above zero')]
    : null;
});
```

`CompareTo` does this itself, which is why a row that holds the very values its item template holds still carries
the verdict its own fields support.

### Asynchronous validation

When the validation function returns a `Promise`, `field.validating` becomes `true` right away (the field counts the
asynchronous runs it has in flight) and `field.errors` / `field.valid` are updated when the promise settles. UI should
block submit while `validating === true` as well.

Only the newest run of a validator decides that validator's verdict on a field. Every execution takes the next
sequence number for that field, and a result is applied only while its run is still the newest one. A slow run
therefore never overwrites the verdict of a faster run that started after it — the superseded result is
discarded — so a user typing faster than the round trip ends with the verdict for the value that is actually in the
field, and `validating` is back to `false` once every run has settled. Synchronous runs take a number from the same
sequence, so a verdict reached without waiting also supersedes an asynchronous run that is still in flight.

A rejected promise reaches no verdict, and no verdict does not count as a pass:

- if the rejected run is still the current one, this validator's errors on the field are replaced by a single error
  reading `Validation could not be completed`, so the field is invalid while its value is unchecked and a form
  cannot be submitted over it. The message is built with `buildErrorMessage()` at the moment of the rejection, so
  it reads [`useMarkdownInValidators`](/api/config) as it stands then, where a built-in validator captures that
  setting when it is constructed. The error belongs to this validator like any other it contributes: the next
  successful run of the same validator withdraws it. The rejection reason never reaches the user; it is reported
  once as `console.error('Validation failed', reason)`;
- a rejection from a superseded run is discarded silently — no error is placed and nothing is logged.

In both cases the run still counts as finished, so `validating` returns to `false` and the rejection never surfaces as
an unhandled rejection.

Nothing re-runs a validator on its own once the value has settled: assigning the value it already holds is a no-op,
so a failure error survives until something starts a new run. Call `field.validate(true)` — on the field or on the
`Group` above it — to retry after the service is back. The failure message names no cause, because the validator has none to name. When the user
should read something more specific, catch inside the validation function and return an error of your own, e.g.
`[new ValidationErrorRenderContent('Could not verify this value')]`.

[`clearValidators()`](/api/field#methods) also cancels validation that is still in flight: it drops the validators,
empties `field.errors` and recalculates the verdict over the emptied list, and a run that settles afterwards — with a
verdict or with a rejection — can no longer push errors onto the field. A field that was invalid therefore fires
`ValidChangedAction` and the `Group` or `List` holding it re-evaluates its own validity. `field.validationEpoch` is
the read-only counter behind the cancellation — `clearValidators()` increments it, a run captures it when it starts,
and a result whose epoch no longer matches is discarded. The cancelled run still ends its own bookkeeping, so
`validating` returns to `false` when its promise settles.

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
new Field({ value: '', validators: [new Validators.Required('This field is required')] })
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

`{allowedAsText}` is `allowedValues.join(', ')`, computed once in the constructor; when it is longer than 60 characters it is truncated so that the whole substitution — the `... (N items total)` suffix included — is at most 40 characters, cutting at the last `, ` that still fits. The suffix takes about twenty of those characters, so what survives is roughly the first twenty characters of the joined list: twenty values named `value-0` … `value-19` render as `value-0, value-1... (20 items total)`. The full list is available through `{allowedValues}`.

---

### `new Validators.CompareTo(otherField, isValidComparison, message)`

Cross-field validator that re-validates whenever this field **or** the field it compares against changes.

```typescript
new Validators.CompareTo(
  passwordField,
  (myValue, otherValue) => myValue === otherValue,
  'Passwords must match'
)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `otherField` | `CompareToTarget` | The field to compare against: a field, the name its container holds it under, or a callback receiving the field being validated |
| `isValidComparison` | `(myValue: T, otherValue: T) => boolean` | Return `true` when valid |
| `message` | `RenderContentRef` | Error message — required, there is no default |

```typescript
type CompareToTarget = FieldBase | string | ((field: FieldBase) => FieldBase | null | undefined);
```

All three forms answer for the record the validation is running over, which is what makes one validator serve every
row of a `List`: handed the item template's field, a row compares against **that row's** field, and a name is
looked up in the row before the form the list sits in. A field belonging to no record of the validated field's —
one the whole form holds — is compared against as it stands, by every row. Handed a field of an *enclosing* item
template, that is the field itself as well: the rows of a nested list compare against the enclosing template's
field rather than against the field of the enclosing row they sit in. Name it by name to reach that one — the
lookup walks the containers the validated field has, so it finds the enclosing row.

```typescript
const row = new Group({ password: new Field(), confirmation: new Field() });
row.fields.confirmation.registerAction(
  new Validators.CompareTo(row.fields.password, (mine, other) => mine === other, 'Passwords must match'),
);
// every row of new List(row, …) now compares its own two fields

// the same rule written against the name, which needs no reference to the template
new Validators.CompareTo<string>('password', (mine, other) => mine === other, 'Passwords must match');
```

A record that does not hold the compared field yet — a row is validated as it is assembled, before it holds either
of its own fields — makes the validator reach no verdict rather than report a pass. It says so, and the container
that completes the record validates the field again over the record it then has: a row carries the verdict its own
fields support from the moment the row exists, and a name that only the form holding the list answers to is
resolved when the list takes the row into that form. A name nothing ever answers to leaves the field with no
verdict from this validator at all.

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

A message given as a `Ref` or a `computed` keeps its reactivity all the way to the rendered output. The reference is
resolved when the message is read, not when validation runs, and `{placeholder}` substitution happens at that same
moment, so changing what the reference holds changes the displayed message with no need to revalidate the field. This
is what carries the i18n path: pass `computed(() => t('validation.required'))` as the message and a locale switch
retranslates the errors already sitting on the field. A `Ref` holding an `MdString` still renders as markdown, with
its `options` and `plugins` preserved.

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

> See also: [The model](/guide/model#where-validity-comes-from), [Validators example](/examples/validators)
