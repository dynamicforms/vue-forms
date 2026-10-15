# Validators Example

Fields with [validators](/api/validators), and errors rendered by the application.

## Demo

A form validated by the built-in validators, an asynchronous validator and a `CompareTo` between two fields. A field
shows its errors once it is touched. The application renders the errors itself:
[translated](#translated-messages-in-this-demo) into eight languages and with or without markdown. The errors already
on the fields follow either choice without revalidating.

<ValidatorsFormDemo />

## Source Code

<<< @/components/validators-demo.vue

### Translations

The demo's text lives in `validators-demo.messages.json`, one block per language: `errors` keyed by error code,
`roles` keyed by the stored role, and `ui` for the demo's own labels. `errors` holds the codes of the built-in
validators and the demo's own codes, `invalid_email`, `email_taken` and `emails_differ`. An excerpt:

```json
{
  "sl": {
    "errors": {
      "required": "Prosimo, vnesite vrednost",
      "value_in_range": "Vrednost mora biti med {minValue} in {maxValue}",
      "in_allowed_values": "Mora biti ena od [{allowedAsText}]",
      "length_in_range": "Dolžina mora biti med {minLength} in {maxLength}",
      "invalid_email": "Vnesite veljaven e-poštni naslov",
      "emails_differ": "E-poštna naslova se ne ujemata",
      …
    },
    "roles": {
      "admin": "Skrbnik",
      "user": "Uporabnik",
      "guest": "Gost"
    },
    "ui": {
      "title": "Demo validatorjev",
      "username": "Uporabniško ime",
      "age": "Starost",
      "role": "Vloga",
      …
    }
  },
  "de": { … }
}
```

## Touched Fields and Submitting

A field's errors are shown only where `field.touched` is `true`. The demo sets it when an input loses focus, so a
field the user has not left yet shows no error. Submit sets `validatedForm.touched = true`, which a container passes
to every member, so every error shows, and the demo sends the form only where it is valid. Reset calls
`validatedForm.rebind(validatedForm.originalValue)`, which puts the declared values back and resets `touched`.

Validation runs whether or not a field is touched: the status panel reports the form invalid while the errors are
not yet shown.

## Comparing Two Fields

The confirmation field has a
[`CompareTo`](/api/validators#new-validators-compareto-otherfield-isvalidcomparison-options) validator that names the
email field. It runs when either field changes, so editing the email after the
confirmation updates the confirmation's error.

## Asynchronous Validation in This Demo

The email field has an asynchronous validator with a one-second delay, which is longer than the interval between
two keystrokes, so several runs are usually pending at the same time. A run's result is applied only while it is the
newest run for the field: results for intermediate values are discarded, the field ends with the validation result
for its current text, and `field.validating` (bound to the input's `loading` prop) is `false` again once the last
run has settled.

The submit button reads `validatedForm.pending`, which is `true` while a validation run or an `Action.execute()` is
pending anywhere below the group, so the button is disabled for the duration of the check.

The validation function receives an `AbortSignal` as its fourth argument. The signal aborts when the run's result
is no longer used (a newer keystroke, the validator removed from the field, a transaction rolled back). A real
availability check passes it to `fetch` so the request is cancelled. The timer this demo awaits has nothing to
cancel and ignores the signal.

The validator in this demo always resolves, because the delay it awaits cannot fail. A real availability check
calls a server and can reject. A rejected run puts a single `Validation could not be completed` error on the field,
so the field is invalid and a submit sends nothing, and the reason is logged with
`console.error('Validation failed', reason)`. Catch the network error inside the validation function only when the
user should see a more specific message.

## Translated Messages in This Demo

The language selector switches the demo between English, Slovenian, German, Spanish, Japanese, Chinese, Persian and
Bengali. The library does not render errors: every error has a `code`, `params` and an English `detail`, and the
demo's `errorText` function converts it into the text Vuetify's `error-messages` prop shows.

- **Messages.** `errorText` looks the error's code up under `errors` in the current language and substitutes the
  params with `interpolate` from `@dynamicforms/translatable`. A code the language has no message for shows the
  error's `detail`.
- **The demo's own codes.** The email pattern validator is given `{ code: 'invalid_email', detail: … }`, the
  `CompareTo` validator `{ code: 'emails_differ', detail: … }`, and the asynchronous validator returns an error with
  the code `email_taken`. All three are translated like the built-in codes.
- **Numbers.** `formatParams`, from the same package, formats the params before they are substituted: numbers go
  through `Intl.NumberFormat` for the language, so Persian and Bengali show the age range in their own digits.
- **Role names.** A role is stored as its code, `guest`, and the error's params carry the codes in `allowedValues`.
  The demo names them from `roles`, for the message and for the select's items alike.
- **Markdown.** With the checkbox on, the formatting wraps each value in `**`. Each field renders its messages
  through the `vue-markdown` component in Vuetify's `message` slot.

`errorText` is called on every render, so the errors already on the fields follow the language and the checkbox
without revalidating.

Persian is written right to left: the demo wraps itself in Vuetify's `v-locale-provider` with `rtl` set for it, and
the Persian message for `in_allowed_values` isolates the list with U+2068 and U+2069, so its brackets stay in place.

## API Reference

- [Validators](/api/validators): all built-in validators with signatures and placeholder list
- [FieldBase → errors](/api/field-base#prop-errors): `errors`, `valid`, `validating` and `busy` properties
- [Errors](/api/validators#validationerror): `code`, `params`, `detail` and `origin` of an error

## Key Features Demonstrated

- **Required Validator**: Ensures a field is not empty
- **Pattern Validator**: Validates content against a regular expression (email format)
- **CompareTo Validator**: Compares the confirmation with the email field
- **ValueInRange Validator**: Ensures a numeric value is within specified bounds
- **InAllowedValues Validator**: Restricts input to a predefined set of values
- **LengthInRange Validator**: Validates that the input length is within specified bounds
- **Asynchronous Validation**: A promise-returning validator, `field.validating` as the loading state, the newest
  run determining the validation result, and `form.pending` disabling submit while validation is pending
- **Touched**: Errors shown after a field is left, and on every field after a submit
- **Translated Messages**: Errors rendered by the application from their code and params, in eight languages,
  numbers in the language's digits, following a language switch on screen
- **Markdown**: The application rendering its messages as markdown
- **Form-level Validation**: Tracking overall form validity based on individual field states

## Try It Yourself

Experiment with the validators by:

1. Leaving fields empty, then submitting
2. Entering an invalid email address, or a confirmation that differs from it
3. Setting age outside the valid range
4. Selecting different role values
5. Entering text that's too short or too long in the bio field
6. Switching the language or the markdown setting while errors are showing

<script setup>
import ValidatorsFormDemo from '../components/validators-demo.vue';
</script>
