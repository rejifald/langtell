import type { LanguageEvidence } from "./types.js";

const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/u;

/**
 * Producer: script-level signals from the title text.
 *
 * Scaffold — emits a coarse script hint. The full distinctive-letter roster
 * logic (uk/ru/be/bg disambiguation, candidate-relative scoring) is ported from
 * the design in a later step; see DESIGN.md.
 */
export function evidenceFromText(text: string | undefined): LanguageEvidence[] {
  if (text === undefined || text.trim().length === 0) return [];
  const trimmed = text.trim();

  if (CYRILLIC_RE.test(trimmed)) {
    return [
      {
        kind: "title-script",
        language: "unknown",
        confidence: 0.3,
        source: "title-script",
        value: "cyrillic",
      },
    ];
  }
  if (LATIN_RE.test(trimmed)) {
    return [
      {
        kind: "title-script",
        language: "unknown",
        confidence: 0.25,
        source: "title-script",
        value: "latin",
      },
    ];
  }
  return [];
}
