# List benchmark, after transactions

Same machine, same fixtures and same commands as `BASELINE.md`. Three columns, and they are not the same
comparison:

- **0.6.1** is `BASELINE.md`, the state before any of the staged performance work.
- **0.7.0** and **0.8.0** were measured back to back in one session, from the same node build, two full runs
  each; every cell is the lower of the two run means. Only that pair is a controlled comparison — the 0.6.1
  column was taken on a different machine and reads about twice as slow for the same code.

## Wall clock

| id | scenario | variant | 0.6.1 | 0.7.0 | 0.8.0 | 0.7.0 → 0.8.0 |
|---|---|---|---:|---:|---:|---:|
| S1a | `new List(tpl, { value: rows })`, 1000 rows | plain | 509.5 ms | 183.9 ms | 192.8 ms | 1.05× slower |
| S1a | | conditional | 521.8 ms | 179.9 ms | 199.9 ms | 1.11× slower |
| S1b | 1000 × `push()` | plain | 13 132.3 ms | 183.3 ms | 186.4 ms | 1.02× slower |
| S1b | | conditional | 13 955.0 ms | 185.9 ms | 191.3 ms | 1.03× slower |
| S2a | write one field in row 500 | plain | 32.95 ms | 0.0081 ms | 0.0097 ms | 1.20× slower |
| S2a | | conditional | 33.06 ms | 0.0075 ms | 0.0100 ms | 1.33× slower |
| S3 | `remove(500)` | plain | 27.07 ms | 0.5163 ms | 0.5524 ms | 1.07× slower |
| S3 | | conditional | 30.20 ms | 0.5070 ms | 0.5264 ms | 1.04× slower |
| S4a | `list.value = rows`, same length | plain | 476.9 ms | 18.76 ms | 24.33 ms | **1.30× slower** |
| S4a | | conditional | 461.2 ms | 18.98 ms | 24.00 ms | **1.26× slower** |
| S4b | `list.value = rows`, different length | plain | 461.0 ms | 20.19 ms | 23.73 ms | 1.18× slower |
| S4b | | conditional | 464.9 ms | 19.07 ms | 23.96 ms | 1.26× slower |
| S6 | read `list.valid` | plain | 11.30 ms | 0.0003 ms | 0.0002 ms | — |
| S6 | | conditional | 10.77 ms | 0.0003 ms | 0.0003 ms | — |
| S6 | write one field, then read `list.valid` | plain | 44.27 ms | 0.0084 ms | 0.0129 ms | 1.54× slower |
| S6 | | conditional | 42.25 ms | 0.0070 ms | 0.0097 ms | 1.39× slower |

The two S6 write figures carry the most run-to-run spread of the set — ±5 % to ±9 % within a run — and S2a is
the same operation measured on its own. Read the pair together: the cost of a single field write is between 20 %
and 50 % more than 0.7.0, on an operation that takes ten microseconds.

Every acceptance figure the plan set against 0.6.1 still holds with room to spare: `push`-filling is 70× faster
where 20× was asked, a single-field write on a 1000-row list is 3400× faster where 50× was asked, and `remove`
is 49× faster where 10× was asked.

## What the transaction costs, and where

The two scenarios that move are the two that modify many elements at once. The cost has two parts, separated by
re-running S4a with the copy-on-first-write record disabled:

| | S4a plain | S4a conditional |
|---|---:|---:|
| 0.7.0 | 18.76 ms | 18.98 ms |
| 0.8.0 without the record | 24.13 ms | 22.30 ms |
| 0.8.0 | 24.33 ms | 24.00 ms |

A whole-list assignment modifies 8000 fields, 1000 rows and the list itself, so the record costs a fraction of a
microsecond per element and is the smaller share. The larger share is the transaction's own bookkeeping: one
participant per element, and two ordered passes over all of them at commit — values deepest first, then verdicts
deepest first.

Two implementation choices were measured on this scenario rather than argued:

- ordering the passes by depth uses one bucket per nesting depth. Selecting the deepest dirty participant before
  every announcement instead — exactly ordered, and quadratic — put S4a at 27.0 ms;
- carrying the action map inside each snapshot, under a symbol key, so that `clearValidators()` needed no undo of
  its own, put S4a at 26.9 ms. The map is now restored by an undo the operation registers, which no other
  operation pays for.

## Memory and structure

Measured in the same session as the wall clock above:

| | 0.7.0 | 0.8.0 |
|---|---:|---:|
| retained bytes per field, plain | 1489.8 | 1463.4 |
| retained bytes per field, conditional | 1525.5 | 1499.0 |
| retained KiB per 1000-row list, plain | 11 638.8 | 11 432.7 |
| retained KiB per 1000-row list, conditional | 11 918.4 | 11 710.9 |
| Vue proxies per row | 9 | 9 |
| validator runs per field, `new Field({ value, validators })` | 1 | 1 |
| validator runs per row | 16 | 16 |

Transactions add no per-element state: a participant record lives for the length of one operation and is dropped
with the transaction.

## Not captured here

Allocations per row, for the reason `BASELINE.md` gives: counting them means counting constructor calls inside
the library, which cannot be observed without changing its source. Retained bytes per field stands in.

Re-render counts and `[Vue warn]` counts need a mounted component; this harness has none. Those live in
`src/reactivity-render.spec.ts`, which passes unedited.

---

# 0.9.0

Same machine, same fixtures and same commands. The 0.8.0 column is carried over from the table above rather than
re-measured, so this comparison crosses sessions and is not the controlled one that pair is. Two full runs of
0.9.0; every cell is the lower of the two run means.

The fixtures build lists of `Group`s of `Field`s and contain no `Action`, so this release changes nothing they
exercise. The point of the run is that it says so.

## Wall clock

| id | scenario | variant | 0.8.0 | 0.9.0 |
|---|---|---|---:|---:|
| S1a | `new List(tpl, { value: rows })`, 1000 rows | plain | 192.8 ms | 188.3 ms |
| S1a | | conditional | 199.9 ms | 196.2 ms |
| S1b | 1000 × `push()` | plain | 186.4 ms | 186.9 ms |
| S1b | | conditional | 191.3 ms | 190.0 ms |
| S2a | write one field in row 500 | plain | 0.0097 ms | 0.0100 ms |
| S2a | | conditional | 0.0100 ms | 0.0118 ms |
| S3 | `remove(500)` | plain | 0.5524 ms | 0.5587 ms |
| S3 | | conditional | 0.5264 ms | 0.5006 ms |
| S4a | `list.value = rows`, same length | plain | 24.33 ms | 24.22 ms |
| S4a | | conditional | 24.00 ms | 24.45 ms |
| S4b | `list.value = rows`, different length | plain | 23.73 ms | 24.57 ms |
| S4b | | conditional | 23.96 ms | 24.26 ms |
| S6 | read `list.valid` | plain | 0.0002 ms | 0.0003 ms |
| S6 | | conditional | 0.0003 ms | 0.0003 ms |
| S6 | write one field, then read `list.valid` | plain | 0.0129 ms | 0.0114 ms |
| S6 | | conditional | 0.0097 ms | 0.0117 ms |

Every cell is inside the run-to-run spread the 0.8.0 section records for it, and the microsecond scenarios carry
the widest of it: S2a and the S6 write are the same operation measured twice, and they move in opposite
directions here.

## Memory and structure

| | 0.8.0 | 0.9.0 |
|---|---:|---:|
| retained bytes per field, plain | 1463.4 | 1463.3 |
| retained bytes per field, conditional | 1499.0 | 1499.0 |
| retained KiB per 1000-row list, plain | 11 432.7 | 11 432.2 |
| retained KiB per 1000-row list, conditional | 11 710.9 | 11 711.1 |
| Vue proxies per row | 9 | 9 |
| validator runs per field, `new Field({ value, validators })` | 1 | 1 |
| validator runs per row | 16 | 16 |

`busy` allocates a Vue ref per action, in a `WeakMap` outside the action, and only for an action somebody
executes or reads the flag on. No element gains a byte until then, which is what the unchanged per-field figures
say.

---

# 0.10.0

Same machine, same fixtures and same commands. The 0.9.0 column is carried over from the table above rather than
re-measured, so this comparison crosses sessions. Two full runs of 0.10.0; every cell is the lower of the two run
means.

The fixtures carry no `CompareTo`, so the plain variant exercises none of this release: its item template holds
eight `Required`s and one `ValueChangedAction`, none of which reads a second element. The conditional variant is
where the release shows, because a `ConditionalVisibilityAction` on `f1` driven by `f0` is exactly the rule that
cannot be answered while a row is still a set of loose clones.

## Wall clock

| id | scenario | variant | 0.9.0 | 0.10.0 |
|---|---|---|---:|---:|
| S1a | `new List(tpl, { value: rows })`, 1000 rows | plain | 188.3 ms | 196.1 ms |
| S1a | | conditional | 196.2 ms | 223.4 ms |
| S1b | 1000 × `push()` | plain | 186.9 ms | 195.5 ms |
| S1b | | conditional | 190.0 ms | 210.3 ms |
| S2a | write one field in row 500 | plain | 0.0100 ms | 0.0107 ms |
| S2a | | conditional | 0.0118 ms | 0.0098 ms |
| S3 | `remove(500)` | plain | 0.5587 ms | 0.5129 ms |
| S3 | | conditional | 0.5006 ms | 0.5412 ms |
| S4a | `list.value = rows`, same length | plain | 24.22 ms | 24.70 ms |
| S4a | | conditional | 24.45 ms | 25.37 ms |
| S4b | `list.value = rows`, different length | plain | 24.57 ms | 25.37 ms |
| S4b | | conditional | 24.26 ms | 26.29 ms |
| S6 | read `list.valid` | plain | 0.0003 ms | 0.0002 ms |
| S6 | | conditional | 0.0003 ms | 0.0003 ms |
| S6 | write one field, then read `list.valid` | plain | 0.0114 ms | 0.0110 ms |
| S6 | | conditional | 0.0117 ms | 0.0099 ms |

The two build scenarios are the ones that move, and only for the conditional variant: 1.14× and 1.11× the 0.9.0
figures. Every other cell is inside the spread its own run reports — S1a itself carries ±9 % to ±16 % across
samples, so read the build pair as the measurement and the rest as noise.

## What the second eager pass costs

The conditional row is built by cloning `f1` before it holds either its siblings or its row, so the pass that
applies the condition reaches nothing and is run again once the row is assembled. Re-running the build with that
second pass suppressed, in the same session:

| | S1a conditional | S1b conditional |
|---|---:|---:|
| second pass suppressed | 216.6 ms | 209.6 ms |
| 0.10.0 | 223.4 ms | 210.3 ms |

About 3 % of building a 1000-row list, and nothing measurable on the `push` path. It is paid once per element
that asked for it and never by an element that answered on its first pass — a form whose rules all resolve where
they are declared reads a counter and walks nothing.

## Memory and structure

| | 0.9.0 | 0.10.0 |
|---|---:|---:|
| retained bytes per field, plain | 1463.3 | 1509.8 |
| retained bytes per field, conditional | 1499.0 | 1564.1 |
| retained KiB per 1000-row list, plain | 11 432.2 | 11 795.2 |
| retained KiB per 1000-row list, conditional | 11 711.1 | 12 219.9 |
| Vue proxies per row | 9 | 9 |
| validator runs per field, `new Field({ value, validators })` | 1 | 1 |
| validator runs per row | 16 | 16 |

The per-field growth is what an element and its actions now hold per element rather than per instance: a slot
recording what the element was declared as, in the state object every element already carries, and the record a
validator keeps about a field, which is an object where it was a number. That is the 3 % in the plain column. The
conditional column adds what the conditional action keeps about each row and the entry saying which elements it
drives.

Proxies per row are unchanged, and so are the validator runs the harness counts: the template it counts them over
carries validators only, none of which reads a second element, so nothing in it asks for a second pass. Where an
element does ask — `f1` of the conditional variant — the second pass re-runs that element's eager actions, its own
validators included. That is what the build column measures, and it is per element that asked rather than per
element.
