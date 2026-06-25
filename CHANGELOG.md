# langtell

## 0.4.0

### Minor Changes

- 1d6c775: Make `nonDiscriminatingScript: "unknown"` script-aware: context written in a
  different script than the title can no longer name the title's language.

  Previously, when a non-discriminating script read was dropped under `"unknown"`
  mode (e.g. a Latin title against a `[uk, en]` roster), surrounding page/transport
  context could still win — so a Latin title on a `lang="uk"` page resolved to `uk`.
  A foreign-script title's language is not the page's language.

  Now, when resolving such a title, the fuser derives the title's script from the
  candidate roster's alphabets and ignores context evidence whose language is in a
  different script. Same-script context (an explicit `Content-Language: en` for a
  Latin title, or a `de` page locale among the same-script candidates `[en, de]`)
  may still name or disambiguate the title; cross-script context cannot. With
  nothing valid remaining, the verdict is `unknown`.

  The cut needs `candidates` to map each language to its script. When `candidates`
  is absent the scripts can't be derived, so behavior falls back to the previous
  0.3.0 mode (it does not throw). The default mode (option unset / `"candidate"`)
  is unchanged.

## 0.3.1

### Patch Changes

- 71965dd: Make `classifyBySnippet` and `Rung3Resolver` generic over the concrete profile
  type (`langtell/classify`).

  `classifyBySnippet<P extends LanguageProfile = LanguageProfile>(text, candidates, rung3?)`
  now infers `P` from `candidates`, and `Rung3Resolver<P extends LanguageProfile = LanguageProfile>`
  is typed over the same `P`. A consumer that defines a stricter profile (e.g.
  `words` required) can hand its own `rung3` resolver straight to
  `classifyBySnippet` with no adapter and no `as` — previously the stricter
  resolver was rejected against the `words`-optional base type because parameter
  positions are contravariant.

  Types-only and non-breaking: the generic defaults to `LanguageProfile`, so the
  bare two-argument form, the base `Rung3Resolver`, and every existing call site
  type-check and behave exactly as before. Runtime behavior is unchanged.

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
