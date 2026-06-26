/**
 * `langtell/cyrillic` — a cheap, roster-free Cyrillic language fast-path.
 *
 * Where {@link classifyBySnippet} (`langtell/classify`) scores a snippet
 * *relative to a candidate roster you pass in*, this is the opposite trade: a
 * fixed, zero-config discriminator for the four Cyrillic languages langtell
 * profiles — Ukrainian, Russian, Belarusian, Bulgarian — decided purely by
 * letters distinctive to each, with no profiles, no tokenization, and no franc.
 * Reach for it when you just need "is this Russian / is this Ukrainian?" on a
 * hot path and don't want to assemble a candidate set.
 *
 * Each language carries letters the others (mostly) don't:
 *   Ukrainian   — і ї є ґ
 *   Russian     — ы ё   (ъ э are shared with bg/be and handled separately)
 *   Belarusian  — ў     (uniquely Belarusian)
 *   Bulgarian   — ъ used as a vowel in nearly every word
 *
 * The shared letters `ъ` and `э` need care: `подъезд` is Russian, `съм
 * българин` is Bulgarian — both contain `ъ`. We disambiguate by density and
 * length: a single `ъ` in a short snippet leans RU; multiple `ъ` in longer text
 * leans BG. A lone `э` with no other distinctives stays `"unknown"` rather than
 * silently guessing (Russian uses it in loanwords/`Это`, Belarusian in
 * `гэта`/`сэрца`).
 *
 * Zero-dependency and side-effect-free. The cheap heuristic stays cheap; if a
 * use case needs more than letter signals can give, escalate to
 * {@link classifyBySnippet} or a franc-backed source.
 */

/** The four Cyrillic languages this fast-path tells apart, plus the `"unknown"`
 *  sentinel when letter signals are insufficient. */
export type CyrillicLanguage = "uk" | "ru" | "be" | "bg" | "unknown";

const UK_DISTINCTIVE = /[іїєґ]/gi;
const RU_DISTINCTIVE = /[ыё]/gi;
const BE_DISTINCTIVE = /ў/gi;
const HARD_SIGN = /ъ/gi;
const E_OBOROT = /э/gi;
// U+0400–U+04FF is the Cyrillic Unicode block; written as explicit \u escapes
// so the range bounds are unambiguous (regexp/no-obscure-range).
const CYRILLIC = /[\u0400-\u04FF]/g;

/** Minimum Cyrillic-letter count before the fallback guesses a language. Below
 *  this, a short snippet (`Привет`, `Хочу`) is too ambiguous to act on. */
const MIN_CYRILLIC_FOR_FALLBACK = 10;
/** Minimum text length before `ъ`-density is read as Bulgarian. Single-word
 *  Russian samples like `подъезд` (7 chars) would otherwise misclassify. */
const MIN_LEN_FOR_BG = 10;

/** The verdict from {@link detectCyrillicLanguage}: the chosen language plus the
 *  raw distinctive-letter tallies that drove a uk-vs-ru decision (informational;
 *  `ruScore` carries the deciding count for the ru/bg fallbacks too). */
export interface CyrillicVerdict {
  language: CyrillicLanguage;
  ukScore: number;
  ruScore: number;
}

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** Raw letter-signal tallies over `text`, one pass per distinctive class.
 *  Gathered up front so {@link detectCyrillicLanguage} reads as a pure decision
 *  cascade over these counts rather than interleaving counting and branching. */
interface Signals {
  ukScore: number;
  ruDistinctive: number;
  beScore: number;
  hardSigns: number;
  eOborot: number;
  cyrillicCount: number;
}

function countSignals(text: string): Signals {
  return {
    ukScore: count(text, UK_DISTINCTIVE),
    ruDistinctive: count(text, RU_DISTINCTIVE),
    beScore: count(text, BE_DISTINCTIVE),
    hardSigns: count(text, HARD_SIGN),
    eOborot: count(text, E_OBOROT),
    cyrillicCount: count(text, CYRILLIC),
  };
}

/**
 * Identify the Cyrillic language of `text` by distinctive letters, returning the
 * chosen language and the uk/ru tallies behind it. `"unknown"` when there is no
 * Cyrillic evidence, on a uk/ru tie, or when only an ambiguous `э` is present.
 */
export function detectCyrillicLanguage(text: string): CyrillicVerdict {
  const { ukScore, ruDistinctive, beScore, hardSigns, eOborot, cyrillicCount } = countSignals(text);

  // ў is uniquely Belarusian — strongest single signal.
  if (beScore > 0) {
    return { language: "be", ukScore, ruScore: ruDistinctive };
  }

  // Both UA and RU evidence present — a tie is "unknown", not a silent UA call
  // (which would misclassify Belarusian/Bulgarian whenever і or ё balances out).
  if (ukScore > 0 && ruDistinctive > 0) {
    if (ukScore === ruDistinctive) {
      return { language: "unknown", ukScore, ruScore: ruDistinctive };
    }
    return {
      language: ukScore > ruDistinctive ? "uk" : "ru",
      ukScore,
      ruScore: ruDistinctive,
    };
  }

  // Distinctive RU letters (ы, ё) with no UA evidence — unambiguously RU.
  if (ruDistinctive > 0) {
    return { language: "ru", ukScore, ruScore: ruDistinctive };
  }

  // Distinctive UA letters with no RU distinctives — UA.
  if (ukScore > 0) {
    return { language: "uk", ukScore, ruScore: 0 };
  }

  // Bulgarian: ъ as a vowel — multiple occurrences in non-trivial text, no UA /
  // RU distinctives. Length guard keeps short Russian compounds like `подъезд`
  // from sliding into BG.
  if (hardSigns >= 2 && text.length >= MIN_LEN_FOR_BG) {
    return { language: "bg", ukScore: 0, ruScore: hardSigns };
  }

  // Russian fallback: substantial Cyrillic with no UA, no BE distinctives, and
  // no э (which signals possible Belarusian). Catches short-but-clear Russian
  // text with none of ы/ё/ъ/э (`Привет, мир`, `Здравствуйте, меня зовут …`).
  if (cyrillicCount >= MIN_CYRILLIC_FOR_FALLBACK && eOborot === 0) {
    return { language: "ru", ukScore: 0, ruScore: 0 };
  }

  // Lone ъ (no э, no other distinctives) in shorter text — RU compound-word
  // pattern (подъезд, объект, съезд).
  if (hardSigns > 0 && eOborot === 0) {
    return { language: "ru", ukScore: 0, ruScore: hardSigns };
  }

  return { language: "unknown", ukScore: 0, ruScore: 0 };
}

/** Convenience predicate: `true` iff {@link detectCyrillicLanguage} calls `text`
 *  Russian. */
export function isRussian(text: string): boolean {
  return detectCyrillicLanguage(text).language === "ru";
}

/** Convenience predicate: `true` iff {@link detectCyrillicLanguage} calls `text`
 *  Ukrainian. */
export function isUkrainian(text: string): boolean {
  return detectCyrillicLanguage(text).language === "uk";
}
