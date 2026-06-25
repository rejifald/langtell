/**
 * `langtell/franc` — the opt-in franc engine (trigram-based detection, ~187
 * languages). Importing this module statically pulls `franc` and its trigram
 * tables, so it lives behind its own subpath; the zero-dependency core never
 * imports it (enforced by an ESLint boundary rule). `franc` is declared as an
 * OPTIONAL peer dependency — install it only if you use this engine.
 *
 * The engine is a candidate-relative *backstop*: franc is scoped to the
 * candidates' ISO 639-3 codes (`only`), runs only on text past a length floor
 * where trigrams are reliable, and emits `kind: "franc"` evidence with franc's
 * own score-gap as the confidence. It abstains (emits nothing) when fewer than
 * two candidates carry an `iso6393`, when franc returns `und`, or when the
 * sample is too short.
 */
import { francAll } from "franc";
import type { LanguageEvidence, LanguageProfile, SyncSource } from "./types.js";
import { scopeCandidates } from "./internal/classify.js";

/** Minimum sample length, in characters. Below this trigrams are too noisy. */
const RUNG_MIN_LENGTH = 24;
/** Floor franc itself uses to bail to `und` rather than guess. */
const FRANC_MIN_LENGTH = 10;
/** Cap on text length sent to franc (longer adds cost, not accuracy). */
const DEFAULT_MAX_CHARS = 2000;

/**
 * Run franc scoped to the candidates' ISO 639-3 codes, mapping the winner back
 * to its BCP-47 code. Returns `null` when fewer than two candidates carry an
 * `iso6393` code or franc abstains (`und`). The margin is franc's own score-gap
 * (top1 − top2, 0..1).
 */
function francScore(
  text: string,
  scoped: readonly LanguageProfile[],
): { language: string; margin: number } | null {
  const byIso = new Map<string, string>();
  for (const c of scoped) if (c.iso6393 !== undefined) byIso.set(c.iso6393, c.code);
  if (byIso.size < 2) return null;
  const sample = text.slice(0, DEFAULT_MAX_CHARS);
  const ranked = francAll(sample, { only: [...byIso.keys()], minLength: FRANC_MIN_LENGTH });
  const top = ranked[0];
  if (!top || top[0] === "und") return null;
  const language = byIso.get(top[0]);
  if (language === undefined) return null;
  return { language, margin: top[1] - (ranked[1]?.[1] ?? 0) };
}

/**
 * Producer: the franc trigram backstop over `text`, scoped to `candidates`.
 * Synchronous — franc itself is sync. Emits at most one `kind: "franc"` item.
 */
export function evidenceFromFranc(
  text: string | undefined,
  candidates: readonly LanguageProfile[] | undefined,
): LanguageEvidence[] {
  if (text === undefined || text.trim().length < RUNG_MIN_LENGTH) return [];
  if (candidates === undefined || candidates.length === 0) return [];

  const scoped = scopeCandidates(text, candidates);
  const scored = francScore(text, scoped);
  if (scored === null) return [];

  return [
    {
      kind: "franc",
      language: scored.language,
      // franc's score-gap is 0..1; lift it into a usable confidence band.
      confidence: clamp01(0.4 + scored.margin * 0.5),
      source: "franc",
      value: scored.language,
    },
  ];
}

/**
 * Build a franc {@link SyncSource} bound to a candidate roster, for use in
 * `compile({ engines: [createFrancEngine(candidates)] })`. franc needs the
 * roster to scope its `only` restriction, so it is bound at construction (the
 * same shape `compile` uses to bind the built-in text producer).
 *
 * A `SyncSource` (not async): franc runs in-process and synchronously, so the
 * compiled `detect` stays synchronous — no `await` ceremony on the hot path.
 */
export function createFrancEngine(candidates: readonly LanguageProfile[]): SyncSource {
  return {
    id: "franc",
    sync: true,
    inputs: ["text"],
    detect: (input) => evidenceFromFranc(input.text, candidates),
  };
}

/**
 * A bare franc engine with no bound roster — it abstains until given candidates.
 * Prefer {@link createFrancEngine} with your roster; this default exists so the
 * engine has a stable named export and a no-config import works.
 */
export const francEngine: SyncSource = {
  id: "franc",
  sync: true,
  inputs: ["text"],
  detect: (input) => evidenceFromFranc(input.text, undefined),
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
