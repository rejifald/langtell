---
"langtell": patch
---

fix(fuse): never name a language at `confidence: 0`

`Classification.confidence` is documented `0..1`, but two caller-weight cases
produced a _named_ language at exactly `0` — a verdict no threshold check
(`confidence > x`) can catch:

- A non-finite weight (`weights: { "html-lang": Infinity }`) made the winning
  score infinite, so the confidence ratio was `Infinity/Infinity` → `NaN` → `0`.
- A weight of `0` on a script kind left that read pinning the verdict while
  scoring nothing, so the pinned fallback returned it at `0/0.15` → `0`.

A weight is now defined as a finite, non-negative multiplier. Values outside
that range (`Infinity`, `-Infinity`, `NaN`, negatives) are not a stronger way to
say "this signal always wins" — `Infinity` has no coherent meaning in a weighted
sum, and against a `0`-confidence item it yields `NaN` — so such a key is
**ignored** and resolves to the default weight as if it had not been set.

`0` remains meaningful and now silences a signal completely: it scores nothing,
and a silenced script read no longer pins the verdict against the rest of the
evidence either. Every other weight behaves exactly as before.
