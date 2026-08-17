# Decision record

Decisions taken while implementing the declaration/binding plan, with the alternatives that were weighed and
the reason for the one chosen. History belongs here and nowhere else: the source states what the code does,
the changelog states what changed for a consumer, and this file states why the shape is what it is.

Entries are append-only. A decision that is later reversed keeps its entry and gains a successor.

---

## D-001 — Element state lives in private class fields, and lodash `isEqual` over two elements is meaningless

**Version:** 0.7.0

An element's mutable state is held in ECMAScript private class fields (`#state`, `#raw` on `FieldBase`).
Nothing outside the class can reach it: not `Object.keys`, not `Object.getOwnPropertySymbols`, not
`JSON.stringify`, not lodash's `getAllKeys`.

The consequence, which is broader than the problem it solves: `isEqual` over two elements reads nothing
either of them holds, so **any two instances of the same class compare equal** —
`isEqual(new Field({ value: 1 }), new Field({ value: 2 }))` is `true`.

**What forced it.** The back-reference to the container must be invisible to any walker, or `JSON.stringify`
and `isEqual` recurse from a child into its parent and back. Three shapes were tried:

- *Non-enumerable accessor per instance* (the shape before 0.7.0). Correct, and `isEqual` over elements
  worked — but it costs one `Object.defineProperty` per element, which converts the object to dictionary
  mode: measured at ~765 bytes per field for the first such property, ~40 % of an element's retained size.
- *Enumerable symbol keys.* Cheap, but wrong: lodash compares own string keys **plus own enumerable
  symbols**, so two structurally identical fields in different parents compared unequal, and every element
  was walked twice.
- *Private class fields.* Cheap and correct about the parent link, at the cost above.

**Why the cost is acceptable.** Nothing in the library compares elements — every internal `isEqual` is over a
value (`isChanged`, the announced-value guards) or over a `ValidationError`. No documented behaviour promised
element comparison. Comparing two form elements structurally is an odd thing to want; comparing what they
hold is the meaningful question, and `isEqual(a.value, b.value)` answers it.

**Rejected alternative worth naming.** Splitting the state in two — links private, values reachable — would
restore element comparison. It was rejected because `parent` has to be a *tracked* read, so the links half
would need its own reactive proxy, doubling the proxy count per element and undoing the reason this step
exists.

Documented in `docs/api/group.md`, `docs/guide/migration.md` and `changelog.md`, with `isEqual(a.value,
b.value)` as the replacement.

---

## D-002 — Steps 0, 1 and 2 are released together as 0.7.0

**Version:** 0.7.0

The three steps were developed and merged separately but none was published. Folding them into one version
gives 0.7.0 a commit that can be tagged; numbering them 0.6.2 / 0.6.3 / 0.7.0 retroactively would leave the
first two pointing at commits whose `package.json` never carried those numbers.

A minor rather than a patch, because the batch carries three consumer-visible breaks: the object a value
getter returns is frozen, `watch(field, cb)` with a bare element as the source stops firing, and
`readonly(field)` hands back a mutable element. In `0.x`, semver puts a breaking change in the minor.
