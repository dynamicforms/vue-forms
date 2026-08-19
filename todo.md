# todo

What stands between the current source and a frozen 1.0 surface, re-verified against 0.12.0, plus the
pre-existing items.

The same findings laid out for reading, with the measurement output and the reasoning behind each severity:
<https://claude.ai/code/artifact/4527a232-fd57-431f-8aac-aacb244d42a7> (private link — visible to the repo
owner only, so treat this file as the authoritative copy).

---

## Recommended before 1.0

- **A field handed to `CompareTo` or to a `Statement` from an *enclosing* item template is read where it stands.**
  Resolution answers within one record and reads an element belonging to any other as the element itself
  (`src/binding/resolve.ts`), so the rows of a nested list compare against the enclosing template's field rather
  than against the field of the enclosing row they sit in. The name form walks the containers of the field being
  validated and does reach the enclosing row, so the two forms disagree on the same rule. What a rule written
  against a field means is part of the surface being frozen.
- **Async action handlers are neither awaited nor caught** — an `async` `ValueChangedAction` that throws
  ends as an unhandled rejection. Decide and document the contract, because changing it later (setters
  becoming async) is a 2.0.
---

## Can wait (non-breaking to add later)

`AbortEventHandlingException` does not veto `*Changing*` events (documented as it behaves) ·
`enabled`/`visibility` fire events even without an actual change ·
an action registered on an item template after a row was built never reaches that row, because a binding carries
the actions its declaration held at the moment it was bound ·
`Operator.NOT` requires a dummy third argument ·
a rejection out of `Action.execute()` has nowhere to go but the caller: a call that neither awaits the
answer nor attaches a `.catch()` leaves it unhandled, and the library offers no configured error handler to
route it to · error object identity is not preserved across validations: two runs producing the same message
leave the field holding the newer instance, because the `isEqual` that would have kept the older one compares two
`ValidationErrorRenderContent`s including the `computed`
each carries. `Validator.claim()` copies an error another validator already owns, and `field.errors` reads back a
Vue proxy of whatever instance the field holds, so `field.errors[0] === myError` is `false` either way
(documented) · `isSimpleComponentDef(null)` throws ·
`List.insert(item, index)` fills the gap position by position, so an index taken from an API response builds
that many groups and fires that many events synchronously on the main thread ·
`./style.css` is unreachable under node10 resolution · no coverage thresholds.

## Pre-existing items

- More coverage in unit tests (see the test-gap list above for where it actually matters).
