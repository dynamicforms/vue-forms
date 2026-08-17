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
