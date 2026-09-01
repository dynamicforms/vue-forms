# Decision record

Settled decisions, with the alternatives that were weighed and the reason for the one chosen. History belongs
here and nowhere else: the source states what the code does, the changelog states what changed for a consumer,
and this file states why the shape is what it is. An open question — something not yet decided — belongs in
`GAPS.md`, not here.

Entries are append-only. A decision that is later reversed keeps its entry and gains a successor.

---

## D-001 — Element state lives in private class fields, and lodash `isEqual` over two elements is meaningless

**Version:** 0.7.0

An element's mutable state is held in ECMAScript private class fields (`#state`, `#raw` on `FieldBase`).
Nothing outside the class can reach it: not `Object.keys`, not `Object.getOwnPropertySymbols`, not
`JSON.stringify`, not lodash's `getAllKeys`.

The consequence, which is broader than the problem it solves: `isEqual` over two elements reads nothing
either of them holds. Since 0.15.0 a `Symbol.toStringTag` accessor on `FieldBase` gives lodash a tag to check
before it looks at own keys, so a mismatched tag makes `isEqual` answer `false` for two distinct instances —
**two elements compare equal only where they are the same instance** —
`isEqual(new Field({ value: 1 }), new Field({ value: 2 }))` is `false`, and `isEqual(field, field)` is `true`.

**What forced it.** The back-reference to the container must be invisible to any walker, or `JSON.stringify`
and `isEqual` recurse from a child into its parent and back. Three shapes were tried:

- *Non-enumerable accessor per instance* (the shape before 0.7.0). Correct, and `isEqual` over elements
  worked — but it costs one `Object.defineProperty` per element, which converts the object to dictionary
  mode: measured at ~765 bytes per field for the first such property, ~40 % of an element's retained size.
- *Enumerable symbol keys.* Cheap, but wrong: lodash compares own string keys **plus own enumerable
  symbols**, so two structurally identical fields in different parents compared unequal, and every element
  was walked twice.
- *Private class fields.* Cheap and correct about the parent link, at the cost above.

**Why the cost is acceptable.** Nothing in the library compares elements structurally — every internal `isEqual`
is over a value (`isChanged`, the announced-value guards) or over a `ValidationError`. No documented behaviour
promises a structural comparison between elements; identity is what `isEqual` answers now, and comparing two
form elements structurally is an odd thing to want in the first place. Comparing what they hold is the meaningful
question, and `isEqual(a.value, b.value)` answers it.

**Rejected alternative worth naming.** Splitting the state in two — links private, values reachable — would
restore element comparison. It was rejected because `parent` has to be a *tracked* read, so the links half
would need its own reactive proxy, doubling the proxy count per element and undoing the reason this step
exists.

Documented in `docs/api/group.md`, `docs/guide/migration.md` and `changelog.md`, with `isEqual(a.value,
b.value)` as the replacement.

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
One thing stays outside it.

**Registering or unregistering an action is transactional.** `ActionsMap` holds a flat array rather than a
composed chain (D-030), so adding or dropping one entry needs no rebuild of the rest. `registerAction`,
`registerActionBefore`, `unregisterAction` and `clearValidators()` each hand the transaction a `whenRolledBack`
undo that reverses exactly what they did — re-registering what was dropped, or dropping what was added.
`clearValidators()` no longer replaces the whole map; it unregisters each validator individually, through the
same mechanism as any other registration.

**A validation run already in flight is left to finish.** `validatingCount` is the one slot a rollback does not
restore: it counts runs that are in flight, and restoring it would put the count out of step with the
`endValidating` calls still to come, so `validating` would read `false` with a run pending and then go negative
when it settled. A run is called off rather than undone — the `AbortSignal` its `ValidationFunction` was handed
aborts, and work that honours it stops — so it is allowed to settle and its verdict is dropped: the transaction it started
in is marked as unwound, and the validator's `isCurrent()` check reads that flag alongside the run counter and
the validation epoch. The alternative, letting the verdict land, leaves a field invalid over a value the form
never held, which is worse than a check that answers nothing.

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

## D-014 — Actions per record ship before the declaration/binding split, and 0.10.0 carries them

**Version:** 0.10.0

The plan pairs step 5 (actions per binding) with step 4 (the declaration/binding split) and says step 5 must ship
with it. It ships first instead, against a tree that still builds rows by cloning.

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

**Rejected: implementing step 4 first.** It is the largest step in the plan and it cannot be verified in halves.
Holding three reachable defects behind it buys nothing, and the work here is not thrown away by it.

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

## D-018 — The model is written down as one page, ahead of the reference

**Version:** 0.10.1

`docs/guide/model.md` states the whole design in one place: elements, declarations and clones, how a `List`
builds rows, what a record is, when events fire, where validity comes from and where a value comes from. It is
listed first in the API sidebar's Concepts section, and second in the guide sidebar's Introduction — after
Getting Started — so a reader who arrives at the reference meets it before the first symbol.

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

## D-023 — Extended properties live in one tracked slot, are merged on write, and are routed by declaration

**Version:** 0.10.2

`FieldBase<T, X extends object = {}>` carries whatever a consumer declares beyond the members of the class:
`extra` reads them, `setExtendedValues(values)` writes them, the constructor takes them in the same parameter
object as everything else and `bind()` takes them through the narrower `IBindParams<T, X>`, and `Field`,
`Action`, `Group` and `List` thread `X` through. The default
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
instead of what it carries; a constructor takes them out of the parameter object before it applies the rest.
`bind()`'s overrides are typed narrower still — `IBindParams<T, X>` excludes `validators`, `actions`, `value`,
`errors` and `touched` altogether, since a binding carries them from the declaration rather than accepting new
ones — so `bind(data, { validators: [v] })` is a compile error rather than a parameter the type accepts and the
method silently ignores.

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
extended properties rejects one instead of inferring it from the parameter object. Whether `X` should also reach
a validator's or an action's own callback is not decided here — see `GAPS.md`.

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
machinery, and per-element property access is direct.

**What it leaves standing.** Resolving a second element of a record is a path walk per evaluation rather than an
index lookup. `bind()` names the operation the model rests on (D-025), and `rebind()` covers what the split was
reached for last — recycling one row across records — without moving where state lives.

---

## D-028 — The package ships one format: ESM

**Version:** 0.12.0

`exports` resolves a single build with a single set of declarations. The `require` condition, `main`, the UMD
artifact and its map, and the `index.d.cts` copy the build script produced with `copyFileSync` are all gone,
together with the `paths: { 'lodash-es': 'lodash' }` and `globals` mapping the UMD output needed. `lodash` leaves
`dependencies`; `lodash-es` remains as the only runtime dependency. `engines.node` moves from `>=18` to `>=22`.

**What forced it.** The library establishes identity two ways that a duplicated module graph breaks: 24
`instanceof` sites, and 15 module-level `Symbol()` calls without `Symbol.for`. A program that loads both the ESM
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

## D-030 — one list of actions, walked from the end

**Decision.** `ActionsMap` holds one `FieldActionBase[]` in registration order and walks it from the end backwards,
passing over the actions registered under another identifier and handing each of the rest a `supr` that continues at
the index before it. The composed closure chain — every registration wrapping the handler already there — is gone.
The order is the whole index: an element carries a handful of actions, and the walk is measured at about twice the
speed of `Map.get` over three of them, with the keyed maps costing about 500 bytes per declaration.

**What forced it.** A composed chain cannot be taken apart: the successor closure holds its predecessor, and
`registeredActions` was only a record for copying. Every consequence followed from that. `clearValidators()` had to
replace the whole map, which is why it needed a rollback hook of its own. `triggerChain()` existed so a transaction
could run handlers without a second eager pass, because `trigger()` ran one on the quiet. `willTrigger()` carried a
special case for the value-change identifier for the same reason. `eager` was tracked per identifier, so one eager
action made every action under that identifier eager. And `unregisterAction` could not exist at all.

**What went away.** `triggerChain()`, `cloneWithoutValidators()`, `willTrigger()`'s special case and the
`eagerActions: Set<symbol>`. **What arrived.** `unregister()`, `triggerEagerFor()` and `hasEager`, each a walk of
the one array under a predicate of its own. Net about flat, and one concept — a chain that composes itself — is
gone.

`Transaction.whenCommitted()` stands. `Validator.unregisterFrom` defers one step through it — abandoning a run
already in flight, which is not something a rollback can put back — while the registration itself is released
inside the operation.

**`unregisterFrom` moved into the operation.** It used to run at commit, because releasing what an action installed
elsewhere was held to be beyond a rollback's reach. With the list it is not: the rollback re-registers the action
and announces it to it again, so the release is as reversible as the registration. Moving it also made
`Validator.unregisterFrom` possible — it withdraws the errors that validator put on the element, which has to happen
inside the transaction so the snapshot can put them back. Deferring it to commit would have written into elements
after the commit's announcement passes had finished, and nothing would have announced the result.

**Ordering: `registerActionBefore(action, before)`, not an index.** An index is measured against a list the caller
cannot see, and the off-by-one lands as a handler in the wrong layer of the onion rather than as an error. Naming
the action to sit inside says what the caller means, and a `before` that is not registered under the same identifier
throws instead of quietly appending.

**What did not go away: the recursion limit.** A handler reaches the next one by calling `supr`, so a group is
walked on the call stack whichever way it is stored. Measured on this repo: a single identifier on one element fires
about 1300 deep before `RangeError`, against about 1560 for the composed chain — the walk adds one frame per level.
The claim that the array retires the `RangeError` was wrong. What it does remove is the closure per registration
held for the element's lifetime: closures are now made at trigger time and only as deep as the run reaches.

**Cost.** S2a — one field write in a 1000-row list, the keystroke path — is unchanged: 0.0100 ms before, 0.0101 ms
after (plain), 0.0091 ms both (conditional), taking the minimum as the least noisy statistic. The closures moved
from registration time to trigger time and the write does not notice.

## D-033 — an abort is answered with on the asynchronous path too, and D-012 stands for everything else

**Version:** 0.17.1

`ActionsMap.run()` answers an `AbortEventHandlingException` with itself where the chain answered with a `Promise`:
the trigger's answer is a promise resolving to the exception rather than one rejecting with it, so
`Action.execute()` resolves with it. `triggerEager()` ends only the identifier group an abort was raised in on that
path as on the synchronous one.

**What forced it.** An abort is an answer, and one of the three the documented table names — a run a handler ended,
a run that reached no handler, a run whose handler answered `null`. The conversion sat in a synchronous `catch`, so
a single asynchronous handler anywhere in the chain took the answer out of that table and made it a rejection, and
the `*Changed*` setters discard what the trigger answers with, so on those paths it reached nothing but the
runtime's unhandled-rejection reporting.

**This does not reverse D-012.** That
entry decided that a handler that *fails* rejects the promise `execute()` answers, and that swallowing a submit
failure is worse than an unhandled rejection. It still holds: every exception but this one rejects, and nothing
routes a failure to a library-configured handler. What changed is only which of the two an abort is counted as.
Its sentence "nothing catches it inside the library" reads at the width the library then had, where the abort was
caught for the synchronous chain and not the asynchronous one.

**Rejected: a `then` member as the test for a promise.** A handler may answer with a value object that carries one,
and calling `then` on such an object replaces the answer with whatever that call returns — a `*Changing*` handler
answering with `{ then: () => 5 }` would have had `5` written as a `DisplayMode` where the setter previously threw.
The test is `value instanceof Promise`, which costs a promise from another realm or another promise library: an
abort raised under one of those still leaves as a rejection.

**Rejected: catching in `supr` as well as at the trigger.** Inside the chain the abort stays an exception, so a
handler that does not ask about it is unwound rather than handed an exception object as if it were the answer the
chain reached. A handler that means to observe one catches it, which is what the middle of a chain has to do for
any exception.

Documented in `docs/api/actions.md`, `docs/guide/migration.md` and `changelog.md`.
