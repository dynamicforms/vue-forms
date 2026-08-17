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

---

## D-003 — `transaction` is a free function, and rollback is reachable only from inside the callback

**Version:** 0.8.0

`transaction(fn)` is exported from the package root and exists nowhere else. It is not a method on `FieldBase`.

**Why not a method.** There is one open transaction at a time, held in a module-level variable, and any mutating
operation anywhere joins it. `form.transaction(() => …)` would read as *this element's* transaction and would be
wrong the first time the callback touched something outside `form` — which is the ordinary case, since a
cross-field rule is why a caller opens one. A free function says what is true: the transaction is ambient.

**What it returns.** Whatever the callback returned, typed `R | undefined`. The union is what a rollback costs:
a transaction that did not commit has no result to hand back. Every internal call site that needs a value out of
an operation — `List.insert` returning the position — writes it into a local rather than returning it through
`transaction`, so no library signature gained the union.

**Rollback.** `transaction(fn)` passes the callback a control object with one member, `rollback()`, which unwinds
from the point of the call by throwing a signal the outermost `transaction()` catches. Rollback is therefore
reachable in exactly two ways, and both unwind immediately: an ordinary throw, which rolls back and rethrows, and
`tx.rollback()`, which rolls back and answers `undefined`.

**Rejected: a rollback-only flag.** `tx.setRollbackOnly()` in the JDBC sense would keep the return type as `R`,
but the code after the call would go on running and mutating a transaction already condemned. Unwinding at the
point of the decision is what a caller means by "undo this".

**Rejected: rollback from outside the callback.** Handing out a transaction handle that outlives `transaction()`
would allow `tx.rollback()` after the commit, which would have to un-announce events. The one use case that
wants it — edit a row in a dialog, cancel — is asynchronous, and a transaction cannot cross an `await` anyway;
that case is a snapshot of the row's value, restored by assignment, not a transaction.

---

## D-004 — The `invalidChildren` tally is applied at settle time rather than recomputed at commit

**Version:** 0.8.0

The plan for this step said to mark a container's tally dirty during a transaction and recompute it once at
commit by walking the members. The implementation keeps the tally incremental and applies each child's delta at
the moment that child's verdict settles, which is bottom-up, so a container reads a finished tally when its own
turn comes.

**Why.** Both shapes compute a container's verdict exactly once per transaction, which is what the plan was
after. Recomputing by walking would make it `O(members)` per container: a `List.insert` would go back to walking
its thousand rows, undoing the step-1 result that made filling a list linear. The delta is `O(1)` and needs no
extra bookkeeping, because the invariant it rests on — the tally counts *announced* verdicts, and a verdict is
announced exactly once, at settle — is the same invariant the commit already maintains for values.

**What it costs.** `adoptChild` and `releaseChild` read the child's last announced verdict rather than its
working one. That is correct rather than approximate: a row whose field turned invalid inside the transaction was
never counted as invalid, so removing it must subtract nothing, and at settle the row's own transition finds no
container to report to.

---

## D-005 — Copy-on-first-write snapshots are not optional

**Version:** 0.8.0

Every element a transaction modifies is recorded once, and there is no way to switch the recording off.

**What it costs.** Measured on the step-1 fixture, 1000 rows of 8 fields, same machine and session as the 0.7.0
numbers: a whole-list assignment 19.1 ms to 26.4 ms, of which the record itself is 1.7 ms — the other 5.6 ms is
the transaction's own bookkeeping, one participant per element and two ordered passes over them. One field write
in row 500 goes 0.0082 ms to 0.0114 ms, of which 0.0024 ms is the record.

**Why no opt-out.** A partial guarantee is worth less than the mechanism costs to explain: an operation that can
half-apply is exactly the defect this step exists to close, and an opt-out would put it back under a flag whose
users would be the bulk paths, which are where a half-applied state is worst. At 0.19 µs per element the record
is not what a bulk assignment spends its time on.

**If it ever has to become optional**, the shape is `transaction(fn, { rollback: false })` — a per-transaction
opt-out rather than a global one, refused when a transaction is already open, and documented as making a throw
inside it leave the form in an undefined state. Nothing in the current implementation stands in the way: `touch`
would return without recording and `rollback` would find no snapshots.

---

## D-006 — What a rollback does not put back

**Version:** 0.8.0

The snapshot a transaction takes covers an element's state slots, which is everything an ordinary write touches.
Two things stay outside it.

**Actions registered while the transaction was open stay registered.** `ActionsMap` nests each handler in a
closure that calls the previous one, so a registration cannot be taken back link by link; undoing one means
replacing the whole map, which means copying it on every registration, and every registration runs inside a
transaction. The chosen shape is that `registerAction` is not transactional, and the alternative — a copy per
registration, turning N registrations on one element from `O(N)` into `O(N²)` and paying it on the path a
conditional action uses to install its source listeners — buys back an unwind nobody has asked for. What
`clearValidators()` does is different in kind: it *replaces* the map rather than adding to it, so it hands the
transaction its own undo and is put back exactly.

**A validation run already in flight is left to finish.** `validatingCount` is the one slot a rollback does not
restore: it counts runs that are in flight, and restoring it would put the count out of step with the
`endValidating` calls still to come, so `validating` would read `false` with a run pending and then go negative
when it settled. The run itself cannot be recalled — `ValidationFunction` receives no `AbortSignal`, which is a
separate open item — so instead it is allowed to complete and its verdict is dropped: the transaction it started
in is marked as unwound, and the validator's `isCurrent()` check reads that flag alongside the run counter and
the validation epoch. The alternative, letting the verdict land, leaves a field invalid over a value the form
never held, which is worse than a check that answers nothing.

---

## D-007 — The announcement order is held by restarting a pass, not by a priority queue

**Version:** 0.8.0

The commit announces the deepest element first. A handler running inside the commit may write, and its writes
join the transaction, so an element can become dirty after the pass that would have carried it has moved on. The
implementation drains one depth at a time from buckets built once per pass, and abandons the pass the moment an
element at or below the depth being drained is enrolled; the next pass takes fresh buckets and finds it.

**Rejected: re-selecting the deepest dirty participant before every announcement.** Exactly ordered and simple,
but `O(participants)` per announcement. A whole-list assignment over 1000 rows of 8 fields enrols about 9000
participants, so it is quadratic on precisely the operation that has the most of them.

**Rejected: a persistent depth-bucketed queue filled at enrolment.** `O(1)` per enrolment, but an element's depth
is not final when it is enrolled: a row's fields are written while the row is being built, before the list adopts
it, so they would be queued at depth 0 and announced after the list.

**What it costs.** Nothing in the ordinary case — no handler writes during the commit, so the buckets are built
once and drained. Each interleaving costs one more scan of the participants. Measured on the whole-list
assignment: 24.3 ms, against 18.8 ms for the same fixture without transactions.

**Also measured, and rejected on the strength of it:** carrying the action map inside the snapshot object under a
symbol key, so that `clearValidators()` needed no undo of its own. That put the whole-list assignment at 26.9 ms
— 2.6 ms for a key that matters to one operation and is paid by every element every other operation touches.

---

## D-008 — `clearValidators()` releases its validators when the operation finishes

**Version:** 0.8.0

A `Validator` may have installed listeners elsewhere — `CompareTo` registers a `ValueChangedAction` on the field
it compares against — and `unregister()` is what releases them. It is called after the operation that dropped
the validators has committed, not as it runs.

**Why.** `unregister()` is not reversible: `CompareTo` sets a flag that permanently stops its listener. Called
while the transaction is open, an operation that then unwound would put the map back with the validator in it
and leave that validator dead, which is the state a rollback exists to prevent. The alternative — making
`unregister()` reversible — widens the action protocol with a re-arm method that every overriding action would
have to implement correctly, for one caller.

**What it costs.** Between `clearValidators()` and the end of the operation it ran in, a cross-field validator
that was dropped can still fire and push an error onto the field it was dropped from. That needs the compared
field to be written later in the same transaction, and the error stands only until the next validation of that
field.

---

## D-009 — A spent transaction handle throws

**Version:** 0.8.0

The handle `transaction(fn)` passes its callback is marked spent when the transaction closes, and `rollback()`
on a spent handle throws a `TypeError` naming the reason.

**Rejected: making it a no-op.** Silence would hide the one mistake the shape exists to prevent — keeping the
handle and calling it later, which D-003 records as the rejected design. A caller who saved the handle believes
they can still unwind; answering nothing lets them go on believing it.

**Rejected: letting it unwind whatever transaction is open.** That is not a stale handle doing nothing, it is a
stale handle rolling back an unrelated operation.
