# langtell — design

The committed design for `langtell`, captured before implementation so the
shape is fixed and the rationale is recorded.

## What it is (the deep module)

`langtell` presents a narrow interface — essentially `compile(config) → detect` —
over a deep implementation: Unicode-script categorization, distinctive-letter
disambiguation (e.g. Ukrainian vs. Russian Cyrillic), regex extraction of HTML
locale tags and HTTP headers, pluggable statistical engines, and a weighted
evidence-fusion scorer with tie-breaking and guard rules. Callers never see
scripts, weights, or parsers — only a language verdict and the evidence behind
it.

## The unifying abstraction: evidence producers + a fuser

Every signal source is an **evidence producer** that emits
`LanguageEvidence[]` — it does not decide. A separate **fuser** combines all the
evidence into one weighted `Classification` with an audit trail.

```ts
type LanguageCode = string; // BCP-47; 'unknown' is a sentinel

interface LanguageEvidence {
  kind: EvidenceKind; // 'title-script' | 'html-lang' | 'http-content-language' | 'source-prior' | 'franc' | ...
  language: LanguageCode | "unknown";
  confidence: number; // 0..1
  value: string; // the raw signal, for the audit trail
}

interface Classification {
  language: LanguageCode | "unknown";
  confidence: number;
  evidence: LanguageEvidence[];
}
```

Producers (each its own subpath, so cost is isolated):

```ts
evidenceFromText(text, candidates?)   // sync, zero-dep  — script + distinctive letters
evidenceFromHtml(html)                // sync, zero-dep  — <html lang>, meta content-language, og:locale
evidenceFromHeaders(headers)          // sync, zero-dep  — Content-Language
evidenceFromFranc(text, candidates)   // sync, pulls franc (its own subpath)
chromeAiEngine / createChromeAiEngine // async, browser-only (its own subpath)
```

The built-in text producer needs a candidate roster to score against — its
signals are roster-relative (`і` decides Ukrainian only when Russian is also a
candidate), so it abstains when none is supplied. `compile({ candidates })`
binds the roster into the built-in text source for you.

The `franc` and `chrome-ai` engines are surfaced as `EvidenceSource` objects
(`francEngine`/`createFrancEngine(candidates)`,
`chromeAiEngine`/`createChromeAiEngine()`) rather than bare functions, because
they carry bound state (franc's roster scoping, chrome-ai's cached availability
and session). franc runs in-process and synchronously, so it is a `SyncSource`
and keeps the compiled `detect` synchronous; chrome-ai is an `AsyncSource`.

Ready-to-use {@link LanguageProfile} data (alphabets, word lists for uk/ru/be/
bg/en) ships behind the opt-in `langtell/profiles` subpath, never in the core —
the word corpora would dwarf the script-only core otherwise.

`fuse(evidence, { weights })` does the weighted argmax, normalizes BCP-47 tags
into the candidate roster, and applies the rule **context must never override
clear script evidence** (a Ukrainian page does not make a Latin title Ukrainian).

Its inverse is opt-in. When a roster is closed and one script has a single owner
(`en` is the only Latin candidate in `[uk, en]`), the script _picked_ that
candidate without discriminating between any — so the text producer flags the
read `discriminating: false`. `fuse(evidence, { nonDiscriminatingScript: "unknown" })`
(also exposed as a `compile` option) then resolves such a read to `unknown`
unless non-script evidence — a page tag, a `Content-Language` header —
corroborates the same language. The default stays `"candidate"`: the lone
candidate stands, so behavior is unchanged unless a caller opts in to the
roster-closed, evidence-only policy.

## `compile` → `detect`

`compile(config)` is a factory in the `ajv.compile(schema) → validate` mold: it
does the per-roster precompute once (distinctive-character membership maps,
weight tables, the input→source dispatch plan) and returns a configured `detect`
**function** — not an object. There is exactly one operation, so we return the
callable directly; auxiliary surface, if ever needed, attaches to the function
(non-breaking).

```ts
const detect = compile({ candidates: [UK, RU, EN], engines: [francEngine], weights });
```

### Sync/async is encoded in the type, not guarded at runtime

Sources are discriminated on a literal `sync` flag. `compile` is generic over the
engine tuple, and `detect`'s return type is conditional on whether any async
engine was registered:

```ts
interface SyncSource {
  readonly id: string;
  readonly sync: true;
  detect(input: DetectInput): LanguageEvidence[];
}
interface AsyncSource {
  readonly id: string;
  readonly sync: false;
  isAvailable?(): boolean | Promise<boolean>;
  detect(input: DetectInput, ctx: DetectContext): Promise<LanguageEvidence[]>;
}
type EvidenceSource = SyncSource | AsyncSource;

type HasAsync<E extends readonly EvidenceSource[]> =
  Extract<E[number], AsyncSource> extends never ? false : true;

type DetectFn<E extends readonly EvidenceSource[]> =
  HasAsync<E> extends true
    ? (input: DetectInput, ctx?: DetectContext) => Promise<Classification>
    : (input: DetectInput) => Classification;

function compile<const E extends readonly EvidenceSource[] = []>(
  config: DetectorConfig<E>,
): DetectFn<E>;
```

So an all-sync configuration yields a synchronous `detect` (no `await`
ceremony — important for server/worker hot paths), and registering an async
engine flips the type to `Promise<Classification>`. No `.sync()` sibling, no
runtime throw — the invalid state is unrepresentable. The `const` type parameter
(TypeScript 5.0+) infers the engines array as a literal tuple so `HasAsync` can
see the async members without callers writing `as const`. A widened
`EvidenceSource[]` degrades safely to async.

## Multiple engines at once

`compile({ engines: [...] })` takes an array (no fluent `.use()` chaining; build
the array conditionally where needed). The detector runs **all** applicable
producers and **fuses** their evidence — unlike a first-wins dispatcher, when two
engines disagree the verdict is resolved by weight. Each source declares the
inputs it reads (`'text' | 'html' | 'headers'`) so a source is skipped when its
input is absent. Async engines run concurrently under an `AbortSignal` deadline.

Optional `earlyExit: { minConfidence }` processes sources in priority order and
stops once the cheap tier clears the bar — so franc/chrome-ai are skipped when
script + HTML already settled it. This is "pay only for what you need" applied at
runtime, folding the cost-saving ladder in without a second code path.

## Packaging: pay only for what you need

One package, isolated entry points:

```jsonc
// package.json
"sideEffects": false,
"exports": {
  ".":           "./dist/index.js",      // zero-dep core + producers + fuse + compile
  "./text":      "./dist/text.js",
  "./html":      "./dist/html.js",
  "./headers":   "./dist/headers.js",
  "./fuse":      "./dist/fuse.js",
  "./franc":     "./dist/franc.js",      // pulls franc trigram tables
  "./chrome-ai": "./dist/chrome-ai.js"   // browser LanguageDetector
}
```

Hard rules that make this real:

- `sideEffects: false`, named exports only.
- **No runtime aggregator object** (`export const langtell = {...}` / default
  export) — it defeats tree-shaking. Namespacing is the consumer's import choice:
  `import * as langtell from "langtell"` shakes unused named exports; a value
  object does not.
- **The root never re-exports the heavy subpaths.** `franc`/`chrome-ai` stay
  their own imports, so `import * as langtell` never drags trigram tables into the
  light path.

Consumers choose ergonomics at the import site, at zero runtime cost:

```ts
import { compile } from "langtell"; // bare
import * as langtell from "langtell"; // namespaced: langtell.compile(...)
import { compile as compileLD } from "langtell"; // renamed inline
import { francEngine } from "langtell/franc"; // heavy — its own door
```

## Naming

`langtell` — the package's job is its name: _"tell me the language of this
string."_ It also reads the _tells_ (script, tags, headers — the giveaway
signals). The `lang` prefix supplies the domain that a bare brand would omit; the
name is two plain monosyllables, easy to say and type.

## License

MIT — the default for a small, dependency-light library.
