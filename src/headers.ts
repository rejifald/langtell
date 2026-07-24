import type { HeaderBag, LanguageEvidence } from "./types.js";
import { primarySubtag } from "./internal/bcp47.js";

/** Producer: the HTTP `Content-Language` response header. */
export function evidenceFromHeaders(headers: HeaderBag | undefined): LanguageEvidence[] {
  if (headers === undefined) return [];

  const value = getHeader(headers, "content-language");
  const lang = primarySubtag(value);
  if (lang === null) return [];

  return [
    {
      kind: "http-content-language",
      language: lang,
      confidence: 0.8,
      source: "http-content-language",
      value: value ?? "",
    },
  ];
}

function getHeader(headers: HeaderBag, name: string): string | undefined {
  if (isHeadersLike(headers)) {
    return headers.get(name) ?? undefined;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    if (Array.isArray(value)) return value.join(",");
    return value ?? undefined;
  }
  return undefined;
}

/** Duck-types on the only capability actually used (`.get`) instead of
 *  `instanceof Headers`, which is realm- and implementation-bound: a
 *  `node-fetch`/`cross-fetch`/jsdom/worker-realm `Headers`, or a test double,
 *  is not `instanceof` the global `Headers` class and would otherwise fall
 *  through to `Object.entries` — which silently returns `[]` for a real
 *  `Headers` instance, since it stores values internally rather than as own
 *  enumerable properties. */
function isHeadersLike(headers: HeaderBag): headers is Headers {
  return typeof (headers as Headers).get === "function";
}
