import { describe, expect, it } from "vitest";
import { normalizeBCP47, normalizeLanguageCode, primarySubtag } from "./bcp47.js";

describe("normalizeBCP47", () => {
  it("strips region/script suffixes to the primary subtag", () => {
    expect(normalizeBCP47("en-US")).toBe("en");
    expect(normalizeBCP47("uk-UA")).toBe("uk");
    expect(normalizeBCP47("zh_CN")).toBe("zh");
    expect(normalizeBCP47("pt-BR")).toBe("pt");
  });

  it("resolves common aliases (ua → uk, rus → ru)", () => {
    expect(normalizeBCP47("ua")).toBe("uk");
    expect(normalizeBCP47("rus")).toBe("ru");
    expect(normalizeBCP47("UA")).toBe("uk");
  });

  it("returns null for empty/nullish input", () => {
    expect(normalizeBCP47("")).toBeNull();
    expect(normalizeBCP47(undefined)).toBeNull();
    expect(normalizeBCP47(null)).toBeNull();
  });
});

describe("normalizeLanguageCode (strict, exact-match)", () => {
  it("resolves exact aliases including localized phrases", () => {
    expect(normalizeLanguageCode("українською")).toBe("uk");
    expect(normalizeLanguageCode("по-русски")).toBe("ru");
    expect(normalizeLanguageCode("in english")).toBe("en");
  });

  it("does NOT split on a hyphen (a slug is not a locale)", () => {
    expect(normalizeLanguageCode("ru-return-warranty")).toBeNull();
    expect(normalizeLanguageCode("en-US")).toBeNull();
  });

  it("returns null for unknown input", () => {
    expect(normalizeLanguageCode("zz")).toBeNull();
    expect(normalizeLanguageCode("")).toBeNull();
  });
});

describe("primarySubtag (header/HTML extraction)", () => {
  it("handles Accept-Language-style comma lists and q-weights", () => {
    expect(primarySubtag("en-US,en;q=0.9")).toBe("en");
    expect(primarySubtag("uk-UA, ru;q=0.8")).toBe("uk");
  });

  it("resolves aliases (ua → uk)", () => {
    expect(primarySubtag("ua")).toBe("uk");
  });

  it("returns null for empty/nullish", () => {
    expect(primarySubtag("")).toBeNull();
    expect(primarySubtag(undefined)).toBeNull();
    expect(primarySubtag(null)).toBeNull();
  });
});

describe("normalizeBCP47 — unknownHead option", () => {
  it("defaults to passing the raw primary subtag through (back-compat)", () => {
    expect(normalizeBCP47("pt-BR")).toBe("pt");
    expect(normalizeBCP47("sv")).toBe("sv");
    expect(normalizeBCP47("zh-CN")).toBe("zh");
    // Explicit "subtag" is identical to the default.
    expect(normalizeBCP47("pt-BR", { unknownHead: "subtag" })).toBe("pt");
  });

  it('returns null for an unknown head when unknownHead is "null"', () => {
    expect(normalizeBCP47("pt-BR", { unknownHead: "null" })).toBeNull();
    expect(normalizeBCP47("sv", { unknownHead: "null" })).toBeNull();
    expect(normalizeBCP47("zh-CN", { unknownHead: "null" })).toBeNull();
    expect(normalizeBCP47("xx", { unknownHead: "null" })).toBeNull();
  });

  it("still resolves known aliases and subtags regardless of the option", () => {
    expect(normalizeBCP47("ua", { unknownHead: "null" })).toBe("uk");
    expect(normalizeBCP47("en-US", { unknownHead: "null" })).toBe("en");
    expect(normalizeBCP47("rus", { unknownHead: "null" })).toBe("ru");
  });

  it("returns null for empty/nullish even with the option", () => {
    expect(normalizeBCP47("", { unknownHead: "null" })).toBeNull();
    expect(normalizeBCP47(undefined, { unknownHead: "null" })).toBeNull();
  });
});

describe("BCP-47 alias parity — Ukrainian exonyms for pl/de/fr/es/it", () => {
  const cases: ReadonlyArray<[string, string]> = [
    ["польська мова", "pl"],
    ["по-польськи", "pl"],
    ["німецька мова", "de"],
    ["по-німецьки", "de"],
    ["французька мова", "fr"],
    ["по-французьки", "fr"],
    ["іспанська мова", "es"],
    ["по-іспанськи", "es"],
    ["італійська мова", "it"],
    ["по-італійськи", "it"],
  ];

  it.each(cases)("normalizeLanguageCode(%j) → %j (exact-match)", (input, code) => {
    expect(normalizeLanguageCode(input)).toBe(code);
  });

  it.each(cases)("normalizeBCP47(%j) → %j", (input, code) => {
    expect(normalizeBCP47(input)).toBe(code);
  });
});
