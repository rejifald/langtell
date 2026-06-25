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
  if (isHeaders(headers)) {
    return headers.get(name) ?? undefined;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    if (Array.isArray(value)) return value.join(",");
    return value ?? undefined;
  }
  return undefined;
}

function isHeaders(headers: HeaderBag): headers is Headers {
  return typeof Headers !== "undefined" && headers instanceof Headers;
}
