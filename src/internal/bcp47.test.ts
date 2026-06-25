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
