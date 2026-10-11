# Conditional statements

This example uses conditional actions in `@dynamicforms/vue-forms` to set a field's value, visibility and access
from the values of other fields.

## Demo

<conditional-statement-demo />

## What the demo shows

- **`ConditionalValueAction`**: one action per fruit sets the colour field's value when its statement becomes
  `true`. It applies on the transition from `false` to `true` only, so a colour typed by hand stays until another
  fruit is selected.
- **`ConditionalVisibilityAction`**: the additional information field is `'full'` while the details switch is on and
  `'suppress'` otherwise, and the template does not render a suppressed field. Visibility affects only rendering:
  the suppressed field is still sent.
- **`ConditionalAccessAction`**: Submit is an [`Action`](/api/action) whose access is `'editable'` while both the
  fruit and the colour hold a value and `'disabled'` otherwise. The statement combines two `NOT_EQUALS` statements
  with `AND`. The button is disabled while the action is not `executable`, and a submit shows what the form sends.
- **Construction order**: the conditional actions are passed to the constructors, and the group is built from the
  finished elements, so the actions have applied before the group records its baseline. The form starts with the
  colour `red` for `apple`, and `isChanged` is `false`.
- **Reset**: `rebind(originalValue)` puts every value back to the baseline, including the colour.

::: tip
To also leave a suppressed field out of what the form sends, register a `ConditionalAccessAction` on it as well;
see [What a container serializes](/api/container#what-a-container-serializes).
:::

## Source Code

<<< @/components/conditional-statement-demo.vue

## API Reference

- [Actions → Conditional actions](/api/actions#conditional-actions): `Statement`, `Operator`,
  `ConditionalVisibilityAction`, `ConditionalAccessAction`, `ConditionalValueAction`
- [FieldBase → Visibility](/api/field-base#visibility)
- [Action](/api/action): `executable`, `execute()`

## Try It Yourself

1. Select different fruits to see the colour change
2. Type a colour by hand, then select another fruit
3. Toggle the details switch to show and hide the additional information field
4. Clear the colour: Submit is disabled
5. Change a few fields, then Reset

<script setup>
import ConditionalStatementDemo from '../components/conditional-statement-demo.vue'
</script>
