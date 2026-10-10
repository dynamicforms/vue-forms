# Validators

Validators are specialized actions that run automatically when a field's value changes. They populate `field.errors` and update `field.valid`.

All built-in validators are available on the `Validators` namespace:

```typescript
import { Validators } from '@dynamicforms/vue-forms';
```

The namespace contains the validators and the types used to write one: `Validator`, `ValidationFunction`,
`ValidationFunctionResult`, `ValidatorBindingState`, `ValidationErrorOptions`, `RequiredOptions`, `AllowedValues`,
`CompareToTarget`, `Required`, `Pattern`, `MinValue`, `MaxValue`, `ValueInRange`, `MinLength`, `MaxLength`,
`LengthInRange`, `InAllowedValues` and `CompareTo`. They are exported only through the namespace: a validator is
written `Validators.Required`, never `Required`.

`ValidationError` and the error types describe a field's errors, not its validation, and are exported from the
package root:

```typescript
import { ValidationError } from '@dynamicforms/vue-forms';
import { Validators } from '@dynamicforms/vue-forms';

class Even extends Validators.Validator<number> { /* … */ }
```

Pass validators when creating an element (`new Field({ validators: [...] })`, `new Group(fields, { validators: [...] })`, `new List(itemTemplate, { validators: [...] })`) or register them later with `registerAction()`.

When a validator re-runs, it replaces only its own errors; errors added by other validators or from outside (e.g. server-side errors) are left unchanged.

The same `ValidationError` instance may be returned by more than one validator, on one field or on several. A
validator that returns an instance owned by another validator adds a copy of it, which keeps the prototype and
every own property, so `sameAs` is true between the two. Each validator removes only the errors it added, so two
validators of one field returning the same instance leave two entries in `field.errors`. Return the error from a
single validator for it to appear once.

`field.errors` is a reactive array, so its entries are Vue proxies of the errors a validator produced. Every
property reads through the proxy, but `field.errors[0] === myError` is `false`. Compare with `sameAs`, or unwrap
with `toRaw()`.

## `new Validators.Validator(validationFn)`

Base class for custom validators. Extend it or instantiate it directly for one-off rules.

```typescript
import { Validators, ValidationError } from '@dynamicforms/vue-forms';

const myValidator = new Validators.Validator(async (newValue, oldValue, field) => {
  if (newValue === 'forbidden') {
    return [new ValidationError('forbidden', {}, 'This value is not allowed')];
  }
  return null; // no errors
});
```

**`validationFn` signature**, exported as `ValidationFunction<T>`:
```typescript
type ValidationFunctionResult = ValidationError[] | null;
type ValidationFunction<T = any> = (
  newValue: T,
  oldValue: T,
  field: FieldBase<T>,
  signal: AbortSignal,
) => ValidationFunctionResult | Promise<ValidationFunctionResult>;
```

Return `null` or `[]` to indicate no errors. Import `ValidationFunction` when you write a reusable validation
function separately from the `Validator` that wraps it.

`signal` aborts when the run's result would no longer be applied; see [Cancelling a run](#cancelling-a-run).
Pass it to the work the function starts; a function with nothing to cancel ignores it.

Validators are eager: they run once at field creation, over the value the constructor produced, immediately when
passed to `registerAction()` on an existing field, on every value change, on `field.validate(true)`, and once more
where a run produced no result because the record it reads was not assembled yet (see
[`markRecordIncomplete()`](/api/field-base#markrecordincomplete-void), and
[A rule that reads another field of the record](/guide/cookbook#a-rule-that-reads-another-field-of-the-record)). A field can therefore be `valid === false` before the user has
interacted with it. Use `touched` to decide when to display the errors.

One validator instance validates every element it is registered on, including that element's bindings, so a
validator on a `List`'s item template validates every row. Its per-element state (the run sequence, and whatever a
subclass adds) is stored per element: `protected bindingState(field)` returns it, and a subclass overrides
`protected newBindingState()` to extend it, returning `{ ...super.newBindingState(), … }`. The exported type of the
state `Validator` itself stores is `ValidatorBindingState`.

`protected errorFor(options, code, detail, params)` returns the `ValidationError` a validator reports where it takes
`ValidationErrorOptions` as the built-in ones do: the `code` and `detail` from `options` where they are set, else
`code` and `detail`, with each `{name}` placeholder of the detail that names a key of `params` replaced by that
param, in one pass.

```typescript
class Even extends Validators.Validator<number> {
  constructor(options?: Validators.ValidationErrorOptions) {
    super((value) =>
      value == null || value % 2 === 0 ? null : [this.errorFor(options, 'even', 'Value must be even', {})],
    );
  }
}
```

### Asynchronous validation

When the validation function returns a `Promise`, `field.validating` becomes `true` immediately (the field counts
its pending asynchronous runs) and `field.errors` / `field.valid` are updated when the promise settles. Every
container above the field reads `validating` as `true` while the run is pending, so a form reads its own
`validating` without iterating its fields. `busy` covers the pending `Action.execute()` runs below the form and does
not include validation. `pending` is `true` while either is: the UI blocks submit on it, and `settled()` is the
promise that resolves when it turns `false`.

Only the newest run of a validator determines that validator's result on a field. Every run takes the next
sequence number for that field, and a result is applied only while its run is the newest one. A slow run therefore
never overwrites the result of a faster run that started after it; the superseded result is discarded. When the
user types faster than the round trip, the final result is the one for the value currently in the field, and
`validating` returns to `false` once every run has settled. Synchronous runs take a number from the same sequence,
so a synchronous result also supersedes a pending asynchronous run.

A rejected promise produces no result, and the field is not treated as valid:

- if the rejected run is the current one, this validator's errors on the field are replaced by one error with the
  detail `Validation could not be completed`, the code `validation_failed` and no params. The field is invalid
  until a later run of the validator succeeds, so the form cannot be submitted. The error belongs to this validator like any
  other error it adds: the next successful run of the same validator removes it. The rejection reason is not shown
  to the user; it is logged once as `console.error('Validation failed', reason)`;
- a rejection from a superseded run is discarded: no error is added and nothing is logged.

In both cases the run counts as finished, so `validating` returns to `false`, and the rejection is not reported as an
unhandled rejection.

A validator does not re-run by itself once the value is unchanged: assigning the value the field already holds is
a no-op, so the `validation_failed` error remains until a new run starts. Call `field.validate(true)` (on the field
or on the `Group` above it) to retry once the service is available. The failure message names no cause. For a more
specific message, catch inside the validation function and return a custom error, e.g.
`[new ValidationError('unverified', {}, 'Could not verify this value')]`.

[`clearValidators()`](/api/field-base#clearvalidators-void) also cancels pending validation: it removes the validators, empties
`field.errors` and recomputes validity over the empty list, and a run that settles afterwards (resolved or rejected)
does not add errors to the field. A field that was invalid therefore fires `ValidChangedAction`, and the `Group` or
`List` holding it recomputes its own validity. An internal counter of the field's validators implements the
cancellation: `clearValidators()` increments it, a run reads it when it starts, and a result whose counter value no
longer matches is discarded. The cancelled run's signal aborts, so work that checks it stops; the run still completes its
own bookkeeping, and `validating` returns to `false` when its promise settles. Inside a transaction, a rollback
restores both the counter and the cancelled run, and the run's result is applied to the field.

### Cancelling a run

The fourth argument of a validation function is an `AbortSignal`. It aborts as soon as the run's result would no
longer be applied:

- a newer run of the same validator over the same field has started, so this one is superseded;
- the field no longer has this validator: `unregisterAction()` or `clearValidators()` removed it and the removal
  is committed. Inside a [transaction](/api/transactions) the cancellation runs at commit, so a rollback that
  restores the validator leaves the run going and its result applies;
- the transaction the run started in was rolled back, so the value it examines was never committed.

Pass it to the work the function starts, so that work stops when its result is no longer needed:

```typescript
new Validators.Validator(async (newValue, oldValue, field, signal) => {
  const response = await fetch(`/api/available?name=${newValue}`, { signal });
  return (await response.json()).free ? null : [new ValidationError('name_taken', {}, 'This name is taken')];
});
```

A cancelled run produces no result: neither the errors it returns nor its rejection is applied, so a `fetch`
rejecting with `AbortError` adds no error to the field and logs nothing. A validation function that ignores the
signal runs to completion and its result is discarded. In both cases the run completes its own bookkeeping, so
`validating` returns to `false` once its promise settles.

## Built-in validators

A built-in validator returns a [`ValidationError`](#validationerror) with its [code](#error-codes), its params and an
English detail, whose default is shown for each validator below, with the params substituted. The last constructor
argument of every built-in validator is `ValidationErrorOptions`:

```typescript
type ValidationErrorOptions =
  | { code?: string }                  // replaces the validator's code
  | { code: string; detail?: string }; // a detail, which replaces the validator's detail, requires a code
```

`{name}` placeholders in `detail` are replaced with the params. A renderer chooses the text by the error's code and
falls back to `detail`, so a detail under the validator's own code would not be shown where the renderer has a text
for that code: `{ detail }` without `code` does not compile.

The options do not change the params. A `{name}` placeholder that names no param stays in the detail unchanged. The
application renders the error; see [Error messages and translation](/guide/getting-started#error-messages-and-translation).

**Empty values.** Every built-in validator except `Required` and `CompareTo` passes an empty value: `null`,
`undefined`, an empty string, an empty array or an empty plain object. Refusing an empty value is `Required`'s job, so
an optional field carries only the other validators and a mandatory one adds `Required`:

```typescript
new Field({ value: null, validators: [new Validators.MinValue(18)] });                             // valid while empty
new Field({ value: null, validators: [new Validators.Required(), new Validators.MinValue(18)] });  // invalid while empty
```

`InAllowedValues`, `MinValue`, `MaxValue`, `ValueInRange` and `CompareTo` take a type argument, which types a
constructor argument or a callback. The others take none: `new Validators.Required()`, `new Validators.Pattern(…)`,
`new Validators.MinLength(…)`, `new Validators.MaxLength(…)` and `new Validators.LengthInRange(…)` measure any value
the field holds.

### `new Validators.Required(options?)`

Fails when the value is empty (zero-length string, empty array, empty `Map` or `Set`, a plain object or an object
without a prototype with no own keys, or `null`/`undefined`). A
string is trimmed before it is measured, so a value of only spaces is empty and the field is invalid. Only strings
are trimmed; an array, an object or any other value is measured unchanged.

```typescript
new Field({ value: '', validators: [new Validators.Required({ code: 'name_required', detail: 'Enter a name' })] })

// where the spaces are part of what the field holds
new Field({ value: ' ', validators: [new Validators.Required({ trim: false })] })
```

```typescript
type RequiredOptions = ValidationErrorOptions & {
  trim?: boolean;
};
```

`RequiredOptions` is exported.

| Parameter | Type | Default |
|-----------|------|---------|
| `options.trim` | `boolean` | `true` |
| `options.code` | `string` | `'required'` |
| `options.detail` | `string` | `'Please enter a value'` |

---

### `new Validators.Pattern(pattern, options?)`

Fails when the string representation of a non-empty value does not match `pattern`; the value is converted with `String(value)` before testing. The `{pattern}` placeholder is replaced with the whole regex literal, including slashes and flags (`/^\d{4}$/`). The validator tests with a copy of `pattern` without the `g` and `y` flags, so every value is tested from its start, and the expression passed in is not modified.

```typescript
new Validators.Pattern(/^\d{4}$/, { code: 'pin_format', detail: 'Must be a 4-digit number' })
```

| Parameter | Type | Default |
|-----------|------|---------|
| `pattern` | `RegExp` | required |
| `options` | `ValidationErrorOptions` | code `pattern`, detail `'Value must match pattern "{pattern}"'` |

---

### `new Validators.MinValue(minValue, options?)`

Fails when a non-empty value is smaller than `minValue`, or cannot be compared with it. A number is compared with a number, a bigint with a bigint, a string with a string (by code unit) and a date with a date (by time). A value of another type, `NaN` and an invalid date cannot be compared with the bound and fail.

| Parameter | Type | Default |
|-----------|------|---------|
| `minValue` | `T` | required |
| `options` | `ValidationErrorOptions` | code `min_value`, detail `'Value must be larger or equal to {minValue}'` |

---

### `new Validators.MaxValue(maxValue, options?)`

Fails when a non-empty value is larger than `maxValue`, or cannot be compared with it. A number is compared with a number, a bigint with a bigint, a string with a string (by code unit) and a date with a date (by time). A value of another type, `NaN` and an invalid date cannot be compared with the bound and fail.

| Parameter | Type | Default |
|-----------|------|---------|
| `maxValue` | `T` | required |
| `options` | `ValidationErrorOptions` | code `max_value`, detail `'Value must be less than or equal to {maxValue}'` |

---

### `new Validators.ValueInRange(minValue, maxValue, options?)`

Fails when a non-empty value is smaller than `minValue` or larger than `maxValue`, or cannot be compared with either. A number is compared with a number, a bigint with a bigint, a string with a string (by code unit) and a date with a date (by time). A value of another type, `NaN` and an invalid date cannot be compared with the bound and fail.

```typescript
new Validators.ValueInRange(0, 100, { code: 'percent_range', detail: 'Must be between 0 and 100' })
```

| Parameter | Type | Default |
|-----------|------|---------|
| `minValue` | `T` | required |
| `maxValue` | `T` | required |
| `options` | `ValidationErrorOptions` | code `value_in_range`, detail `'Value must be between {minValue} and {maxValue}'` |

---

### `new Validators.MinLength(minLength, options?)`

Fails when the length of a non-empty value is less than `minLength`. Supports strings, arrays, and plain objects.

| Parameter | Type | Default |
|-----------|------|---------|
| `minLength` | `number` | required |
| `options` | `ValidationErrorOptions` | code `min_length`, detail `'Length must be larger or equal to {minLength}'` |

---

### `new Validators.MaxLength(maxLength, options?)`

Fails when the length of a non-empty value exceeds `maxLength`.

| Parameter | Type | Default |
|-----------|------|---------|
| `maxLength` | `number` | required |
| `options` | `ValidationErrorOptions` | code `max_length`, detail `'Length must be less than or equal to {maxLength}'` |

---

### `new Validators.LengthInRange(minLength, maxLength, options?)`

Fails when the length of a non-empty value is outside `[minLength, maxLength]`.

```typescript
new Validators.LengthInRange(10, 200, { code: 'bio_length', detail: 'Must be between 10 and 200 characters' })
```

| Parameter | Type | Default |
|-----------|------|---------|
| `minLength` | `number` | required |
| `maxLength` | `number` | required |
| `options` | `ValidationErrorOptions` | code `length_in_range`, detail `'Length must be between {minLength} and {maxLength}'` |

---

### `new Validators.InAllowedValues(allowedValues, options?)`

Fails when a non-empty value is not in `allowedValues`.

```typescript
new Validators.InAllowedValues(['admin', 'user', 'guest'])

// a list that is filled in after the validator is built
const roles = ref<string[]>([]);
new Validators.InAllowedValues(roles);

// or one another field's value leaves open
new Validators.InAllowedValues(() => rolesFor(department.value))
```

| Parameter | Type | Default |
|-----------|------|---------|
| `allowedValues` | `AllowedValues<T>` (`T[] \| Ref<T[]> \| (() => T[])`) | required |
| `options` | `ValidationErrorOptions` | code `in_allowed_values`, detail `'Must be one of [{allowedAsText}]'` |

`AllowedValues<T>` is exported. The list is read at each validation, not at construction, so a ref or a callback
provides the current list, and that list is used both for the check and in the error. The read happens inside the
validation run, which is not a reactive effect, so a change to the list does not revalidate the fields. Call
`field.validate(true)` to check them against the new list immediately.

The params contain the list as `allowedValues`, so an application can name the values in its own language.
`allowedAsText` is `join(', ')` over the list the run read; when it is longer than 60 characters it is truncated so
that the whole substitution, including the `... (N items total)` suffix, is at most 40 characters, cut at the last
`, ` that fits. The suffix takes about twenty of those characters, so roughly the first twenty characters of the
joined list remain: twenty values named `value-0` … `value-19` give `value-0, value-1... (20 items total)`. The full
list is in `allowedValues`.

---

### `new Validators.CompareTo(otherField, isValidComparison, options?)`

Cross-field validator that re-validates whenever this field **or** the field it compares against changes.

```typescript
new Validators.CompareTo(
  passwordField,
  (myValue, otherValue) => myValue === otherValue,
  { code: 'passwords_differ', detail: 'Passwords must match' },
)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `otherField` | `CompareToTarget` | The field to compare against: a field, the name its container holds it under, or a callback receiving the field being validated |
| `isValidComparison` | `(myValue: T, otherValue: T) => boolean` | Return `true` when valid |
| `options` | `ValidationErrorOptions` | code `compare_to`, detail `'Value does not match the comparison with {otherValue}'` |

```typescript
type CompareToTarget = FieldBase | string | ((field: FieldBase) => FieldBase | null | undefined);
```

All three forms resolve against the record being validated, so one validator serves every row of a `List`: given
the item template's field, a row compares against **that row's** field, and a name is looked up in the row before
the form that holds the list. A field outside every record of the validated field (one held by the form itself) is
compared against directly, by every row. A field of an *enclosing* item template is also compared against
directly: the rows of a nested list compare against the enclosing item template's field, not against the field of
the enclosing row. To reach the enclosing row's field, pass its name: the lookup walks the validated field's
containers, so it finds the enclosing row.

```typescript
const row = new Group({ password: new Field(), confirmation: new Field() });
row.fields.confirmation.registerAction(
  new Validators.CompareTo(row.fields.password, (mine, other) => mine === other, { code: 'passwords_differ', detail: 'Passwords must match' }),
);
// every row of new List(row, …) now compares its own two fields

// the same rule written against the name, which needs no reference to the template
new Validators.CompareTo<string>('password', (mine, other) => mine === other, { code: 'passwords_differ', detail: 'Passwords must match' });
```

When the record does not yet hold the compared field (a row is validated while it is assembled, before it holds
its own fields), the validator produces no result and calls `markRecordIncomplete()`. The container that completes
the record validates the field again over the completed record: a row has the validity its own fields determine
as soon as the row exists, and a name that resolves only in the form holding the list is resolved when the
list adds the row to that form. A name that never resolves leaves the field with no result from this validator.

## Error types

### Error codes

`error.code` is a snake_case identifier of what failed. Code matches on it to handle a particular failure, and a
renderer uses it to look up the error text.

```typescript
const missing = field.errors.filter((error) => error.code === 'required');
```

`error.params` holds the values that describe the failure; it is an empty object where there are none. The codes
the library uses, with their params and the English detail:

| Code | Raised by | Params | English detail |
|------|-----------|--------|----------------|
| `required` | `Required` | `newValue`, `oldValue` | `Please enter a value` |
| `pattern` | `Pattern` | `newValue`, `oldValue`, `pattern` | `Value must match pattern "{pattern}"` |
| `min_value` | `MinValue` | `newValue`, `oldValue`, `minValue` | `Value must be larger or equal to {minValue}` |
| `max_value` | `MaxValue` | `newValue`, `oldValue`, `maxValue` | `Value must be less than or equal to {maxValue}` |
| `value_in_range` | `ValueInRange` | `newValue`, `oldValue`, `minValue`, `maxValue` | `Value must be between {minValue} and {maxValue}` |
| `min_length` | `MinLength` | `newValue`, `oldValue`, `minLength` | `Length must be larger or equal to {minLength}` |
| `max_length` | `MaxLength` | `newValue`, `oldValue`, `maxLength` | `Length must be less than or equal to {maxLength}` |
| `length_in_range` | `LengthInRange` | `newValue`, `oldValue`, `minLength`, `maxLength` | `Length must be between {minLength} and {maxLength}` |
| `in_allowed_values` | `InAllowedValues` | `newValue`, `oldValue`, `allowedValues`, `allowedAsText` | `Must be one of [{allowedAsText}]` |
| `compare_to` | `CompareTo` | `newValue`, `oldValue`, `otherValue` | `Value does not match the comparison with {otherValue}` |
| `validation_failed` | a rejected validation promise | none | `Validation could not be completed` |

`{name}` substitution is textual and runs in one pass, so a substituted value that contains a placeholder is not
substituted again: a value that is an object, such as `newValue` of a group,
is substituted as `[object Object]`, and `allowedValues` as `admin,user`. A renderer that needs the value reads it
from `params`.

### `ValidationError`

```typescript
new ValidationError(code: string, params: Record<string, unknown>, detail: string, origin?: ErrorOrigin)
```

An error a field carries. The library does not render it; a renderer chooses its text from `code` and `params` and
falls back to `detail`. It implements `ErrorDescription`:

```typescript
interface ErrorDescription {
  readonly code: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly detail: string;
  readonly origin: ErrorOrigin;
}
```

| Member | Description |
|--------|-------------|
| `code` | Machine-readable identifier of what failed, in snake_case |
| `detail` | The failure in English, plain text. The constructor stores it as given; the built-in validators substitute the params before they construct the error |
| `origin` | Where the error comes from; see below |
| `params` | The values that describe the failure |

An error the application builds from a server's response carries the same `code`, `params` and `detail`, so one
function renders the errors of validators and of the server. The origin is not part of the response: the
application sets `'server'` when it builds the error.

```typescript
// code, params and detail as the server's response states them for the field
field.errors.push(new ValidationError(code, params, detail, 'server'));
```

#### `sameAs(other): boolean`

True where `other` has the same class, `code`, `params` (deep equality), `detail` and explicit origin. When a
validator re-runs and produces an error for which `sameAs` is true against one it already added, the field keeps
the existing instance. A changed param, such as `newValue`, gives a new instance.

#### `origin`

```typescript
type ErrorOrigin = 'validator' | 'server' | 'application' | (string & {});
```

`'validator'` for an error a validator produced, `'server'` for one built from a server's response, and `'application'` for one
the application's own code computed and wrote into `errors`. An origin passed as the last constructor argument
is used as is; where none is passed, an error returned by a validator is `'validator'` and any other is
`'application'`. Any other string is an application-defined origin.

The library does not read the origin. A rendering layer reads it to decide when to show an error, and code reads it
to withdraw the errors of one origin and leave the others, as
[Showing errors the server returned](/guide/cookbook#showing-errors-the-server-returned) does.

```typescript
field.errors.push(new ValidationError('name_taken', {}, 'This name is taken', 'server'));
```

---

> See also: [The model](/guide/model#where-validity-comes-from), [Validators example](/examples/validators)
