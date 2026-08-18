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

---

## D-010 — 0.9.0 carries the `Action` changes alone; the declaration/binding split takes the next number

**Version:** 0.9.0

The plan assigns 0.9.0 to step 4 as a whole: declarations and bindings, `clone()` removed, `List` rows built by
binding, `remove()` returning the instance, `TExtend`, and `Action`'s setter fix plus its asynchronous
`execute()`. This release carries the `Action` half. The split follows in 0.10.0, with the steps behind it moving
one number each.

**Why the halves separate.** They share no code. The setters route through the value setter and `execute()` runs
the `ExecuteAction` chain; neither reads or writes anything the split moves, and neither is easier to write once
the split exists. What they do share is a release: both are breaking, and a consumer meets them in one upgrade
whether or not one commit produced them.

**Why the `Action` half goes first.** It is complete and its suite is green on its own, which the split's suite
cannot be until it lands whole — the split's other half is step 5, which fixes `CompareTo` and
`ConditionalStatementAction` against the binding it is validating, and neither of those compiles against a tree
where half the declarations exist. A version that is green is a version the owner can tag.

**Rejected: holding the `Action` work uncommitted until the split lands.** The two would then be one commit
carrying two unrelated breaks, and the setter fix — which closes three defects a consumer can reach today — would
wait for the largest change in the plan.

**Rejected: numbering this 0.8.1.** `execute()` becoming asynchronous and the setters becoming ordinary value
changes are both breaking. In `0.x` semver puts a breaking change in the minor.

---

## D-011 — `label` and `icon` compare before writing, and clear a member rather than writing `undefined`

**Version:** 0.9.0

Both setters answer early when the value handed in is the one already held, and a member assigned `undefined` is
deleted from the new value object instead of being written into it.

**What forces the comparison.** `Field`'s value setter compares by identity, and every write through these
setters allocates a fresh object, so the setter's own guard can never catch a write of the value already held.
Without a comparison here, `action.label = action.label` announces a `ValueChangedAction` and bumps the value
version of the action and of every container above it, which is exactly the invalidation the memoised container
value exists to avoid. A consumer reassigning a label on every locale change or every render would pay for it
tree-wide.

**What forces the delete.** An own key holding `undefined` is invisible to a reader and to `JSON.stringify`, but
lodash `isEqual` compares own-key sets. An action constructed from `{ label: 'Save' }` holds that same object as
its baseline, so writing `icon: undefined` into a copy would leave `isChanged` permanently `true` for two objects
that serialise identically, and a form containing the action would report itself dirty for a write nobody can
see.

**Rejected: comparing with `isEqual` inside `Field`'s value setter.** It would catch this case and every other
one, at the cost of a deep comparison on the hot path of every field write, to serve a value shape only `Action`
has.

**Rejected: writing `undefined` and teaching `isChanged` to ignore undefined members.** That makes the comparison
`Action`-specific and leaves the odd value object in place, where a consumer reading `Object.keys(action.value)`
still sees a key that was never set.

---

## D-012 — `execute()` rejects, and the contract is documented rather than softened

**Version:** 0.9.0

A handler that throws rejects the promise `execute()` answers. Nothing catches it inside the library.

**What it costs.** A caller that neither awaits the answer nor attaches a `.catch()` leaves an unhandled
rejection, which under node's default settings ends the process, where the same handler used to throw
synchronously into the caller's `try`. Vue's event path is not affected: it attaches its own catch to the promise
a handler returns, so a template `@click="save.execute()"` reaches `app.config.errorHandler` as before.

**Rejected: catching inside `execute()`.** Swallowing a submit failure is worse than an unhandled rejection, and
routing it to a library-configured handler invents a second error channel next to the one Vue already has, for
the one caller shape that is outside a template.

**Rejected: keeping `execute()` synchronous and exposing the promise separately.** `busy` has to be cleared when
the run settles, so the method already awaits the chain; a synchronous wrapper around it would answer before the
value it is supposed to carry exists.

---

## D-013 — `@dynamicforms/vuetify-inputs` is released alongside the split, not alongside 0.9.0

**Version:** 0.9.0

The plan names 0.9.0 as the version where the two packages must be released together, because it removes
`clone()` and changes `Action`. With the split moved to 0.10.0 (D-010), the coupling moves with it: **0.10.0 is
the version that needs a matching `@dynamicforms/vuetify-inputs` release**, and nothing may be published from
either package for it alone.

0.9.0 itself does not force one. Checked against that package rather than assumed: it calls `clone()` nowhere; it
writes neither `label` nor `icon`, and its `Action` subclass declares both as getters with no setter, so the base
accessors are shadowed entirely; and its single `execute()` call site is a template `@click` handler, where Vue
catches the rejection. Its five `watch()` calls all take a ref.

What the split does require of that package is a narrowed dependency range: code written against declarations and
bindings does not run against a version that builds rows by cloning, so its release for 0.10.0 has to exclude
every earlier one.

---

## D-014 — Actions per record ship before the declaration/binding split, and 0.10.0 carries them

**Version:** 0.10.0

The plan pairs step 5 (actions per binding) with step 4 (the declaration/binding split) and says step 5 must ship
with it. It ships first instead, against a tree that still builds rows by cloning. D-010 gave 0.10.0 to the split;
0.10.0 is this release, and the split takes the number after it.

**Why it does not wait.** The three defects step 5 closes — a conditional action dead in every row, `CompareTo`
comparing against the item template, `clearValidators()` on one row silencing the validator in every row — are
defects of the *clone* model as it stands, and every one of them is reachable today. They need what the split was
going to provide, which is a way for a shared action to tell one row's field from another's, but they do not need
the whole of it: **a clone recording the element it was made from is enough**, and that is one slot and one
accessor rather than `BindingScope`, slot arrays and a new construction path.

**What replaces the binding.** `field.declaration` is the canonical element a clone was made from, and the *record*
an element belongs to is derived from the container chain: the `List` row that holds it, or the top of the chain
where no row does — a container names every member it holds except a row, so the element its container gave no name
to is where a record begins. An action resolves a second element by walking that element's path down from the
record, and confirms the answer by its declaration. When the split lands, the record becomes the `BindingScope` and
the path walk becomes a slot offset; what the actions ask for does not change.

**What it costs against doing both together.** The resolution is a short path walk per evaluation rather than an
index lookup, and the one case that has no cheap answer — an element declared in one record whose copies live in
records below it, which is a form field every row of a list reads — is a walk of the subtree. Both are on the path
of a value change of a field a rule reads, not of every write.

**Rejected: implementing step 4 first.** It is the largest step in the plan and it cannot be verified in halves —
D-010 already records that the split's suite is not green until the whole of it lands. Holding three reachable
defects behind it buys nothing, and the work here is not thrown away by it.

---

## D-015 — A cross-field listener is installed once per compared element, not once per row

**Version:** 0.10.0

`CompareTo` installs a `ValueChangedAction` on the field it compares against, so that a change there re-runs the
comparison. It installs it once, on the first element that resolves to it, and every clone of that element carries
the listener with it. The listener then re-runs the comparison over the fields of *the record the change happened
in*, rather than over the field that installed it.

**Rejected: one listener per row.** The plan's wording — move `listenerSet` into per-binding state — reads as one
installation per row. A thousand rows would then nest a thousand handlers into one chain, and `ActionsMap` builds a
chain as nested closures, so a row cloned late would carry a chain deep enough to overflow the stack when it fires.
It is also the shape `todo.md` records as the source of a `RangeError`.

**What is per binding.** The values the last run saw and the flag `clearValidators()` sets. Both are facts about
one element, and the flag is what makes clearing the validators of one row leave the others validating.

**What it costs.** A clone made *before* the declaration ever validated carries no listener, and would install one
of its own — which is correct, if redundant. That cannot arise for a row, because a row that has the validator was
cloned from an element that already had it, and a validator validates the element it is registered on at
registration.

---

## D-016 — An eager pass that reaches nothing is run again when the record is complete

**Version:** 0.10.0

A `List` row is built by cloning the item template: every member is cloned on its own, the clones are handed to a
`Group`, and the group is then handed the row's data. A member's eager actions run at the moment it is cloned, when
it holds neither its siblings nor its row, so a rule reading a second element of the record reaches nothing there.
Where that happens, the element records it — `markRecordIncomplete()` — and the container that completes the record
runs its eager actions again: the `Group` once it has written its members, and the `List` once it has taken the row
into the form. A pass that still reaches nothing records it again, so the next container above answers for it.

**What forced it.** Reaching nothing has to read as *no verdict*, not as a pass, and the pass that would have
corrected it never comes: the value setter drops an assignment of the value the field already holds, so a row
holding exactly what its template holds is never validated a second time. That is not a corner case — an item the
list builds to fill a gap and the group `remove()` hands back carry the template's values by construction, and a
list of default rows is ordinary.

**Rejected: revalidate every member at the end of the clone.** One line in the `Group` constructor, and it doubles
the validator runs of every row of every list, which is the path the whole performance plan is about. Measured at
about 3 % of building a 1000-row list for the pass as it stands, where it runs only for the elements that asked.

**Rejected: a static "this action needs the record" flag on the action class.** It cannot tell the pass that
answered from the pass that did not — a rule comparing against a field the form above holds resolves at clone time
and would be run twice for nothing — and it makes every author of a cross-field action declare a property that only
matters in one construction path.

**Rejected: leaving it to the next write.** It is what the state before this release did, and the verdict a form
reports until the user touches a row is exactly the verdict that matters: a submit button reads `form.valid`.

**What it costs.** A process-wide counter of elements waiting for a record, read before any walk, so a form built
out of elements that answer for themselves alone pays nothing. An element whose record never completes — a field
cloned out of its group, a name nothing in the tree answers to — stays counted, and every container completed after
it therefore walks its own subtree. The walk is bounded by the construction it is part of, so it is a constant
factor on a path that is already linear in the same subtree.

---

## D-017 — An action drives the elements it was registered on, not every element its declaration stands for

**Version:** 0.10.0

An action shared by every row has to find, from the element that changed, the elements it applies to. It searches
by declaration — one entry stands for a thousand rows — and then keeps the elements of that search **that took the
action on**, which is recorded per element in a `WeakSet`.

**What forced it.** Without the second half, a rule registered on one row of a list applies to every row: the field
it compares against pushes an error onto rows that do not carry the validator, and a row with no validator has
nothing that can withdraw it, so the form is invalid for good. `registerAction` on one row is ordinary — a row the
user is editing under a rule the others are not — and a `List` is not the only place a declaration stands for
several elements.

**Rejected: recording the elements themselves in a `Set`.** It is the direct reading, and it grows without bound:
every row of every list registers as it is cloned, and a list churning rows never gives an entry back. The pair
kept here is bounded — one declaration per registration site, and weak references for the rest.

**Rejected: a flag in the per-element state a validator already keeps.** It works for `CompareTo`, whose state is
keyed by the element it validates, but not for a conditional action, which keys its state by the *record*: a rule
on a bare field has the field for its own record, and the two entries would be the same object.

**What it also settles.** `unregisterFrom(binding)` deletes the entry, and registering again puts it back, so a
validator registered on a field that had `clearValidators()` called listens to the compared field again. The state
before this release set a flag that nothing ever cleared, and the field stayed half-armed: validating its own
writes, deaf to the field it compared against.

---

## D-018 — The model is written down as one page, ahead of the reference

**Version:** 0.10.1

`docs/guide/model.md` states the whole design in one place: elements, declarations and clones, how a `List`
builds rows, what a record is, when events fire, where validity comes from and where a value comes from. It is
listed first in the API sidebar as well as in the guide sidebar, so a reader who arrives at the reference meets
it before the first symbol.

**What forced it.** Six releases added six mechanisms — value version counters, a validity computed beside a
validity tally, transactions, declarations, records, per-element action state — and each was documented where it
belonged, on the page of the symbol it touched. A reader assembling the shape from those pages has to read all
of them and infer what they have in common. Complexity that arrives one release at a time is complexity nobody
reviews as a whole, and the page is what makes it reviewable.

**What it is not allowed to be.** The reference pages carry the per-symbol truth — every signature, default,
unit and thrown error — and the model page carries none of it. A duplicated signature is a signature that goes
stale on one of the two pages, and the one it goes stale on is the one nobody edits when the code changes.

**Rejected: growing `getting-started.md` instead.** That page has a different job — install, bind an input,
render an error — and it is read once, in a hurry. The model is read when a form does something the reader did
not expect, which is a different moment and a different length.

**Rejected: a concepts section at the top of each reference page.** It puts the same explanation in five places
and still never states what the five have in common, which is the whole content of the page.

---

## D-019 — The migration guide carries the journey and the per-release sections both

**Version:** 0.10.1

`docs/guide/migration.md` opens with one pass from 0.6.1 to 0.10.x, ordered by how likely a change is to bite
rather than by which release produced it, and keeps the per-release sections below it unchanged.

**Why both.** The two readers are different. A project upgrading across four releases wants the silent breaks
first — `watch(field, cb)`, `readonly(field)`, `isEqual` over elements — because those fail with nothing in the
console and nothing in the type checker; which release introduced each is of no use to them. A project crossing
one release wants exactly that release and nothing else.

**What it costs.** The same change is described twice, in two orderings. The journey is a summary with a
checklist and the per-release section is the full account, so the two are not copies; but a future release adds
its section and has to be folded into the journey as well, and a release that is not folded in leaves the
journey silently incomplete.

**Rejected: replacing the per-release sections.** Their headings are what a changelog entry and a release note
can link to, and a consumer crossing one release would have to read four releases' worth of prose to find their
own.

---

## D-020 — `Action`'s exception to UI-agnosticism is stated, not hedged

**Version:** 0.10.1

The documentation says outright that `Action` is the one part of the library that is not UI-agnostic, on the
design-goal line in `readme.md` and `getting-started.md`, in a callout in `docs/api/actions.md`, and at length
in `docs/examples/action.md`. The cross-link points at `@dynamicforms/vuetify-inputs`'s `df-actions` and
responsive-render-options pages, which is where that package documents what an action renders as; it has no page
for the `Action` subclass itself, so there is nothing closer to link to.

**Why it is said rather than left alone.** "UI-agnostic" is the first design goal on both front pages, and
`{ label, icon }` contradicts it in the reader's eyes. An unexplained inconsistency reads as an oversight, and a
reader who takes it for one designs around it — reimplementing the label on their own class rather than widening
the value the way the shape invites.

**Why it is not softened into a general-purpose name.** Renaming the members to something domain-neutral would
hide the exception rather than remove it, and would take away the affordance that makes `Action` a concept
instead of a `Field` with extra steps.

---

## D-021 — A hand-written cross-field validator is documented as calling `markRecordIncomplete()`

**Version:** 0.10.1

The `List` example and the validators reference both show a validator that reads a sibling answering
`field.markRecordIncomplete()` and returning `null` while `field.parent` is absent, rather than the containing
list revalidating each row from a `ListItemAddedAction`.

**Why.** Reaching nothing has to read as *no verdict*, and the container that completes the record is the one
that can run the pass again — which is exactly what `markRecordIncomplete()` asks for. Revalidating from
`ListItemAddedAction` covers `push()` and `insert()` and misses every other way a row comes into being: the
initial `value`, a whole-list assignment, the padding items an out-of-range `insert()` creates.

**What it costs.** A hand-written rule has to say so explicitly, where `CompareTo` and the conditional actions
do it themselves. The alternative — treating an absent container as a signal on its own — cannot tell a rule
that legitimately has no container from one whose record is still being built.

---

## D-022 — `field.errors` reads back Vue proxies, and that is documented rather than unwrapped

**Version:** 0.10.1

An element's state is a `reactive` object, so `field.errors` is a reactive array and its members are proxies of
the `ValidationError` instances a validator produced. `field.errors[0] === myError` is therefore `false` for the
very error that validator returned. `docs/api/field.md` and `docs/api/validators.md` say so and name `toRaw()`.

**Why not unwrap in the getter.** The tracked read is the point: a template rendering `error.componentBody` must
re-render when the message behind a `Ref` changes, and handing out raw instances would take that away. Unwrapping
only the array and not its members would leave the same trap one level down.

**What it leaves open.** Two runs of one validator that produce the same message leave the field holding the
newer instance, because the `isEqual` that would have kept the older one compares two
`ValidationErrorRenderContent` objects including the `computed` each carries. Recorded in `todo.md`; error
identity across validations is not something the library promises today.

---

## D-023 — Extended properties live in one tracked slot, are merged on write, and are routed by declaration

**Version:** 0.10.2

`FieldBase<T, X extends object = {}>` carries whatever a consumer declares beyond the members of the class:
`extra` reads them, `setExtendedValues(values)` writes them, the constructor and `clone()` take them in the same
parameter object as everything else, and `Field`, `Action`, `Group` and `List` thread `X` through. The default
`{}` is what keeps every existing annotation compiling and what makes `new Field({ value: 1, label: 'x' })` an
excess-property error for an element that declared none.

**They are reactive.** The properties are one slot of the element's state object, so a read inside a render
effect subscribes to it and a write re-runs the effect: a template binding `field.extra.label` follows a label
that arrives with the form's description or changes later. The alternative weighed was a plain untracked
property, which costs nothing and makes exactly the case the feature exists for — a UI layer rendering off the
field — silently stale. One slot in an object every element already carries is the whole cost; nothing per
element is allocated, because the empty set is one frozen object shared by every element that has none.

**A write merges, and replaces the object rather than writing into it.** `setExtendedValues` takes a `Partial<X>`,
so a call naming one property must leave the rest standing — replacing would leave the properties `X` declares as
required holding `undefined` while the type says they are there. The merged set is frozen and installed as a new
object: that is what the transaction snapshot captured, so a rollback puts the previous set back, and a caller
cannot write behind the element's back through the object `extra` handed out.

**What counts as an extended property is what the class does not declare.** A parameter key is assigned to the
element when the element answers for it (`key in this`, minus what only `Object.prototype` answers for) and
becomes an extended property otherwise. This keeps `valid`, `parent` and the other derived members throwing a
`TypeError` for a caller that types them away, and it needs no list of member names to be kept in step with the
classes. Its one consequence is that a property named after a member of the class it is declared on reaches that
member: `Action` declares `label` and `icon`, so an `Action`'s extended properties may not use those two names.
The alternative — an explicit set of base parameter names — would have made the collision legal at the price of a
list that every subclass has to extend, and a subclass's own members would then be silently shadowed instead.

What the element answers for is read where the parameters are applied, which is inside the base constructor, and
`useDefineForClassFields` is pinned true: a class field a subclass declares is defined on the instance only once
that constructor has returned. A parameter named after one is therefore an extended property and the field keeps
its initializer, while a parameter named after an accessor the subclass declares reaches the accessor. Nothing
readable at that moment names a field that does not exist yet, so the rule a subclass follows is that a member
the parameters may reach is declared as an accessor.

`validators` and `actions` are named explicitly rather than routed. They state what to register on the element
instead of what it carries; a constructor takes them out of the parameter object before it applies the rest, but
`clone()` hands its overrides over whole, so a `clone({ validators: [v] })` — which the parameter type accepts and
`clone()` ignores — would otherwise attach the array as an extended property and carry it into every further
clone.

The set the routing accumulates into is prototype-less, and ownership in it is tested with `Object.hasOwn`. A
parameter object parsed out of JSON — the case the feature exists for — can carry a `__proto__` key, and a plain
`{}` accumulator would take that key through the setter `Object.prototype` holds: the accumulator's prototype
would be replaced instead of a property created, and the ownership test would then answer for keys nothing put
there, leaving an explicitly supplied `enabled` or `visibility` unassigned. `Group` already builds its fields map
the same way, for the same key.

**The parameter type is `Partial<IFieldConstructorParams<T>> & Partial<NoInfer<X>>`.** The shape planned in
`todo.md` was `Partial<IFieldConstructorParams<T> & X>`. Both accept the same objects, but `T` is inferred
through this type, and inference through a mapped type over an intersection answers with one constituent of a
union rather than the union: `new Field({ value: stringOrNumber })` came out a `Field<string>`, which the
`Required` validator's spec caught. `NoInfer` is what keeps `X` out of inference, so an element that declared no
extended properties rejects one instead of inferring it from the parameter object.

**What it leaves open.** A validator's callback receives its field as `FieldBase<T>`, so reading `field.extra`
inside one answers `Readonly<{}>` and needs a cast. Threading `X` through `ValidationFunction` and
`FieldActionExecute` would reach every action class and every signature that takes an element; the elements
themselves carry the type, and an action written against a specific field type can state it.

---

## D-024 — `extra` reads back as `Readonly<Partial<X>>`

**Version:** 0.10.2

The parameter object makes every extended property optional and `setExtendedValues` takes a `Partial<X>`, so
nothing on the way in guarantees that a property `X` declares as required is present. The read type says so: a
member of `X` reads as `T | undefined`, and a consumer that renders one handles its absence.

The alternative that keeps `Readonly<X>` honest is to require the required members of `X` where an element is
constructed. It does not close the hole and costs a great deal to reach: `params` is optional on every
constructor, so `new Field<string, Presentation>()` would go on producing an element whose `extra` is `{}` while
the type promises a label, and making the parameter conditionally required is a second parameter type for
`clone()` — which must go on accepting a partial set — plus a variadic signature on all four classes and on the
`init` hook a subclass overrides.

The cost of the type chosen is that `X` declaring a member required states an intention rather than a guarantee.
`setExtendedValues` never takes a property away, so a property is present from the write that put it there
onwards.

---

## D-025 — `clone()` becomes `bind(data, overrides)`, and `rebind(data)` is the in-place half of it

**Version:** 0.11.0

The operation is unchanged: a new element of the same class, carrying the action and validator instances the
source holds and its extended properties, detached, with `originalValue` baselined to the data it was given. What
changes is the name and where the data goes. `clone` named the mechanism — a copy — while what the library does
with it is put a declaration to work over one record, which is what every `List` row is and what `declaration`,
`bindingsOf()` and `boundToBinding()` already called a binding. The vocabulary is now one word throughout.

**The data is an argument of its own rather than a key of the override object.** `bind(data?, overrides?)` reads
`data` positionally and `IBindParams<T, X>` — `IFieldParams<T, X>` without `value` — for the rest. Two things a
caller can state that mean the same thing are one too many, and the data is what nearly every call site passes:
`template.bind(record)` against `template.clone({ value: record })`. The overload semantics the specs pin are
carried over whole onto the argument: `undefined` is no data supplied and the source's value stands, an explicit
`null` is data and clears, and `originalValue` in the overrides is read by key presence.

**Rejected: `bind(params)` with the data still inside the object.** It is a rename and nothing else, and it keeps
the shape that made `clone({ value: null })` read as an override of a value rather than as the data a binding is
over. **Rejected: `bind(data)` alone.** The overrides carry `enabled`, `visibility`, `originalValue` and the
extended properties a caller writes over the ones carried across, all of which the specs and the documented
surface use.

**`rebind(data)` announces nothing for the element it is called on.** It is `resetTo(this.declaration, data)` —
the primitive a `List` already uses to recycle a row through a whole-value assignment — plus the element's
announcement baseline being set to what it ends up holding, which is what a constructor does with the value it
finishes on. A recycled row is not an edit of the record it held before, so a `ValueChangedAction` on it would
report a change nothing made.

The one announcement it does not swallow is a change already owed. Inside an open transaction the element may
have been written to before the exchange, and the commit is enrolled to report that write; the exchange keeps
that baseline and the commit announces from where the element stood when the transaction opened. Moving the
baseline unconditionally would leave the element holding a record it never announced — silently on a leaf, and
as a pair reporting no change at all where a structural operation had already forced the announcement.

What does still fire is stated rather than suppressed: the members of a rebound group announce the values they
took on, and a verdict that moves is announced as always. Silencing the members would leave anything a handler
derives from them stale, and it would make `rebind` differ from the row reuse `list.value = rows` performs, which
is the same operation reached through the list. Silencing the verdict is not available at all: a container's
tally of invalid children is what `valid` is composed from, so a rebound row that turns invalid has to say so.

**The data is measured against `declaration`, not against the element itself.** A record that leaves a key out
leaves that member to the declaration, so a recycled row is indistinguishable from a fresh `bind()` of the item
template rather than carrying a remnant of the record before it. An element that was declared rather than bound
answers `declaration` with itself, so the rule reads the same on both.

---

## D-026 — `List.remove()` hands back the row itself

**Version:** 0.11.0

`remove()` and `pop()` answer with the row instance the list held, and `ListItemRemovedAction` receives that same
instance. The copy they used to answer with existed to shed the container back-reference, which `releaseChild()`
has done since 0.7.0: the row leaves without a `parent` and any container will take it.

The copy erased what a caller asks a removed row for. `originalValue` is baselined at construction, so a row
edited before it was removed came back reporting `isChanged` as `false`, its errors re-established from the values
rather than the ones its validators had reached, and its identity gone — the instance a handler had kept from
`list.get(index)` was not the one the event carried. Everything a caller can do with a removed row — undo it back
into the list, ask what changed in it, hand it to another list — needs the row rather than a likeness of it.

The cost is that a caller who kept the removed row keeps the whole element alive, actions and all. That is what
they asked for by keeping it; a caller that wants a detached likeness has `bind()`.

**The sibling packages need no change for either rename.** `@dynamicforms/vuetify-inputs`,
`@dynamicforms/vuetify-modal-form-kit` and `@dynamicforms/vue-grid` never called `clone()` — the only `clone`
in any of them is lodash's — and none of them calls `List.remove()` or `List.pop()`, so the peer range is the
only thing that moves for them.

---

## D-027 — Rows go on being built element by element; the declaration/binding split is dropped

**Version:** 0.11.0

A `List` row is a `Group` of elements bound from the item template, each holding its own state, and it stays that
way. The alternative the plan carried — a shared definition object holding the validators, actions and defaults,
with a row holding only mutable state — is not taken, and neither is the shared slot array that went with it.

**What decided it.** The correctness the split was wanted for is already answered on this model: `declaration`
names what an element was declared as, a record is derived from the container chain, and `markRecordIncomplete()`
covers the pass that runs before a record exists (D-014). What was left was cost, and the cost the slot array
bought was about 11% of an element's memory in exchange for rewriting every state accessor from a named property
(`this.#state.originalValue`) into an indexed lookup. Readability beat it.

**What the model keeps.** A row has an identity of its own, so `v-for` keying and component reuse need no
machinery; per-element property access is direct; and `registerAction()` on one row is that row's action rather
than every row's, which a shared definition could not offer without a composition order for a shared chain plus a
per-row one.

**What it leaves standing.** Every row rebuilds an `ActionsMap` and its closure chain, which is the dominant cost
of creating one, and resolving a second element of a record is a path walk per evaluation rather than an index
lookup. `bind()` names the operation the model rests on (D-025), and `rebind()` covers what the split was reached
for last — recycling one row across records — without moving where state lives.


---

## D-028 — The package ships one format: ESM

**Version:** 0.12.0

`exports` resolves a single build with a single set of declarations. The `require` condition, `main`, the UMD
artifact and its map, and the `index.d.cts` copy the build script produced with `copyFileSync` are all gone,
together with the `paths: { 'lodash-es': 'lodash' }` and `globals` mapping the UMD output needed. `lodash` leaves
`dependencies`; `lodash-es` remains as the only runtime dependency. `engines.node` moves from `>=18` to `>=22`.

**What forced it.** The library establishes identity two ways that a duplicated module graph breaks: 24
`instanceof` sites, and 20 module-level `Symbol()` calls without `Symbol.for`. A program that loads both the ESM
and the CJS build — an ESM application whose test runner or SSR path requires the CJS one — holds two of every
class and two of every symbol, so a `Field` built by one half fails the `instanceof` in the other and surfaces as
`Invalid fields object provided` on a value that is correct. The message names nothing that would lead a consumer
to the duplication. Making the two builds interchangeable would mean routing every identity check through
`Symbol.for` keys and a registry, which is a permanent tax on the hot path of a library whose whole job is
identity between elements.

The price of carrying it was also visible without the failure: the `require` half was 327 kB of the package's
731 kB, and `lodash` sat in `dependencies` — 1.4 MB installed for every consumer — only because the UMD artifact
cannot `require()` the ESM-only `lodash-es`.

**What the CJS consumer does now.** `require()` of an ES module, which Node supports from 20.19 and 22.12. That
is why the `engines` floor moves in the same change: `>=18` claimed support for a Node that neither has
`require(esm)` nor is maintained — Node 18 reached end of life in April 2025 — so leaving it would have been a
claim the package cannot honour.

**Alternative not taken.** Keeping CJS and dropping only the UMD global would have kept the duplication hazard,
which is the reason the change exists; the size is the lesser half of it.

---

## D-029 — The Vue peer floor is 3.5.2, and CI type-checks the declarations against it

**Version:** 0.12.0

`peerDependencies.vue` is `^3.5.2`, narrowed from `^3.4`. A CI job installs exactly that version — read out of
`package.json`, so the job and the declared range cannot drift — and type-checks the built `dist/index.d.ts` with
`skipLibCheck: false`.

**Where the floor comes from.** Not the source. Every Vue API the library imports (`reactive`, `computed`, `ref`,
`unref`, `toRaw`, `h`, `watchEffect`, `effectScope`, `isReactive`, `isRef`, `nextTick`, `readonly`,
`resolveComponent`, `Ref`, and the `__v_skip` flag) is Vue 3.0. The floor comes from one emitted line: `vue-tsc`
writes `MessagesWidget` as a `DefineComponent` with 20 type arguments, and `DefineComponent` takes 19 parameters
through Vue 3.5.1 and 20 from 3.5.2, which added `TypeEl`. Below the floor a consumer compiling with
`skipLibCheck: false` gets `TS2707` on that line; runtime is unaffected at any 3.x.

**How 3.5.2 was established.** Empirically, one version at a time: the built `index.d.ts` plus a file importing
`Field`, `Group`, `List`, `Validators` and `MessagesWidget` from it, compiled under `skipLibCheck: false` against
each candidate Vue. 3.5.0 and 3.5.1 report `TS2707`; 3.5.2 and every version tested above it compile clean. The
`DefineComponent` signature in `@vue/runtime-core` confirms the boundary.

**Alternative not taken.** Hand-writing the type of `MessagesWidget` to keep a `^3.0` range. It is the only export
that pulls `DefineComponent`, `ComponentOptionsMixin`, `PublicProps` and `ComponentProvideOptions` into the public
declarations, so one hand-written type would free the whole range — at the cost of prop inference on that
component, and of a range spanning releases nothing has been run against. A declared range is a promise, not a
mechanism; the narrow one is the promise CI can keep.
