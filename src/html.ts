import type { LanguageEvidence } from "./types.js";
import { normalizeBCP47 } from "./internal/bcp47.js";

/**
 * Producer: language clues from an HTML string's metadata.
 *
 * Reads three independent declarations, each emitted as its own evidence item
 * (the fuser weighs them):
 *   - `<html lang>`                          → `html-lang`
 *   - `<meta http-equiv="content-language">` → `meta-content-language`
 *   - `<meta property="og:locale">`          → `meta-og-locale`
 *
 * Each extractor requires its attribute name to begin at a tag/attribute
 * boundary (whitespace or quote, never `\b`) and takes the first match in the
 * tag rather than the last, so lookalikes — `xml:lang=`, `data-lang=`,
 * `data-content=`, and `og:locale:alternate` (which lists the page's OTHER
 * locales, not its own) — are never mistaken for the real declaration.
 *
 * All tags are BCP-47-normalized (`uk-UA` → `uk`, `en_US` → `en`). Sync and
 * zero-dependency — regex extraction only, never a DOM parse.
 */
export function evidenceFromHtml(html: string | undefined): LanguageEvidence[] {
  if (html === undefined || html.trim().length === 0) return [];

  const out: LanguageEvidence[] = [];

  // <html lang="uk">. `[\s"']` (not `\b`) before `lang` keeps `xml:lang=` and
  // `data-lang=` from matching (`:` and `-` are non-word chars, so `\b` alone
  // would match there too); the lazy `[^>]*?` takes the first `lang=` in the
  // tag instead of the greedy default's last.
  const htmlLang = /<html\b[^>]*?[\s"']lang\s*=\s*["']?([^"'\s>]+)/i.exec(html)?.[1];
  pushTag(out, "html-lang", 0.7, htmlLang);

  // <meta http-equiv="content-language" content="uk"> (attribute order varies).
  const metaContentLang =
    /<meta\b[^>]*\bhttp-equiv=["']?content-language["']?[^>]*?[\s"']content\s*=\s*["']?([^"'\s>]+)/i.exec(
      html,
    )?.[1] ??
    /<meta\b[^>]*?[\s"']content\s*=\s*["']?([^"'\s>]+)["']?[^>]*\bhttp-equiv=["']?content-language/i.exec(
      html,
    )?.[1];
  pushTag(out, "meta-content-language", 0.6, metaContentLang);

  // <meta property="og:locale" content="uk_UA"> (attribute order varies).
  // The `(?=["'\s>])` lookahead requires the property value to terminate right
  // after "og:locale", so "og:locale:alternate" — the page's OTHER locales,
  // the opposite signal — is never read as the page's own locale.
  const ogLocale =
    /<meta\b[^>]*\bproperty=["']?og:locale(?=["'\s>])["']?[^>]*?[\s"']content\s*=\s*["']?([^"'\s>]+)/i.exec(
      html,
    )?.[1] ??
    /<meta\b[^>]*?[\s"']content\s*=\s*["']?([^"'\s>]+)["']?[^>]*\bproperty=["']?og:locale(?=["'\s>])/i.exec(
      html,
    )?.[1];
  pushTag(out, "meta-og-locale", 0.6, ogLocale);

  return out;
}

function pushTag(
  out: LanguageEvidence[],
  kind: "html-lang" | "meta-content-language" | "meta-og-locale",
  confidence: number,
  raw: string | undefined,
): void {
  const lang = normalizeBCP47(raw);
  if (lang === null) return;
  out.push({ kind, language: lang, confidence, source: kind, value: raw ?? "" });
}
