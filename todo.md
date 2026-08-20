# todo

What is left to do before the 1.0 surface is frozen, re-verified against 0.15.0. Nothing on this list blocks
that freeze: every item is additive or a behaviour fix that 1.1 can make without a break.

The same findings laid out for reading, with the measurement output and the reasoning behind each severity:
<https://claude.ai/code/artifact/4527a232-fd57-431f-8aac-aacb244d42a7> (private link — visible to the repo
owner only, so treat this file as the authoritative copy).

---

## Pre-existing items

- More coverage in unit tests. The incremental check CI runs answers for the lines a pull request touches; what a
  global figure would answer for is the rest.
