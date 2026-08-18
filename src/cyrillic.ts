/**
 * `langtell/cyrillic` — a cheap, roster-free Cyrillic language fast-path.
 *
 * Where {@link classifyBySnippet} (`langtell/classify`) scores a snippet
 * *relative to a candidate roster you pass in*, this is the opposite trade: a
 * fixed, zero-config discriminator for the four Cyrillic languages this fast-path
 * positively identifies — Ukrainian, Russian, Belarusian, Bulgarian — decided
 * purely by letters distinctive to each, with no profiles, no tokenization, and
 * no franc. Reach for it when you just need "is this Russian / is this
 * Ukrainian?" on a hot path and don't want to assemble a candidate set.
 *
 * Other Cyrillic languages langtell now profiles (Serbian, Macedonian, Kazakh)
 * are deliberately NOT positively detected here — that is the candidate-relative
 * classifier's job. This module only takes care not to MISLABEL them: text
 * carrying letters distinctive to sr/mk/kk (ђ ћ џ ѓ ќ ѕ љ њ ј, or the Kazakh
 * Turkic set ә ғ қ ң ө ұ ү һ) returns `"unknown"` so the snippet escalates to
 * the classifier instead of being silently called Russian by the fallbacks.
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
 * Every call is checked against the letters that argue with it before it is
 * returned: a verdict whose own alphabet cannot account for the snippet (`ы` in
 * a text called Ukrainian) is withdrawn to `"unknown"`. Positive signals alone
 * cannot tell a fifth language built from the same letters — Belarusian without
 * a `ў` — from the four this module claims.
 *
 * Zero-dependency and side-effect-free. The cheap heuristic stays cheap; if a
 * use case needs more than letter signals can give, escalate to
 * {@link classifyBySnippet} or a franc-backed source.
 */
import { stripQuoted } from "./internal/scrub.js";

/** The four Cyrillic languages this fast-path tells apart, plus the `"unknown"`
 *  sentinel when letter signals are insufficient. */
export type CyrillicLanguage = "uk" | "ru" | "be" | "bg" | "unknown";

const UK_DISTINCTIVE = /[іїєґ]/gi;
const RU_DISTINCTIVE = /[ыё]/gi;
const BE_DISTINCTIVE = /ў/gi;
const HARD_SIGN = /ъ/gi;
const E_OBOROT = /э/gi;
// Letters distinctive to Serbian / Macedonian / Kazakh — none of which this
// fast-path positively detects. Their presence only triggers a bail to
// `"unknown"` (escalate to the classifier) so the Russian fallbacks below never
// mislabel them. ј/љ/њ/џ are shared by sr+mk; ђ/ћ are Serbian, ѓ/ќ/ѕ Macedonian,
// and ә/ғ/қ/ң/ө/ұ/ү/һ the distinctive Kazakh Turkic set (і is excluded here — it
// is already Ukrainian-distinctive and handled above).
const SIBLING_DISTINCTIVE = /[ђћџѓќѕљњјәғқңөұүһ]/gi;
// U+0400–U+04FF is the Cyrillic Unicode block; written as explicit \u escapes
// so the range bounds are unambiguous (regexp/no-obscure-range).
const CYRILLIC = /[\u0400-\u04FF]/g;

/**
 * Per language, the letters its alphabet does NOT contain — evidence against a
 * call, whoever else the letter might belong to.
 *
 * The signal sets above only argue FOR a language, and a cascade of positive
 * signals has no way to notice that it is reading a fifth language built out of
 * the same letters. Belarusian is exactly that: `і` from the Ukrainian set, `ы`
 * and `ё` from the Russian one, and — in a snippet that happens to carry no `ў` —
 * nothing at all to say it is neither. `Мова і культура Беларусі маюць багатую
 * гісторыю` came back Ukrainian on four `і`s while a `ы` Ukrainian does not have
 * sat in the same sentence. These are the sets that see that.
 *
 * Each is the complement of that language's alphabet within the four, so every
 * entry is checkable against the profiles in `./profiles.ts`: uk has no ы/ё/ъ/э/ў,
 * ru no і/ї/є/ґ/ў, be no и/щ/ъ/ї/є/ґ, bg no ы/ё/э/і/ї/є/ґ/ў.
 */
const FOREIGN: Readonly<Record<Exclude<CyrillicLanguage, "unknown">, RegExp>> = {
  uk: /[ыёъэў]/gi,
  ru: /[іїєґў]/gi,
  be: /[ищъїєґ]/gi,
  bg: /[ыёэіїєґў]/gi,
};

/**
 * Share of a snippet's Cyrillic letters that may be foreign to a verdict before
 * the verdict is withdrawn.
 *
 * Set from the same measurement as the roster-relative classifier's
 * `CONTRADICTION_SHARE`, and deliberately identical to it: a snippet that is too
 * contradicted for one of langtell's detectors is too contradicted for the other,
 * and two thresholds would be two answers to one question. On this corpus a
 * genuine sibling citation inside monolingual prose sits at 0.6–0.9 %, while
 * Belarusian misread as Ukrainian sits at 2.3–5 %.
 */
const MAX_FOREIGN_SHARE = 0.02;

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
  /** Count of letters distinctive to sr/mk/kk (see {@link SIBLING_DISTINCTIVE}).
   *  Non-zero ⇒ bail to `"unknown"` before the Russian fallbacks. */
  siblingDistinctive: number;
}

function countSignals(text: string): Signals {
  return {
    ukScore: count(text, UK_DISTINCTIVE),
    ruDistinctive: count(text, RU_DISTINCTIVE),
    beScore: count(text, BE_DISTINCTIVE),
    hardSigns: count(text, HARD_SIGN),
    eOborot: count(text, E_OBOROT),
    cyrillicCount: count(text, CYRILLIC),
    siblingDistinctive: count(text, SIBLING_DISTINCTIVE),
  };
}

/**
 * Identify the Cyrillic language of `text` by distinctive letters, returning the
 * chosen language and the uk/ru tallies behind it. `"unknown"` when there is no
 * Cyrillic evidence, on a uk/ru tie, when only an ambiguous `э` is present, or
 * when the text contradicts the call — see {@link FOREIGN}.
 */
export function detectCyrillicLanguage(text: string): CyrillicVerdict {
  const verdict = decide(text);
  if (verdict.language === "unknown" || !contradicted(text, verdict.language)) return verdict;
  // The tallies are kept: they are the account of a call that was withdrawn, and
  // a caller escalating to the roster-relative classifier is better served by
  // "here is what the letters said, and it did not hold up" than by zeroes.
  return { ...verdict, language: "unknown" };
}

/**
 * Whether `text` carries enough letters `language` does not have to withdraw the
 * call. Counted as a share of Cyrillic letters, so a proper noun borrowed from a
 * neighbour (`Ђоковић` in a Russian sentence, ~1.5 %) reads as the loanword it is
 * while a whole sentence in another language does not.
 *
 * Quotations are left out of the count — someone else's words, in whatever
 * language they said them, are not evidence against this author. The positive
 * cascade above still reads the text whole; only this measurement excludes them,
 * exactly as the roster-relative classifier splits the two.
 */
function contradicted(text: string, language: Exclude<CyrillicLanguage, "unknown">): boolean {
  const own = stripQuoted(text);
  const cyrillic = count(own, CYRILLIC);
  if (cyrillic === 0) return false;
  return count(own, FOREIGN[language]) / cyrillic >= MAX_FOREIGN_SHARE;
}

/** The positive-signal cascade, before {@link detectCyrillicLanguage} checks the
 *  winner against the letters that argue with it. */
function decide(text: string): CyrillicVerdict {
  const { ukScore, ruDistinctive, beScore, hardSigns, eOborot, cyrillicCount, siblingDistinctive } =
    countSignals(text);

  // ў is uniquely Belarusian — strongest single signal.
  if (beScore > 0) {
    return { language: "be", ukScore, ruScore: ruDistinctive };
  }

  // Mislabel guard: letters distinctive to Serbian/Macedonian/Kazakh, none of
  // which this fast-path positively detects. Bail to `"unknown"` so the snippet
  // escalates to the candidate-relative classifier instead of being silently
  // labelled by the uk/ru/bg logic below. This fires BEFORE the uk/ru checks on
  // purpose: Kazakh shares і with Ukrainian and ы with Russian (тілі, тым), so a
  // Kazakh Turkic letter (ә/ғ/қ/…) must outrank a stray і/ы rather than letting
  // the text be called Ukrainian or Russian. Genuine uk/ru/be/bg text carries
  // none of these letters, so their detection above/below is unaffected.
  if (siblingDistinctive > 0) {
    return { language: "unknown", ukScore, ruScore: ruDistinctive };
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
