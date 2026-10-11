# Basic Form Example

A person form built from a [`Group`](/api/group) of four [`Field`](/api/field)s and rendered with Vuetify
components.

## Demo

<PersonFormDemo />

## What the demo shows

- **Access.** The select beside each field sets its [`access`](/api/field-base#access). An `'editable'` or
  `'readonly'` field sends its value, a `'disabled-null'` field sends `null`, and a `'disabled'` field drops out of
  the output: its key is missing. First Name has a `Required` validator, so `'disabled-null'` makes the form
  invalid, while `'disabled'` does not, because a disabled field is not validated. See
  [What a container serializes](/api/container#what-a-container-serializes).
- **Visibility.** The second select sets [`visibility`](/api/field-base#visibility). The template renders it:
  `'invisible'` keeps the field's space, `'hidden'` takes none, and `'suppress'` does not render the field. The output
  is the same for all four.
- **Extended properties.** Each field declares its label, hint and input type as
  [extended properties](/examples/extended-properties) (the second type argument of `Field`), and the template
  renders every field from `extra` in one `v-for` over `personForm.fields`.
- **Baseline.** `isChanged` is `true` once the form's value differs from `originalValue`. Save calls
  `personForm.rebind(personForm.value)`, which makes what the form sends the new baseline, the way a server's stored
  record would. Reset calls `personForm.rebind(personForm.originalValue)` and puts the data back; access and
  visibility stay as they are.
- **Events.** The event log shows the actions registered on every field: `ValueChangedAction`,
  `ContributionChangedAction` (what the field sends to the form), `AccessChangingAction` and `AccessChangedAction`,
  `VisibilityChangingAction` and `VisibilityChangedAction`. A change of access changes what is sent and not the value,
  so it announces a contribution change and no value change.

Every read through an element is reactive, so the template binds `field.value` directly, and the output block that
reads `personForm.value` re-renders on every change. Every element is created with `new`, as are the action classes.
A command such as a submit button is an [`Action`](/examples/action).

## Source Code

<<< @/components/person-form-demo.vue

## API Reference

- [Field](/api/field): field creation, `value`, `access`, `visibility`, `extra`, `registerAction()`
- [Group](/api/group): `fields`, `value`, `isChanged`, `rebind()`
- [FieldBase → Access](/api/field-base#access) and [Visibility](/api/field-base#visibility)
- [Actions → Value events](/api/actions#value-events), [Access events](/api/actions#access-events),
  [Visibility events](/api/actions#visibility-events)

<script setup>
import PersonFormDemo from '../components/person-form-demo.vue'
</script>
