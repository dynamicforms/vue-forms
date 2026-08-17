# List benchmark baseline

Numbers for 0.6.1 as it stands, taken before any of the staged performance work. They exist to be compared
with a re-run after each step; they are single-machine figures, not absolute claims about the library.

Machine: AMD Ryzen 5 5600GT, 12 threads, 31 GiB RAM, Linux 6.1.0-43-amd64, node v26.7.0, vitest 3.2.4.

## Commands

```
npx vitest bench --run                     # ops/s table, optionally with --outputJson=<path>
node src/__bench__/build-harness.mjs       # retained heap, proxies per row, validator runs
```

The second command bundles `memory-harness.mjs` and starts it as `node --expose-gc
node_modules/.cache/vue-forms-bench/memory-harness.mjs`; that process spawns one child per heap sample.

## Fixture

One row is a `Group` of 8 fields, each carrying one `Required` validator, with a `ValueChangedAction` on `f0`.
The `conditional` variant adds a `ConditionalVisibilityAction` on `f1` driven by `f0` of the same row, so a
write to a row runs a cross-field action. Lists hold 1000 rows; the single-field write and the removal address
row 500, and the write goes to `f3`, which carries no action of its own.

## Scenarios

| id | scenario | variant | ops/s | mean ms | median ms | p99 ms | rme | samples |
|---|---|---|---:|---:|---:|---:|---:|---:|
| S1a | `new List(tpl, { value: rows })`, 1000 rows | plain | 1.96 | 509.5 | 492.8 | 663.8 | ±8.1 % | 10 |
| S1a | | conditional | 1.92 | 521.8 | 488.9 | 819.3 | ±14.4 % | 10 |
| S1b | 1000 × `push()` | plain | 0.076 | 13132.3 | 12698.8 | 14028.0 | ±14.7 % | 3 |
| S1b | | conditional | 0.072 | 13955.0 | 13940.6 | 15016.4 | ±18.8 % | 3 |
| S2a | write one field in row 500, nothing mounted | plain | 30.35 | 32.95 | 32.48 | 36.90 | ±1.1 % | 100 |
| S2a | | conditional | 30.25 | 33.06 | 32.39 | 39.63 | ±1.5 % | 100 |
| S3 | `remove(500)` | plain | 36.93 | 27.07 | 26.25 | 32.79 | ±3.9 % | 20 |
| S3 | | conditional | 33.12 | 30.20 | 28.86 | 37.81 | ±5.0 % | 20 |
| S4a | `list.value = rows`, same length | plain | 2.10 | 476.9 | 475.9 | 506.8 | ±2.8 % | 10 |
| S4a | | conditional | 2.17 | 461.2 | 462.1 | 467.2 | ±0.7 % | 10 |
| S4b | `list.value = rows`, different length | plain | 2.17 | 461.0 | 460.1 | 477.1 | ±1.2 % | 10 |
| S4b | | conditional | 2.15 | 464.9 | 465.9 | 469.9 | ±0.7 % | 10 |
| S6 | read `list.valid`, no write in between | plain | 88.48 | 11.30 | 11.44 | 13.29 | ±1.6 % | 100 |
| S6 | | conditional | 92.85 | 10.77 | 10.72 | 11.74 | ±0.9 % | 100 |
| S6 | write one field in row 500, then read `list.valid` | plain | 22.59 | 44.27 | 43.71 | 51.53 | ±1.3 % | 100 |
| S6 | | conditional | 23.67 | 42.25 | 42.13 | 47.62 | ±1.1 % | 100 |

Derived: a row costs 0.51 ms when the list is built in bulk and 13.1 ms when it arrives through `push()`, a
factor of 26 over 1000 rows. A single-field write costs 33 ms with nothing mounted, and 44 ms when the
validity of the list is read after it.

### What each scenario measures

S1b builds its own list, so the 1000 `push()` calls are the sample. S2a, S3, S4a, S4b and S6 work on a list
the scenario builds on its first call, which lands outside the recorded samples; the file keeps one 1000-row
list alive at a time.

S3 is destructive and there is no per-sample setup hook, so the same list serves every sample and is one row
shorter after each: the 20 samples cover a list shrinking from 1000 to 978 rows. S4b alternates a 1000-row
and a 1001-row array, so every assignment lands on a list whose length differs from the one assigned. S2a and
the second S6 write a different value on every sample, so no write returns early from the value setter.

S6 appears in two forms because a validity read costs a full traversal of the list today and therefore does
not depend on what preceded it. Once the read path is memoised, the paired form is the one that carries the
information.

## Memory and structure

| metric | plain | conditional |
|---|---:|---:|
| retained bytes per field | 2642 | 2678 |
| retained per 1000-row list | 20 643 KiB | 20 922 KiB |
| vue proxies per row | 9 | 9 |
| vue proxies per 1000-row list | 9 001 | 9 001 |
| vue proxies for the item template | 9 | 9 |
| validator runs per field, `new Field({ value, validators })` | 1 | 1 |
| validator runs per row, `template.clone({ value })` | 16 (2 per field) | 16 (2 per field) |
| validator runs per row, `new List(tpl, { value: [row] })` | 16 (2 per field) | 16 (2 per field) |

Retained heap is the difference of two `process.memoryUsage().heapUsed` readings taken across a full
collection, with 10 lists of 1000 rows reachable at the second one, divided by the 80 000 fields they hold.
It is the median of three runs; one batch per process, because a collection cannot be counted on to release
a batch an earlier measurement in the same process built. The three runs differ by 0.001 %.

The proxy count is the number of `reactive()` calls the library makes, counted by a substitute module the
bundler puts in front of `vue`. Proxies Vue creates on its own when a nested object is read through a field's
proxy — `field.errors` is the one that occurs here — are not in the count.

Validator runs are counted with a validator whose only work is counting. Two runs per field is what a row
built from an item template costs, through the `clone` path and through the `List` path alike.

## Not captured here

**Allocations per row.** Counting every object a row allocates means counting constructor calls inside
`FieldBase`, `ActionsMap` and the action classes, which cannot be observed from outside the library without
changing its source. Retained bytes per field stands in for it, and it is the metric that decides how much
RAM a 1000-row list actually costs.

**Mounted scenarios.** Re-render counts and `[Vue warn]` counts need a mounted component; this harness has no
mounted scenario and reports neither.

## Harness files

`fixtures.ts` builds the item templates and the row data; `list.bench.ts` holds the scenarios; `build-harness.mjs`
bundles and runs `memory-harness.mjs`, substituting `vue-proxy-counter.mjs` for `vue`. None of it changes the
library source.

The directory holds no spec file, so `npx vitest run` collects the same 26 files and 360 tests as before. The
coverage configuration includes `src/**/*`, so these files do appear in a coverage report as uncovered.
