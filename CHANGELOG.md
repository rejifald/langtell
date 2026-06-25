# langtell

## 0.3.0

### Minor Changes

- 4da7665: Expose the structured snippet verdict through a new opt-in `langtell/classify` entry.

  The candidate-relative ladder classifier already computes a richer verdict than the
  default `Classification` surfaces — which rung decided (distinctive letters →
  function words → frequent words → optional trigram backstop) and the integer
  `margin` (the winner's lead over the runner-up). A single `confidence` float can
  reconstruct neither. That structure is now exported, behind its own door, for the
  power-user cases that need it: per-rung safety gates and diagnostics/labeling.

  - New subpath `langtell/classify` exports `classifyBySnippet(text, candidates, rung3?)`
    and `FRANC_RUNG`, plus the types `SnippetVerdict` (`{ language, margin, rung, discriminating }`),
    `Rung`, `RungVerdict`, and `Rung3Resolver`. Zero-dependency and franc-free — scoring
    is relative to the roster you pass in, so nothing here pulls profile data or franc's
    tables (enforced by the same ESLint boundary as the rest of the core).
  - `langtell/profiles` adds `PROFILED_CODES` (the BCP-47 codes that ship a profile) and
    `hasProfile(code)`, so callers can narrow a roster to codes that will actually classify.

  Purely additive: the high-level `compile`/`detect`/`fuse` output (`language`,
  `confidence`, `evidence[]`) is unchanged. The default interface stays narrow; the
  rung/margin verdict is opt-in only.

## 0.2.0

### Minor Changes

- 8363915: Let callers express a non-discriminating script read.

  With a closed roster like `[uk, en]`, any Latin string used to resolve to `en` at
  ~0.95 simply because `en` was the only Latin candidate — the script picked the
  lone candidate without discriminating between any. There was no way to say "this
  script didn't choose; don't name the language from it."

  Two additive, non-breaking pieces:

  - The `title-script` evidence item now carries `discriminating: false` when its
    winning script is owned by ≤1 roster candidate (omitted otherwise, so the
    common case stays narrow). This is the inverse signal to the existing
    context-never-overrides-clear-script guard.
  - `fuse` and `compile` accept `nonDiscriminatingScript?: "candidate" | "unknown"`.
    Set `"unknown"` to resolve a non-discriminating read to `unknown` unless
    non-script evidence (a page tag, a `Content-Language` header) corroborates the
    same language.

  **Default is `"candidate"` (unchanged behavior), not `"unknown"`.** Treating a
  lone-candidate script as `unknown` by default would silently change every closed
  single-Latin-candidate roster and is the wrong default for the common case, where
  a closed roster intends the script to imply the language. The conservative
  "name a language only on real evidence" policy is the opt-in. The flag and option
  are purely additive: existing callers see identical results.

## 0.1.0

### Minor Changes

- 515d3d8: Implement the core detector: candidate-relative script/letter scoring with distinctive-letter disambiguation (uk/ru/be/bg), opt-in franc and on-device Chrome AI engines, ready-made language profiles (`langtell/profiles`), and evidence fusion with BCP-47 normalization and the context-never-overrides-clear-script guard.
