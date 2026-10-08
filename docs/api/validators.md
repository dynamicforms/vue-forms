# Validators

Validators are specialized actions that run automatically when a field's value changes. They populate `field.errors` and update `field.valid`.

All built-in validators are available on the `Validators` namespace:

```typescript
import { Validators } from '@dynamicforms/vue-forms';
```

The namespace contains the validators and the types that belong to writing one — `Validator`,
`ValidationFunction`, `ValidationFunctionResult`, `ValidatorBindingState`, `ValidationErrorOptions`,
`RequiredOptions`, `Required`, `Pattern`, `MinValue`,
`MaxValue`, `ValueInRange`, `MinLength`, `MaxLength`, `LengthInRange`, `InAllowedValues` and `CompareTo`. The
namespace is the only way to them: a validator is written `Validators.Required`, never `Required`.

`ValidationError` and the error types are what a field hands back rather than what validates it, so they are
exported from the package root:

```typescript
import { ValidationError } from '@dynamicforms/vue-forms';
import { Validators } from '@dynamicforms/vue-forms';

class Even extends Validators.Validator<number> { /* … */ }
```

Pass validators when creating a field — `new Field({ validators: [...] })`, `new Group(fields, { validators: [...] })`, `new List(itemTemplate, { validators: [...] })` — or register them later with `registerAction()`.

Each validator only ever replaces its own errors when it re-runs; errors contributed by other validators or added from the outside (e.g. server-side errors) are left untouched.

The same `ValidationError` instance may be returned by more than one validator, whether they sit on one field or on
several. A validator reporting an instance another validator already owns contributes a copy of it, which keeps the
prototype and every own property, so `sameAs` is true between the two. Each validator withdraws only what it
contributed, so two rules of one field reporting the same instance leave two entries in `field.errors` — report the
message from a single rule if you want it to appear once.

`field.errors` is a reactive array, so what it reads back is a Vue proxy of the error a validator produced rather
than that object itself. Every property reads through the proxy, but `field.errors[0] === myError` is `false`.
Compare with `sameAs`, or unwrap with `toRaw()`.

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

**`validationFn` signature** — exported as `ValidationFunction<T>`:
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

`signal` aborts when the verdict the run would reach stops counting — see [Cancelling a run](#cancelling-a-run).
Hand it to the work the function commissions; a function with nothing to cancel ignores it.

Validators are eager: they run once at field creation, over the value the constructor produced, immediately when
passed to `registerAction()` on an existing field, on every value change, on `field.validate(true)`, and once more
where a run reached no verdict because the record it reads was not assembled yet (see
[`markRecordIncomplete()`](/api/field#markrecordincomplete-void), and
[A rule that reads another field of the record](/guide/cookbook#a-rule-that-reads-another-field-of-the-record)). A field can therefore be `valid === false` before the user has
interacted with it at all — use `touched` to decide when to actually display the errors.

One validator instance validates every field it is registered on, the bindings of that field included, so a validator
on a `List`'s item template validates every row. What it remembers about a field it validated — its run sequence,
and whatever a subclass adds — is held against that field: `protected bindingState(field)` answers with it, and
`protected newBindingState()` is what a subclass overrides to widen it, returning `{ ...super.newBindingState(), … }`.
The exported type of the record `Validator` itself keeps is `ValidatorBindingState`.

### Asynchronous validation

When the validation function returns a `Promise`, `field.validating` becomes `true` right away (the field counts the
asynchronous runs it has in flight) and `field.errors` / `field.valid` are updated when the promise settles. Every
container above the field answers `validating` with `true` for as long as the run is in flight, so a form asks
itself rather than walking its fields, and `busy` on the form is the same answer with the `Action.execute()` runs
below it included. UI should block submit while either is `true` as well.

Only the newest run of a validator decides that validator's verdict on a field. Every execution takes the next
sequence number for that field, and a result is applied only while its run is still the newest one. A slow run
therefore never overwrites the verdict of a faster run that started after it — the superseded result is
discarded — so a user typing faster than the round trip ends with the verdict for the value that is actually in the
field, and `validating` is back to `false` once every run has settled. Synchronous runs take a number from the same
sequence, so a verdict reached without waiting also supersedes an asynchronous run that is still in flight.

A rejected promise reaches no verdict, and no verdict does not count as a pass:

- if the rejected run is still the current one, this validator's errors on the field are replaced by a single error
  reading `Validation could not be completed`, so the field is invalid while its value is unchecked and a form
  cannot be submitted over it. The error has the code `validation_failed` and no params. The error belongs to this validator like any other it contributes: the next
  successful run of the same validator withdraws it. The rejection reason never reaches the user; it is reported
  once as `console.error('Validation failed', reason)`;
- a rejection from a superseded run is discarded silently — no error is placed and nothing is logged.

In both cases the run still counts as finished, so `validating` returns to `false` and the rejection never surfaces as
an unhandled rejection.

Nothing re-runs a validator on its own once the value has settled: assigning the value it already holds is a no-op,
so a failure error survives until something starts a new run. Call `field.validate(true)` — on the field or on the
`Group` above it — to retry after the service is back. The failure message names no cause, because the validator has none to name. When the user
should read something more specific, catch inside the validation function and return an error of your own, e.g.
`[new ValidationError('unverified', {}, 'Could not verify this value')]`.

[`clearValidators()`](/api/field#methods) also cancels validation that is still in flight: it drops the validators,
empties `field.errors` and recalculates the verdict over the emptied list, and a run that settles afterwards — with a
verdict or with a rejection — can no longer push errors onto the field. A field that was invalid therefore fires
`ValidChangedAction` and the `Group` or `List` holding it re-evaluates its own validity. `field.validationEpoch` is
the read-only counter behind the cancellation — `clearValidators()` increments it, a run captures it when it starts,
and a result whose epoch no longer matches is discarded. The signal the cancelled run was handed aborts with it,
so a check that honours it stops there, and the run still ends its own bookkeeping: `validating` returns to `false`
when its promise settles. Inside a transaction the epoch and the cancellation are both taken back by a rollback,
and the run reaches the verdict the field is then owed.

### Cancelling a run

The fourth argument a validation function receives is an `AbortSignal`. It aborts the moment the verdict the run
would reach stops counting:

- a newer run of the same validator over the same field has started, so this one is superseded;
- the field no longer carries this validator — `unregisterAction()` or `clearValidators()` took it off, and that
  removal stands: inside a [transaction](/api/transactions) the cancellation waits for the commit, so a rollback
  that puts the validator back leaves the run going and the verdict it reaches counts;
- the transaction the run started in was rolled back, so the value it is examining is one the form never went on
  to hold.

Hand it to the work the function commissions and that work stops as soon as its answer is worth nothing:

```typescript
new Validators.Validator(async (newValue, oldValue, field, signal) => {
  const response = await fetch(`/api/available?name=${newValue}`, { signal });
  return (await response.json()).free ? null : [new ValidationError('name_taken', {}, 'This name is taken')];
});
```

A cancelled run reaches no verdict at all: neither errors it returns nor a rejection it ends with is applied, so a
`fetch` rejecting with `AbortError` places nothing on the field and logs nothing. A validation function that
ignores the signal runs to the end and its result is discarded when it arrives. Either way the run ends its own
bookkeeping, so `validating` returns to `false` once its promise settles.

## Built-in validators

A built-in validator reports a [`ValidationError`](#validationerror) with its [code](#error-codes), its params and an
English detail, the default shown for each validator below with the params substituted. The last constructor
argument of every built-in validator is `ValidationErrorOptions`:

```typescript
interface ValidationErrorOptions {
  code?: string;   // replaces the validator's code
  detail?: string; // replaces the validator's detail; {name} placeholders are replaced with the params
}
```

The params stay the validator's own. A `{name}` placeholder that names no param stays in the detail as written. The
application renders the error; see [Error messages and translation](/guide/getting-started#error-messages-and-translation).

`InAllowedValues`, `MinValue`, `MaxValue`, `ValueInRange` and `CompareTo` take a type argument, which types a
constructor argument or a callback. The others take none: `new Validators.Required()`, `new Validators.Pattern(…)`,
`new Validators.MinLength(…)`, `new Validators.MaxLength(…)` and `new Validators.LengthInRange(…)` measure whatever
the field holds.

### `new Validators.Required(options?)`

Fails when the value is empty (zero-length string, empty array, empty plain object, or `null`/`undefined`). A
string is trimmed before it is measured, so a value of spaces alone is no value and the field is invalid. Only
strings are trimmed; an array, an object or any other value is measured as it stands.

```typescript
new Field({ value: '', validators: [new Validators.Required({ code: 'name_required', detail: 'Enter a name' })] })

// where the spaces are part of what the field holds
new Field({ value: ' ', validators: [new Validators.Required({ trim: false })] })
```

```typescript
interface RequiredOptions extends ValidationErrorOptions {
  trim?: boolean;
}
```

`RequiredOptions` is exported.

| Parameter | Type | Default |
|-----------|------|---------|
| `options.trim` | `boolean` | `true` |
| `options.code` | `string` | `'required'` |
| `options.detail` | `string` | `'Please enter a value'` |

---

### `new Validators.Pattern(pattern, options?)`

Fails when the string representation of the value does not match `pattern`. The value is converted with `String(value)` before testing, so `undefined` is tested as the string `"undefined"`. The `{pattern}` placeholder is replaced with the whole regex literal, including slashes and flags (`/^\d{4}$/`). Avoid the `g` flag — `RegExp.test` keeps `lastIndex` between calls with it.

```typescript
new Validators.Pattern(/^\d{4}$/, { detail: 'Must be a 4-digit number' })
```

| Parameter | Type | Default |
|-----------|------|---------|
| `pattern` | `RegExp` | required |
| `options` | `ValidationErrorOptions` | code `pattern`, detail `'Value must match pattern "{pattern}"'` |

---

### `new Validators.MinValue(minValue, options?)`

Fails when `value < minValue`, and also when the value is `undefined` (the check is strictly `=== undefined`, so `null` is not caught by it). For optional fields register the validator conditionally or write your own `Validator`.

| Parameter | Type | Default |
|-----------|------|---------|
| `minValue` | `T` | required |
| `options` | `ValidationErrorOptions` | code `min_value`, detail `'Value must be larger or equal to {minValue}'` |

---

### `new Validators.MaxValue(maxValue, options?)`

Fails when `value > maxValue`, and also when the value is `undefined` (the check is strictly `=== undefined`, so `null` is not caught by it). For optional fields register the validator conditionally or write your own `Validator`.

| Parameter | Type | Default |
|-----------|------|---------|
| `maxValue` | `T` | required |
| `options` | `ValidationErrorOptions` | code `max_value`, detail `'Value must be less than or equal to {maxValue}'` |

---

### `new Validators.ValueInRange(minValue, maxValue, options?)`

Fails when `value < minValue` or `value > maxValue`, and also when the value is `undefined` (the check is strictly `=== undefined`, so `null` is not caught by it). For optional fields register the validator conditionally or write your own `Validator`.

```typescript
new Validators.ValueInRange(0, 100, { detail: 'Must be between 0 and 100' })
```

| Parameter | Type | Default |
|-----------|------|---------|
| `minValue` | `T` | required |
| `maxValue` | `T` | required |
| `options` | `ValidationErrorOptions` | code `value_in_range`, detail `'Value must be between {minValue} and {maxValue}'` |

---

### `new Validators.MinLength(minLength, options?)`

Fails when the length of the value is less than `minLength`. Supports strings, arrays, and plain objects.

| Parameter | Type | Default |
|-----------|------|---------|
| `minLength` | `number` | required |
| `options` | `ValidationErrorOptions` | code `min_length`, detail `'Length must be larger or equal to {minLength}'` |

---

### `new Validators.MaxLength(maxLength, options?)`

Fails when the length of the value exceeds `maxLength`.

| Parameter | Type | Default |
|-----------|------|---------|
| `maxLength` | `number` | required |
| `options` | `ValidationErrorOptions` | code `max_length`, detail `'Length must be less than or equal to {maxLength}'` |

---

### `new Validators.LengthInRange(minLength, maxLength, options?)`

Fails when the length of the value is outside `[minLength, maxLength]`.

```typescript
new Validators.LengthInRange(10, 200, { detail: 'Must be between 10 and 200 characters' })
```

| Parameter | Type | Default |
|-----------|------|---------|
| `minLength` | `number` | required |
| `maxLength` | `number` | required |
| `options` | `ValidationErrorOptions` | code `length_in_range`, detail `'Length must be between {minLength} and {maxLength}'` |

---

### `new Validators.InAllowedValues(allowedValues, options?)`

Fails when the value is not in `allowedValues`.

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

`AllowedValues<T>` is exported. The list is read at each validation rather than at construction, so a reference or
a callback answers with the list in force then, and that list is both the one the value is measured against and
the one the error names. The read happens inside the validation run, which is no reactive effect, so a
list that changes does not revalidate the fields on its own — call `field.validate(true)` where they are to be
measured against the new list at once.

The params carry the list as `allowedValues`, so an application names the values in its own language. `allowedAsText`
is `join(', ')` over the list the run read; when it is longer than 60 characters it is truncated so that the whole substitution — the `... (N items total)` suffix included — is at most 40 characters, cutting at the last `, ` that still fits. The suffix takes about twenty of those characters, so what survives is roughly the first twenty characters of the joined list: twenty values named `value-0` … `value-19` give `value-0, value-1... (20 items total)`. The full list is in `allowedValues`.

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
  new Validators.CompareTo(row.fields.password, (mine, other) => mine === other, { detail: 'Passwords must match' }),
);
// every row of new List(row, …) now compares its own two fields

// the same rule written against the name, which needs no reference to the template
new Validators.CompareTo<string>('password', (mine, other) => mine === other, { detail: 'Passwords must match' });
```

A record that does not hold the compared field yet — a row is validated as it is assembled, before it holds either
of its own fields — makes the validator reach no verdict rather than report a pass. It says so, and the container
that completes the record validates the field again over the record it then has: a row carries the verdict its own
fields support from the moment the row exists, and a name that only the form holding the list answers to is
resolved when the list takes the row into that form. A name nothing ever answers to leaves the field with no
verdict from this validator at all.

## Error types

### Error codes

`error.code` is a snake_case identifier of what failed. A program matches on it to react to one particular failure,
and a renderer looks the text of the error up by it.

```typescript
const missing = field.errors.filter((error) => error.code === 'required');
```

`error.params` holds the values the failure is stated with; it is an empty object where the error states none. The
codes the library states, with their params and the English detail:

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

`{name}` substitution is textual (`String.replaceAll`): a value that is an object, such as `newValue` of a group,
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
| `params` | The values the failure is stated with |
| `detail` | The failure in English, plain text. The constructor stores it as given; the built-in validators substitute the params before they construct the error |
| `origin` | Where the error comes from; see below |

The shape is that of an error a `@dynamicforms/fastapi-viewsets` server returns (`detail_code`, `detail_params`,
`detail`), so one function renders the errors of validators and of the server:

```typescript
const body = await response.json(); // { detail, detail_code?, detail_params? }
field.errors.push(new ValidationError(body.detail_code ?? 'server_error', body.detail_params ?? {}, body.detail, 'server'));
```

#### `sameAs(other): boolean`

True where `other` has the same class, `code`, `params` (deep equality), `detail` and stated origin. When a validator
re-runs and produces an error for which `sameAs` is true against one it already contributed, the field keeps the
instance it has. A changed param, such as `newValue`, gives a new instance.

#### `origin`

```typescript
type ErrorOrigin = 'validator' | 'server' | 'application' | (string & {});
```

`'validator'` for an error a validator produced, `'server'` for one the server returned, and `'application'` for one
the application's own code computed and wrote into `errors`. An origin given as the last constructor argument
stands; where none is given, an error a validator hands the field is `'validator'` and any other is `'application'`.
Any other string is an origin of the application's own.

The library does not read the origin. A rendering layer reads it to decide when to show an error, and code reads it
to withdraw the errors of one origin and leave the others, as
[Showing errors the server returned](/guide/cookbook#showing-errors-the-server-returned) does.

```typescript
field.errors.push(new ValidationError('name_taken', {}, 'This name is taken', 'server'));
```

---

> See also: [The model](/guide/model#where-validity-comes-from), [Validators example](/examples/validators)
