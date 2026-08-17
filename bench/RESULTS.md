# List benchmark, after the value-cache and validity work

Same machine, same fixtures and same commands as `BASELINE.md`; the baseline column is that file's numbers.
Single-machine figures, meant for the before/after ratio rather than as absolute claims.

## Wall clock

| id | scenario | variant | before | after | factor |
|---|---|---|---:|---:|---:|
| S1a | `new List(tpl, { value: rows })`, 1000 rows | plain | 509.5 ms | 381.5 ms | 1.3× |
| S1a | | conditional | 521.8 ms | 389.2 ms | 1.3× |
| S1b | 1000 × `push()` | plain | 13 132.3 ms | 363.5 ms | **36.1×** |
| S1b | | conditional | 13 955.0 ms | 366.2 ms | **38.1×** |
| S2a | write one field in row 500 | plain | 32.95 ms | 0.0174 ms | **1894×** |
| S2a | | conditional | 33.06 ms | 0.0236 ms | **1401×** |
| S3 | `remove(500)` | plain | 27.07 ms | 0.7534 ms | **35.9×** |
| S3 | | conditional | 30.20 ms | 0.7653 ms | **39.5×** |
| S4a | `list.value = rows`, same length | plain | 476.9 ms | 58.37 ms | **8.2×** |
| S4a | | conditional | 461.2 ms | 57.68 ms | **8.0×** |
| S4b | `list.value = rows`, different length | plain | 461.0 ms | 58.82 ms | **7.8×** |
| S4b | | conditional | 464.9 ms | 58.12 ms | **8.0×** |
| S6 | read `list.valid` | plain | 11.30 ms | 0.0006 ms | **18 800×** |
| S6 | | conditional | 10.77 ms | 0.0008 ms | **13 500×** |
| S6 | write one field, then read `list.valid` | plain | 44.27 ms | 0.0204 ms | **2170×** |
| S6 | | conditional | 42.25 ms | 0.0217 ms | **1950×** |

The consistency check that matters: `push()`-filling a list now costs about the same as building it in one
assignment (366 ms against 382 ms), where it used to cost 26 times as much. That ratio is the quadratic
term, and it is what has gone.

`S4a`/`S4b` improve by a factor of eight rather than disappearing, because a whole-list assignment still writes
and resets every field of every row; what it no longer does is rebuild each row's object graph. The reset is
the bulk of what remains — about 4.5 µs per field over 8000 fields — and it is what makes a reused row
indistinguishable from a freshly built one. An early-out for a field already holding the assigned value would
return these two to about 22 ms, but it pays only when the assigned data equals what the list already holds,
which is the shape of this benchmark and not of a reload.

## Memory and structure

| metric | before | after |
|---|---:|---:|
| retained bytes per field | 2642 | 2423 |
| retained per 1000-row list | 20 643 KiB | 18 931 KiB |
| vue proxies per row | 9 | 9 |
| validator runs per row, `template.clone({ value })` | 16 (2 per field) | 16 (2 per field) |

RAM moves 8 %, which is the lazily allocated `ActionsMap` and the three saved `Group.value` walks. The proxy
count is untouched by design: one proxy per field is the current model and changing it is later work.

Validator runs per row stay at two per field. The second run does not come from the clone path — on that
path the constructor receives no validators, so the eager pass there runs nothing, and the single trigger in
`clone()` is what gives a standalone clone its errors. The second run comes from the `Group` constructor
assigning each member its row value, which fires `ValueChangedAction` and with it the eager pass. Removing
it means either cloning members with their final value, which moves each row field's `originalValue` off the
template and changes `isChanged` for a freshly loaded row, or moving the eager pass off the value setter.

## Not captured here

Allocations per row, for the reason `BASELINE.md` gives: counting them means counting constructor calls
inside the library, which cannot be observed without changing its source. Retained bytes per field stands in.

Re-render counts and `[Vue warn]` counts need a mounted component; this harness has none. Those live in
`src/reactivity-render.spec.ts`, which passes unedited.
