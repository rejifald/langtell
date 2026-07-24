import type {
  Classification,
  LanguageEvidence,
  LanguageProfile,
  NonDiscriminatingScript,
  Weights,
} from "./types.js";
import { normalizeBCP47 } from "./internal/bcp47.js";
import { scriptOfProfile, type ScriptName } from "./internal/classify.js";

export interface FuseOptions {
  weights?: Weights;
  /** The candidate roster. When present, incoming evidence tags are normalized
   *  into it (`uk-UA` → `uk`, `ua` → `uk`) so context signals (page/header
   *  locale) land on the same code the text rungs use. */
  candidates?: readonly LanguageProfile[];
  /** How to resolve a *non-discriminating* script read (one flagged
   *  `discriminating: false` — its winning script owned by ≤1 roster candidate).
   *  Default `"candidate"` keeps current behavior; `"unknown"` drops such a read
   *  unless non-script evidence corroborates the same language. See
   *  {@link NonDiscriminatingScript}. */
  nonDiscriminatingScript?: NonDiscriminatingScript;
}

/** Default per-kind weights. Clear lexical signal (script, explicit locale)
 *  outweighs contextual signal (page tags, headers). Callers override per
 *  `source` id or `kind` via {@link FuseOptions.weights}. */
const DEFAULT_KIND_WEIGHT: Record<string, number> = {
  "title-script": 1,
  "explicit-locale": 1,
  "chrome-ai": 1,
  "source-prior": 0.7,
  franc: 0.7,
  "node-lang": 0.65,
  "http-content-language": 0.6,
  "meta-content-language": 0.55,
  "meta-og-locale": 0.55,
  "html-lang": 0.5,
};

/** Evidence kinds that constitute *clear script evidence* — a verdict the text
 *  classifier or an on-device model reached by actually reading the string. The
 *  guard below forbids weaker page/header *context* from flipping these. */
const SCRIPT_KINDS = new Set<string>(["title-script", "franc", "chrome-ai"]);

/** A script verdict this confident is treated as settled — context may add to it
 *  but must not flip the winner to a different language. */
const SCRIPT_CONFIDENCE_FLOOR = 0.6;

/** Weight for a kind absent from {@link DEFAULT_KIND_WEIGHT}. */
const FALLBACK_KIND_WEIGHT = 0.5;

const MIN_WINNING_SCORE = 0.35;
const MIN_MARGIN = 0.12;

/**
 * Combine evidence into a single weighted verdict with an audit trail.
 *
 * Three steps:
 *  1. Normalize each item's language tag into the candidate roster (BCP-47:
 *     `uk-UA`/`ua` → `uk`) so text, page, and header signals agree on a code.
 *  2. Weighted argmax over languages (caller weights override per `source`/`kind`).
 *  3. Apply the guard **context must never override clear script evidence**: when
 *     the text classifier (or an on-device model) confidently read one language,
 *     weaker page/header context for a *different* language cannot win — a
 *     Ukrainian page chrome does not make a Latin/English title Ukrainian.
 */
export function fuse(
  evidence: readonly LanguageEvidence[],
  options: FuseOptions = {},
): Classification {
  const weights = options.weights ?? {};
  const normalized = normalizeEvidence(evidence, options.candidates);

  // Under `"unknown"`, a non-discriminating script read scores nothing on its own
  // — it's dropped from the tally and the pin below — but stays in the trail. AND
  // context written in a *different script* than that title is dropped too: a
  // foreign-script title's language is never named by page/transport context in
  // another script (a Latin title on a Ukrainian page is a foreign title in a
  // Ukrainian UI, not a Ukrainian title). The full `normalized` set is still
  // returned as evidence.
  const scoring =
    options.nonDiscriminatingScript === "unknown"
      ? filterForUnknownMode(normalized, options.candidates)
      : normalized;

  const scores = new Map<string, number>();
  for (const item of scoring) {
    if (item.language === "unknown") continue;
    const weight = weightFor(item, weights);
    scores.set(item.language, (scores.get(item.language) ?? 0) + clamp01(item.confidence) * weight);
  }

  // The context-vs-script guard: a confident script read pins the winner.
  const pinned = confidentScriptLanguage(scoring, weights);

  const { best, bestScore, secondScore } = argmax(scores, pinned);

  if (best === null || bestScore < MIN_WINNING_SCORE || bestScore - secondScore < MIN_MARGIN) {
    // A pinned script language still wins even on a thin margin — clear script
    // evidence is never demoted to "unknown" by competing context. The score must
    // be positive, not merely present: a language that scored nothing is not a
    // verdict, and naming it here would be naming it at confidence 0.
    const pinnedScore = pinned !== null ? (scores.get(pinned) ?? 0) : 0;
    if (pinned !== null && pinnedScore > 0) {
      return {
        language: pinned,
        confidence: clamp01(pinnedScore / (pinnedScore + 0.15)),
        evidence: [...normalized],
      };
    }
    return { language: "unknown", confidence: clamp01(bestScore), evidence: [...normalized] };
  }

  return {
    language: best,
    confidence: clamp01(bestScore / (bestScore + secondScore + 0.15)),
    evidence: [...normalized],
  };
}

/**
 * The multiplier for one evidence item: the caller's override by `source`, then
 * by `kind`, then the per-kind default.
 *
 * An override that is not a *usable* multiplier — not a finite number, or
 * negative — is **ignored**, and resolution falls through to the next step as if
 * the caller had not set it. Such a value is garbage input, not a stronger way to
 * say "this signal always wins": `Infinity` has no coherent meaning in a weighted
 * sum (against a 0-confidence item it yields `NaN`, which makes its language
 * unrankable) and it collapses the confidence ratio below to `Infinity/Infinity`;
 * a negative weight scores evidence *against* its own language, which this model
 * has no meaning for. Honoring either would name a language at a confidence the
 * `0..1` contract forbids, so the documented default is used instead.
 *
 * `0` **is** usable and is honored: it is how a caller silences a signal.
 *
 * Every weight this returns is therefore finite and ≥ 0, so — with confidences
 * clamped to `0..1` — every score is finite and ≥ 0 and the confidence ratios in
 * {@link fuse} are always well-defined.
 */
function weightFor(item: LanguageEvidence, weights: Weights): number {
  return (
    usableWeight(weights[item.source]) ??
    usableWeight(weights[item.kind]) ??
    DEFAULT_KIND_WEIGHT[item.kind] ??
    FALLBACK_KIND_WEIGHT
  );
}

/** The value itself when it can serve as a weight (finite, non-negative), else
 *  `undefined` so the caller's `??` chain falls through to the default. */
function usableWeight(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Normalize each item's tag into the roster's code space (BCP-47-aware). Items
 *  already `"unknown"` pass through untouched. Tags are BCP-47-normalized
 *  (`en-US` → `en`, `ua` → `uk`) so text, page, and header signals land on the
 *  same code. The normalized code is kept even when it falls outside the roster —
 *  argmax simply won't favor an out-of-roster context tag, but it stays in the
 *  audit trail.
 *
 *  The roster is accepted (and reserved) so a future revision can fold roster
 *  aliasing in without a signature change; today BCP-47 normalization alone
 *  reconciles the codes the producers emit. */
function normalizeEvidence(
  evidence: readonly LanguageEvidence[],
  _candidates: readonly LanguageProfile[] | undefined,
): LanguageEvidence[] {
  return evidence.map((item) => {
    if (item.language === "unknown") return item;
    const normalized = normalizeBCP47(item.language) ?? item.language;
    if (normalized === item.language) return item;
    return { ...item, language: normalized };
  });
}

/**
 * The scoring set under `nonDiscriminatingScript: "unknown"`. Two cuts:
 *
 *  1. Drop every *neutralized* non-discriminating script read (see
 *     {@link isNeutralized}) — it names a language only by being the lone
 *     candidate in its script, with nothing corroborating it.
 *  2. Drop context (page/transport) evidence whose language is in a **different
 *     script** than such a neutralized title. A foreign-script title's language
 *     is not the page's language: a Latin title on a `lang="uk"` page must not
 *     resolve to `uk`. Same-script context (an explicit `en` `Content-Language`
 *     for a Latin title) survives and may still name — or, among same-script
 *     candidates, disambiguate — the title.
 *
 * The second cut needs each language's script, which is derived from the
 * candidate roster's alphabets. When `candidates` is absent the scripts can't be
 * derived, so the cut is skipped and behavior falls back to cut 1 alone (the
 * 0.3.0 behavior) — never throwing.
 */
function filterForUnknownMode(
  normalized: readonly LanguageEvidence[],
  candidates: readonly LanguageProfile[] | undefined,
): LanguageEvidence[] {
  const surviving = normalized.filter((item) => !isNeutralized(item, normalized));

  const titleScript = nonDiscriminatingTitleScript(normalized, candidates);
  if (titleScript === null) return surviving;

  const scriptOf = scriptByCode(candidates ?? []);
  return surviving.filter((item) => {
    // Keep the script reads themselves and anything whose script we can't place;
    // only cross-script *context* in a known, different script is excluded.
    if (SCRIPT_KINDS.has(item.kind) || item.language === "unknown") return true;
    const itemScript = scriptOf.get(item.language);
    return itemScript === undefined || itemScript === titleScript;
  });
}

/** The script of the title under `"unknown"` mode, or `null` when there is no
 *  neutralized non-discriminating script read to anchor on (so no cross-script
 *  cut applies) or the roster can't place that read's language. */
function nonDiscriminatingTitleScript(
  normalized: readonly LanguageEvidence[],
  candidates: readonly LanguageProfile[] | undefined,
): ScriptName | null {
  if (candidates === undefined) return null;
  const scriptOf = scriptByCode(candidates);
  for (const item of normalized) {
    if (isNeutralized(item, normalized)) {
      const script = scriptOf.get(item.language);
      if (script !== undefined) return script;
    }
  }
  return null;
}

/** Map each roster code to the script of its alphabet (Cyrillic/Latin). Codes
 *  whose alphabet carries no Cyrillic/Latin letter are omitted. */
function scriptByCode(candidates: readonly LanguageProfile[]): Map<string, ScriptName> {
  const map = new Map<string, ScriptName>();
  for (const c of candidates) {
    const script = scriptOfProfile(c);
    if (script !== null) map.set(c.code, script);
  }
  return map;
}

/**
 * Whether a non-discriminating script read should score nothing (mode
 * `"unknown"`). True when `item` is a script kind flagged `discriminating:
 * false` (its winning script is owned by ≤1 roster candidate) AND no *non-script*
 * evidence corroborates its language. Corroboration must come from context kinds
 * (page tags, headers): two lone-candidate script reads agreeing is still two
 * defaults, not real evidence — so script kinds never corroborate one another.
 */
function isNeutralized(item: LanguageEvidence, all: readonly LanguageEvidence[]): boolean {
  if (item.discriminating !== false || !SCRIPT_KINDS.has(item.kind)) return false;
  return !all.some(
    (other) =>
      other.language === item.language &&
      other.language !== "unknown" &&
      !SCRIPT_KINDS.has(other.kind),
  );
}

/** The language of a *clear script* read confident enough to pin the verdict, or
 *  `null` when none qualifies. When two script reads disagree, the higher-
 *  confidence one pins (a tie leaves nothing pinned — argmax decides normally).
 *
 *  A read the caller weighed to `0` is silenced *here too*: it contributes no
 *  score, so it must not veto the rest of the evidence either. */
function confidentScriptLanguage(
  evidence: readonly LanguageEvidence[],
  weights: Weights,
): string | null {
  let best: string | null = null;
  let bestConfidence = 0;
  for (const item of evidence) {
    if (item.language === "unknown" || !SCRIPT_KINDS.has(item.kind)) continue;
    if (weightFor(item, weights) === 0) continue;
    const c = clamp01(item.confidence);
    if (c < SCRIPT_CONFIDENCE_FLOOR) continue;
    if (c > bestConfidence) {
      bestConfidence = c;
      best = item.language;
    } else if (c === bestConfidence && item.language !== best) {
      // Two equally-confident script reads for different languages — ambiguous.
      best = null;
    }
  }
  return best;
}

/**
 * Weighted argmax. When `pinned` is set (a confident script language), any
 * *other* language's score may only come from context kinds; that score is
 * capped so it can never exceed the pinned language. This enforces the guard
 * without discarding the context from the audit trail.
 */
function argmax(
  scores: Map<string, number>,
  pinned: string | null,
): { best: string | null; bestScore: number; secondScore: number } {
  let best: string | null = null;
  let bestScore = 0;
  let secondScore = 0;
  const pinnedScore = pinned !== null ? (scores.get(pinned) ?? 0) : 0;

  for (const [language, raw] of scores) {
    // Guard: a non-pinned language cannot out-score the pinned one.
    const score = pinned !== null && language !== pinned ? Math.min(raw, pinnedScore) : raw;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = language;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  // On a pinned tie (pinned capped equal to a context language), prefer pinned.
  if (pinned !== null && best !== pinned && bestScore === pinnedScore && pinnedScore > 0) {
    secondScore = bestScore;
    best = pinned;
    bestScore = pinnedScore;
  }
  return { best, bestScore, secondScore };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
