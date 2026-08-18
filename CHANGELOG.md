# langtell

## 0.6.1

### Patch Changes

- 374ddd0: fix(fuse): never name a language at `confidence: 0`

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

- e730de0: Withdraw a verdict the text itself contradicts, in both detectors.

  The rung ladder counts what each candidate uniquely **owns**, which can only
  argue _for_ a candidate — leaving a closed set defenceless against text written
  in a language it does not carry. Belarusian handed to `{uk, ru}` spent its `і`s
  electing Ukrainian while `ы`, `ў` and `э` — letters Ukrainian does not have at
  all — counted for nobody and stopped nothing.

  Both `classifyBySnippet` and the roster-free `detectCyrillicLanguage` fast-path
  now check the winner against the text one last time: a candidate whose own
  alphabet cannot account for 2 % of the letters (`CONTRADICTION_SHARE`) loses to
  `"unknown"`. The runner-up is not promoted — a set that cannot account for the
  text does not get a second guess at it. Widening the roster (adding `be`) makes
  the same snippets resolve.

  The threshold is measured, not picked: an in-language snippet quoting a sibling
  runs 0.3–0.9 %, a borrowed proper noun 1.4–1.5 %, and genuinely other-language
  text 2.3–17 %.

  Quotations are not held against the author who quoted them. They are scrubbed
  before the measurement alongside URLs and @handles — a Ukrainian article quoting
  a Russian sentence is still Ukrainian — unless the quotation IS the text (half
  the letters or more: a pull-quote, a headline in guillemets), in which case it is
  the content and is measured like any other. Paired double marks only (`«» "" “”
„“`), never the single forms that uk/be spell words with. The rung tallies still
  read the text whole; only the veto's measurement excludes quotations.

  New on `langtell/classify`: `textAlphabet(text)` derives the letters a text
  actually uses, once, and `contradictionOf(alphabet, profile)` asks one candidate
  to account for them — returning the letters it cannot and their weight. A report
  over a roster is then one pass plus a set lookup per candidate, on the same
  derivation the verdict used. `contradiction(text, profile)` is the one-text
  convenience; `CONTRADICTION_SHARE` is the threshold itself.

  The core bundle budget moves 3.25 kB → 3.35 kB: the veto and the derivation are
  reachable from `compile`, and 29 B of brotli is what they cost there.

  Also drops 23 Russian words (`это`, `ты`, `который`, …) that OpenSubtitles'
  Ukrainian content set had bled into `uk.words.frequent`. Each is spelled with a
  letter Ukrainian does not have, so it was never evidence for Ukrainian — but by
  sitting in both lists it cancelled the same word in Russian's, disarming a
  marker `ru` genuinely owns. `profiles.test.ts` now pins the invariant for every
  shipped list.

## 0.6.0

### Minor Changes

- 5d26cbd: Add Cyrillic-sibling language profiles: **sr** (Serbian, Cyrillic), **mk**
  (Macedonian), and **kk** (Kazakh, Cyrillic).

  - `langtell/profiles` now ships `sr`, `mk`, and `kk` profiles (alphabet,
    curated `words.function`, `words.frequent`, and `iso6393` `srp`/`mkd`/`kaz`),
    wired into the `PROFILES` registry, `PROFILED_CODES`, and the named exports.
    These let `classifyBySnippet`/`compile` discriminate Serbian, Macedonian, and
    Kazakh within a Cyrillic roster.
    - `mk` frequent words are corpus-derived from hermitdave/FrequencyWords
      (OpenSubtitles, `mk_50k.txt`). `kk` frequent words come from the smaller
      `kk_full.txt` (no curated 50k exists), filtered of subtitle proper nouns.
      `sr` uses a hand-curated Cyrillic content-word fallback because
      FrequencyWords Serbian is Latin-script only — flagged for native review.
  - `langtell/cyrillic`: the roster-free fast-path no longer mislabels Serbian,
    Macedonian, or Kazakh as Russian. Text carrying letters distinctive to
    sr/mk/kk (ђ ћ џ ѓ ќ ѕ љ њ ј, or the Kazakh Turkic set ә ғ қ ң ө ұ ү һ) now
    returns `"unknown"` so the snippet escalates to the classifier instead of
    falling through to the Russian default. The fast-path still only _positively_
    detects uk/ru/be/bg; `CyrillicVerdict` is unchanged.

- 0ca71bb: Per-node declared language joins the pipeline. `DetectInput` gains `attrs` — the detection subject's own attributes — and a fourth always-on producer turns them into `node-lang` context evidence, the `<html lang>` declaration concept one scope down. By default only the standardized global `lang` attribute counts; vendor conventions (e.g. Google's `data-rl` response-language label) are compile-time opt-ins via `DetectorConfig.nodeLangAttributes`. Evidence sources are namespaced (`node-lang:data-rl`) so fuse weights can target one attribute without colliding with engine ids. Semantics come from the existing fusion guard: a declaration decides when text evidence is weak or absent, and loses to a confident text read — a mislabeled node can't override what the classifier actually read. The low-level `evidenceFromNodeLang` producer and `DEFAULT_NODE_LANG_ATTRIBUTES` are exported for callers composing `fuse` directly.

## 0.5.0

### Minor Changes

- f6e44f3: BCP-47 normalization options and classifier scoping seams

  - `normalizeBCP47` gains an optional `{ unknownHead: "subtag" | "null" }` argument. The default (`"subtag"`) is unchanged — an unknown primary subtag still passes through (`pt-BR` → `pt`). Pass `"null"` to return `null` for any tag whose head isn't in the alias table, for callers that gate on a fixed alias set and read `null` as "not a language I handle". The new `NormalizeBCP47Options` type is exported from the root.
  - The alias table gains the Ukrainian exonym phrases for Polish, German, French, Spanish, and Italian (`польська мова`/`по-польськи`, `німецька мова`/`по-німецьки`, `французька мова`/`по-французьки`, `іспанська мова`/`по-іспанськи`, `італійська мова`/`по-італійськи`), bringing them to parity with the existing uk/ru entries.
  - `langtell/classify` now also exports `scopeCandidates` and `RUNG3_MIN_LENGTH`, so a caller injecting a rung-3 resolver can scope its own (unscoped) candidates and honor the trigram length floor consistently with the classifier rather than re-deriving them.

- 3431201: Add `langtell/cyrillic` — a roster-free Cyrillic language fast-path

  A new opt-in subpath exposing `detectCyrillicLanguage(text)` plus the `isRussian` / `isUkrainian` convenience predicates: a fixed, zero-config discriminator for the four Cyrillic languages langtell profiles (Ukrainian, Russian, Belarusian, Bulgarian), decided purely by distinctive letters — no candidate roster, no tokenization, no franc. It complements `classifyBySnippet` (`langtell/classify`), which scores relative to a roster you pass in; reach for `langtell/cyrillic` when you just need "is this Russian / is this Ukrainian?" on a hot path. Zero-dependency and side-effect-free.

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
