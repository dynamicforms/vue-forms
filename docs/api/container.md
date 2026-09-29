# Container

`Container` is the abstract base of `Group` and `List`: a form element that holds other elements and composes its
own state out of theirs. It is also the type of every element's `parent`.

```typescript
import { Container, Field, Group } from '@dynamicforms/vue-forms';

const name = new Field({ value: 'Ada' });
const form = new Group({ name });

form instanceof Container; // true
name.parent === form;      // true; name.parent is typed Container | undefined
```

`Group` holds named members and `List` holds rows by position. Everything below is what the two share; reaching a
child — `group.fields.name`, `list.get(0)` — is each class's own and is described on its page.

## Properties and methods

| Member | Type | Description |
|--------|------|-------------|
| `valid` | `boolean` | `true` where the container's own errors are empty and every child is valid. The read is composed over the children and memoised, so an error written into a child without a `validate()` call shows here as well |
| `busy` | `boolean` | `true` while an `Action.execute()` in any child has yet to settle |
| `touched` | `boolean`, writable | `true` where any child is touched. Assigning it assigns every child |
| `validate(revalidate?)` | `void` | With `revalidate: true`, every child is revalidated first and the container forms its own verdict afterwards, over the finished set, so it announces one net transition of its validity at most |
| `notifyValueChanged()` | `void` | Records that a child changed its value, so that the [transaction](/api/transactions) in progress works out at commit what the container's own value became and announces it once. The mutation methods call it themselves; you rarely need to |

Every other member — `value`, `fullValue`, `errors`, `enabled`, `bind()`, `rebind()` and the rest — is the
[`FieldBase`](/api/field#fieldbase-t) one, with the value shape of the container that holds it.

## `parent`

Every element's `parent` is a `Container | undefined`: a `Group` holds its members and a `List` its rows, and an
element does not know which of the two it sits in. `Container` names no children, so a sibling lookup states the
container it expects:

```typescript
// checked: the branch runs only where the parent is a Group
if (field.parent instanceof Group) field.parent.fields.other.validate(true);

// stated: where the structure guarantees the parent is a Group
(field.parent as Group | undefined)?.fields.other.validate(true);
```

A cast checks nothing at runtime: where the parent turns out to be a `List`, `fields` reads `undefined` and the
lookup after it throws. Naming the sibling and letting [`CompareTo`](/api/validators#compareto) resolve it needs
neither.
