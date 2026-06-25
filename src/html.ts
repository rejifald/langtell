import type { LanguageEvidence } from "./types.js";
import { primarySubtag } from "./internal/bcp47.js";

/**
 * Producer: language clues from an HTML string's metadata.
 *
 * Scaffold — reads `<html lang>`. Meta `content-language` and `og:locale`
 * extraction are ported next; see DESIGN.md.
 */
export function evidenceFromHtml(html: string | undefined): LanguageEvidence[] {
  if (html === undefined || html.trim().length === 0) return [];

  const out: LanguageEvidence[] = [];
  const htmlLang = /<html\b[^>]*\blang=["']?([^"'\s>]+)/i.exec(html)?.[1];
  const lang = primarySubtag(htmlLang);
  if (lang !== null) {
    out.push({
      kind: "html-lang",
      language: lang,
      confidence: 0.7,
      source: "html-lang",
      value: htmlLang ?? "",
    });
  }
  return out;
}
