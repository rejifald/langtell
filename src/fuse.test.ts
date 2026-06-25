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
