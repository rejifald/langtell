import { describe, expect, it } from "vitest";
import { fuse } from "./fuse.js";
import type { LanguageEvidence } from "./types.js";

describe("fuse", () => {
  it("returns unknown for empty evidence", () => {
    expect(fuse([]).language).toBe("unknown");
  });

  it("ignores unknown-language evidence", () => {
    const evidence: LanguageEvidence[] = [
      {
        kind: "title-script",
        language: "unknown",
        confidence: 0.3,
        source: "title-script",
        value: "latin",
      },
    ];
    expect(fuse(evidence).language).toBe("unknown");
  });

  it("picks the strongest-weighted language and keeps the trail", () => {
    const evidence: LanguageEvidence[] = [
      {
        kind: "title-script",
        language: "uk",
        confidence: 0.95,
        source: "title-script",
        value: "uk",
      },
      {
        kind: "http-content-language",
        language: "en",
        confidence: 0.8,
        source: "http-content-language",
        value: "en-US",
      },
    ];
    const result = fuse(evidence);
    expect(result.language).toBe("uk");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.evidence).toHaveLength(2);
  });

  it("honors caller weight overrides keyed by source", () => {
    const evidence: LanguageEvidence[] = [
      {
        kind: "title-script",
        language: "uk",
        confidence: 0.5,
        source: "title-script",
        value: "uk",
      },
      {
        kind: "http-content-language",
        language: "en",
        confidence: 0.5,
        source: "http-content-language",
        value: "en",
      },
    ];
    const result = fuse(evidence, { weights: { "http-content-language": 5 } });
    expect(result.language).toBe("en");
  });
});

describe("fuse — BCP-47 normalization into the roster", () => {
  it("collapses regioned/aliased tags so signals agree on one code", () => {
    const evidence: LanguageEvidence[] = [
      {
        kind: "html-lang",
        language: "uk-UA",
        confidence: 0.7,
        source: "html-lang",
        value: "uk-UA",
      },
      {
        kind: "http-content-language",
        language: "ua",
        confidence: 0.7,
        source: "http-content-language",
        value: "ua",
      },
    ];
    const result = fuse(evidence);
    expect(result.language).toBe("uk");
    // Both items contributed to the same code, so it wins comfortably.
    expect(result.confidence).toBeGreaterThan(0.4);
  });
});

describe("fuse — context must never override clear script evidence", () => {
  it("a Ukrainian page chrome does not flip a confident English title", () => {
    const evidence: LanguageEvidence[] = [
      // The text classifier confidently read English from the title itself.
      {
        kind: "title-script",
        language: "en",
        confidence: 0.9,
        source: "title-script",
        value: "Hello",
      },
      // The surrounding page declares Ukrainian (nav/footer locale).
      { kind: "html-lang", language: "uk", confidence: 0.7, source: "html-lang", value: "uk" },
      {
        kind: "http-content-language",
        language: "uk",
        confidence: 0.8,
        source: "http-content-language",
        value: "uk",
      },
    ];
    expect(fuse(evidence).language).toBe("en");
  });

  it("a confident script read still wins even on a thin combined margin", () => {
    const evidence: LanguageEvidence[] = [
      { kind: "title-script", language: "ru", confidence: 0.7, source: "title-script", value: "…" },
      { kind: "html-lang", language: "uk", confidence: 0.9, source: "html-lang", value: "uk" },
      {
        kind: "meta-og-locale",
        language: "uk",
        confidence: 0.9,
        source: "meta-og-locale",
        value: "uk",
      },
    ];
    expect(fuse(evidence).language).toBe("ru");
  });

  it("context still wins when there is no confident script read", () => {
    const evidence: LanguageEvidence[] = [
      // A weak/low-confidence script hint must not pin the verdict.
      { kind: "title-script", language: "ru", confidence: 0.3, source: "title-script", value: "?" },
      {
        kind: "http-content-language",
        language: "uk",
        confidence: 0.9,
        source: "http-content-language",
        value: "uk",
      },
    ];
    expect(fuse(evidence).language).toBe("uk");
  });
});
