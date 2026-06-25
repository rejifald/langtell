import type { LanguageEvidence, LanguageProfile } from "./types.js";
import { classifyBySnippet, type Rung, type Rung3Resolver } from "./internal/classify.js";

/**
 * Producer: candidate-relative script + lexical signals from the title text.
 *
 * Wraps the ported snippet classifier ({@link classifyBySnippet}): noise strip →
 * dominant-script scope → distinctive letters (rung 1) → function words (2a) →
 * frequent words (2b). The `candidates` roster makes scoring roster-relative —
 * `і` decides Ukrainian only when Russian is also a candidate. Sync and
 * zero-dependency; the optional franc rung is injected via `rung3`.
 *
 * Emits at most one `kind: "title-script"` evidence item. The classifier's
 * integer `margin` (the winner's lead over the runner-up) maps to a 0..1
 * `confidence`: a verdict at all means the dominant script and the deciding rung
 * agreed, so the floor is high; a wider lead nudges it up. With no candidates
 * (or no usable distinctive signal) it abstains — emitting nothing rather than a
 * coarse "unknown", since the roster decides relevance.
 */
export function evidenceFromText(
  text: string | undefined,
  candidates?: readonly LanguageProfile[],
  rung3?: Rung3Resolver,
): LanguageEvidence[] {
  if (text === undefined || text.trim().length === 0) return [];
  if (candidates === undefined || candidates.length === 0) return [];

  const verdict = classifyBySnippet(text, candidates, rung3);
  if (verdict.language === "unknown") return [];

  return [
    {
      kind: "title-script",
      language: verdict.language,
      confidence: marginToConfidence(verdict.margin, verdict.rung),
      source: "title-script",
      value: text.trim().slice(0, 80),
    },
  ];
}

/**
 * Map the classifier's per-rung lead to a 0..1 confidence.
 *
 * Rungs 1–2 carry an integer count of distinctive items (≥1). A verdict already
 * means script + rung agreed, so the floor is high (0.6) and each extra
 * distinctive item adds up to a 0.35 bonus, saturating by a lead of 4. Rung 3
 * (franc) carries franc's own 0..1 score-gap, which is weaker evidence, so it is
 * scaled into a 0.4..0.75 band.
 */
function marginToConfidence(margin: number, rung: Rung): number {
  if (rung === 3) {
    // franc score-gap is already 0..1; weaker than the distinctive rungs.
    return clamp01(0.4 + Math.min(Math.max(margin, 0), 1) * 0.35);
  }
  const lead = Math.max(margin, 1);
  return clamp01(0.6 + (Math.min(lead, 4) / 4) * 0.35);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
