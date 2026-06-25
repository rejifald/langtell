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
 * All tags are BCP-47-normalized (`uk-UA` → `uk`, `en_US` → `en`). Sync and
 * zero-dependency — regex extraction only, never a DOM parse.
 */
export function evidenceFromHtml(html: string | undefined): LanguageEvidence[] {
  if (html === undefined || html.trim().length === 0) return [];

  const out: LanguageEvidence[] = [];

  const htmlLang = /<html\b[^>]*\blang=["']?([^"'\s>]+)/i.exec(html)?.[1];
  pushTag(out, "html-lang", 0.7, htmlLang);

  // <meta http-equiv="content-language" content="uk"> (attribute order varies).
  const metaContentLang =
    /<meta\b[^>]*\bhttp-equiv=["']?content-language["']?[^>]*\bcontent=["']?([^"'\s>]+)/i.exec(
      html,
    )?.[1] ??
    /<meta\b[^>]*\bcontent=["']?([^"'\s>]+)["']?[^>]*\bhttp-equiv=["']?content-language/i.exec(
      html,
    )?.[1];
  pushTag(out, "meta-content-language", 0.6, metaContentLang);

  // <meta property="og:locale" content="uk_UA"> (attribute order varies).
  const ogLocale =
    /<meta\b[^>]*\bproperty=["']?og:locale["']?[^>]*\bcontent=["']?([^"'\s>]+)/i.exec(html)?.[1] ??
    /<meta\b[^>]*\bcontent=["']?([^"'\s>]+)["']?[^>]*\bproperty=["']?og:locale/i.exec(html)?.[1];
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
