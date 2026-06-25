import type { Classification, LanguageEvidence, Weights } from "./types.js";

export interface FuseOptions {
  weights?: Weights;
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
  "http-content-language": 0.6,
  "meta-content-language": 0.55,
  "meta-og-locale": 0.55,
  "html-lang": 0.5,
};

const MIN_WINNING_SCORE = 0.35;
const MIN_MARGIN = 0.12;

/**
 * Combine evidence into a single weighted verdict with an audit trail.
 *
 * Scaffold: weighted argmax over languages. The "context must never override
 * clear script" guard and BCP-47 roster normalization are ported next; see
 * DESIGN.md.
 */
export function fuse(
  evidence: readonly LanguageEvidence[],
  options: FuseOptions = {},
): Classification {
  const weights = options.weights ?? {};
  const scores = new Map<string, number>();

  for (const item of evidence) {
    if (item.language === "unknown") continue;
    const weight =
      weights[item.source] ?? weights[item.kind] ?? DEFAULT_KIND_WEIGHT[item.kind] ?? 0.5;
    scores.set(item.language, (scores.get(item.language) ?? 0) + clamp01(item.confidence) * weight);
  }

  let best: string | null = null;
  let bestScore = 0;
  let secondScore = 0;
  for (const [language, score] of scores) {
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = language;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (best === null || bestScore < MIN_WINNING_SCORE || bestScore - secondScore < MIN_MARGIN) {
    return { language: "unknown", confidence: clamp01(bestScore), evidence: [...evidence] };
  }

  return {
    language: best,
    confidence: clamp01(bestScore / (bestScore + secondScore + 0.15)),
    evidence: [...evidence],
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
