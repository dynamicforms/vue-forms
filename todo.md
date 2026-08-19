# todo

What is left to do before the 1.0 surface is frozen, re-verified against 0.15.0. Nothing on this list blocks
that freeze: every item is additive or a behaviour fix that 1.1 can make without a break.

The same findings laid out for reading, with the measurement output and the reasoning behind each severity:
<https://claude.ai/code/artifact/4527a232-fd57-431f-8aac-aacb244d42a7> (private link — visible to the repo
owner only, so treat this file as the authoritative copy).

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
that many groups and fires that many events synchronously on the main thread.

## Pre-existing items

- More coverage in unit tests (see the test-gap list above for where it actually matters).
