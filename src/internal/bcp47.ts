/**
 * BCP-47 / language-code normalization.
 *
 * Two entry points with deliberately different strictness:
 *  - {@link normalizeBCP47} — for inputs documented to be BCP-47 (`<html lang>`,
 *    hreflang, `Content-Language`): try the full string, then strip a
 *    region/script suffix (`en-US` → `en`, `zh_CN` → `zh`).
 *  - {@link normalizeLanguageCode} — strict exact-match only, for free-text
 *    contexts (URL slugs, link text) where a hyphen split could be a coincidence.
 *
 * Both resolve aliases that appear in the wild (`ua` → `uk`, `rus` → `ru`,
 * localized picker phrases) to a canonical ISO 639-1 code.
 */

/**
 * Aliases mapped to canonical ISO 639-1 codes. Keys are lowercased.
 *
 * Ukrainian is the load-bearing case: most sites use `ua` in URLs even though
 * the ISO code is `uk`. Both are accepted on input; `uk` is always output.
 *
 * Includes localized phrases users see in language pickers (`українською`,
 * `по-русски`, `in english`, …).
 */
const ALIASES: Record<string, string> = {
  // Ukrainian
  ua: "uk",
  uk: "uk",
  укр: "uk",
  українська: "uk",
  українською: "uk",
  "українська мова": "uk",
  "на українській": "uk",
  "українською мовою": "uk",
  ukrainian: "uk",
  "in ukrainian": "uk",

  // Russian
  ru: "ru",
  rus: "ru",
  рус: "ru",
  русский: "ru",
  "по-русски": "ru",
  "по русски": "ru",
  "русский язык": "ru",
  "на русском": "ru",
  russian: "ru",
  "in russian": "ru",
  російська: "ru",
  "російська мова": "ru",
  "по-російськи": "ru",
  "по російськи": "ru",

  // Belarusian
  be: "be",
  bel: "be",
  беларуская: "be",
  "беларуская мова": "be",
  belarusian: "be",
  "in belarusian": "be",

  // Bulgarian
  bg: "bg",
  bul: "bg",
  български: "bg",
  "български език": "bg",
  bulgarian: "bg",
  "in bulgarian": "bg",

  // English
  en: "en",
  eng: "en",
  english: "en",
  "in english": "en",
  англійська: "en",
  английский: "en",

  // Polish
  pl: "pl",
  pol: "pl",
  polski: "pl",
  "po polsku": "pl",
  polish: "pl",
  польська: "pl",

  // German
  de: "de",
  deu: "de",
  ger: "de",
  deutsch: "de",
  "auf deutsch": "de",
  german: "de",
  німецька: "de",

  // French
  fr: "fr",
  fra: "fr",
  français: "fr",
  francais: "fr",
  "en français": "fr",
  french: "fr",
  французька: "fr",

  // Spanish
  es: "es",
  spa: "es",
  español: "es",
  espanol: "es",
  "en español": "es",
  spanish: "es",
  іспанська: "es",

  // Italian
  it: "it",
  ita: "it",
  italiano: "it",
  "in italiano": "it",
  italian: "it",
  італійська: "it",
};

/**
 * Strict, exact-match lookup. Returns `null` for unknown inputs and does NOT
 * fall back to a hyphen prefix. Use anywhere a hyphen split could be a
 * coincidence — URL path segments (`/ru-return-warranty`), title attrs, link
 * text. The phrase aliases (`по-русски`, `in english`) are in the table
 * directly, so exact lookup still finds them.
 */
export function normalizeLanguageCode(input: string | undefined | null): string | null {
  if (input === undefined || input === null) return null;
  const cleaned = input.trim().toLowerCase();
  if (cleaned.length === 0) return null;
  return ALIASES[cleaned] ?? null;
}

/**
 * BCP-47-aware normalization: try the full string first, then strip a
 * region/script suffix (`en-US` → `en`, `zh_CN` → `zh`). Use ONLY for inputs
 * documented to be BCP-47 — `hreflang`, `<html lang>`, `Content-Language`,
 * `data-lang`/`data-locale` — never for free-text URL slugs.
 *
 * Falls back to the raw primary subtag when no alias matches, so a code outside
 * the alias table (e.g. `pt-BR` → `pt`) still resolves to its language. The
 * roster decides relevance downstream.
 */
export function normalizeBCP47(input: string | undefined | null): string | null {
  if (input === undefined || input === null) return null;
  const cleaned = input.trim().toLowerCase().replace(/_/g, "-");
  if (cleaned.length === 0) return null;
  const direct = ALIASES[cleaned];
  if (direct !== undefined) return direct;
  const head = cleaned.split("-")[0];
  if (head === undefined || head.length === 0) return null;
  return ALIASES[head] ?? head;
}

/**
 * Extract the primary subtag from a BCP-47-ish value, lowercased, then resolve
 * it through the alias table (`ua` → `uk`). Handles `Accept-Language`-style
 * comma lists (`en-US,en;q=0.9` → `en`). Returns `null` for empty/nullish.
 *
 * This is the header/HTML extraction helper: it tolerates the messy shapes those
 * sources carry (comma lists, `q` weights) where {@link normalizeBCP47} expects
 * a single tag.
 */
export function primarySubtag(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const first = value.split(",")[0]?.trim();
  if (first === undefined || first.length === 0) return null;
  // Drop a `;q=…` weight if present.
  const tag = first.split(";")[0]?.trim();
  return normalizeBCP47(tag);
}
