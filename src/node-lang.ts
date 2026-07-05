import type { LanguageEvidence } from "./types.js";
import { normalizeBCP47 } from "./internal/bcp47.js";

/** Confidence for a node-level declaration: above the page-scope tags (a label
 *  on the node itself sits closer to the content than `<html lang>` does), but
 *  still context evidence — {@link fuse}'s guard keeps it from flipping clear
 *  script evidence. */
const NODE_LANG_CONFIDENCE = 0.7;

/**
 * Producer: a per-node declared language — the page's own label for one
 * content node, read from an attribute. The one STANDARDIZED bearer is the
 * global `lang` attribute (BCP-47, inheritable); everything else is a vendor
 * convention the caller opts into — e.g. Google's `data-rl` response-language
 * label on AI-generated answers. No attribute name is built in here: which
 * attributes count as declarations is entirely the caller's choice.
 *
 * The document-scope siblings of this signal live in {@link evidenceFromHtml}
 * (`<html lang>`, `content-language`, `og:locale`); this is the same
 * declaration concept one scope down. Like them it is *context* evidence: the
 * fuser weighs it against text reads, and its script guard keeps a
 * declaration from overriding a confident text read — a mislabeled node loses
 * to clear script evidence, while weak or absent text lets the declaration
 * decide.
 *
 * DOM-free by design — this module never touches an Element. The caller
 * passes the attribute values it extracted, keyed by attribute name
 * (`{ lang: el.getAttribute("lang") }`, `{ "data-rl": … }`). Each recognized
 * value becomes one evidence item whose `source` is the attribute name,
 * letting {@link FuseOptions.weights} key on a specific attribute — trust a
 * curated vendor label above an often-stale inherited `lang`, or silence one
 * attribute entirely — instead of the whole kind. Empty and unrecognized
 * values are dropped.
 */
export function evidenceFromNodeLang(
  attrs: Readonly<Record<string, string | null | undefined>>,
): LanguageEvidence[] {
  const out: LanguageEvidence[] = [];
  for (const [attribute, raw] of Object.entries(attrs)) {
    if (raw == null || raw === "") continue;
    const language = normalizeBCP47(raw);
    if (language === null) continue;
    out.push({
      kind: "node-lang",
      language,
      confidence: NODE_LANG_CONFIDENCE,
      source: attribute,
      value: raw,
    });
  }
  return out;
}
