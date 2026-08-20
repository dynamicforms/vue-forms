# todo

What is left to do before the 1.0 surface is frozen, re-verified against 0.15.0. Nothing on this list blocks
that freeze: every item is additive or a behaviour fix that 1.1 can make without a break.

The same findings laid out for reading, with the measurement output and the reasoning behind each severity:
<https://claude.ai/code/artifact/4527a232-fd57-431f-8aac-aacb244d42a7> (private link — visible to the repo
owner only, so treat this file as the authoritative copy).

---

## Can wait (non-breaking to add later)

a rejection out of `Action.execute()` has nowhere to go but the caller: a call that neither awaits the
answer nor attaches a `.catch()` leaves it unhandled, and the library offers no configured error handler to
route it to.

## Pre-existing items

- More coverage in unit tests (see the test-gap list above for where it actually matters).
