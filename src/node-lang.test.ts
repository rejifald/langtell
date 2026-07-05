import { describe, expect, it } from "vitest";
import { evidenceFromNodeLang } from "./node-lang.js";
import { fuse } from "./fuse.js";
import type { LanguageEvidence } from "./types.js";

describe("evidenceFromNodeLang", () => {
  it("reads a declared attribute and normalizes the tag", () => {
    const ev = evidenceFromNodeLang({ "data-rl": "uk-UA" });
    expect(ev).toEqual([
      {
        kind: "node-lang",
        language: "uk",
        confidence: expect.any(Number) as number,
        source: "data-rl",
        value: "uk-UA",
      },
    ]);
  });

  it("emits one item per recognized attribute, source = attribute name", () => {
    const ev = evidenceFromNodeLang({ "data-rl": "ru", lang: "uk" });
    expect(ev.map((e) => [e.source, e.language])).toEqual([
      ["data-rl", "ru"],
      ["lang", "uk"],
    ]);
  });

  it("drops empty and missing values", () => {
    expect(evidenceFromNodeLang({})).toEqual([]);
    expect(evidenceFromNodeLang({ "data-rl": "" })).toEqual([]);
    expect(evidenceFromNodeLang({ "data-rl": null })).toEqual([]);
    expect(evidenceFromNodeLang({ "data-rl": undefined })).toEqual([]);
  });

  it("passes an off-roster subtag through (permissive, like evidenceFromHtml) — the fuser's roster scoping decides its fate", () => {
    const ev = evidenceFromNodeLang({ "data-rl": "zz-XX" });
    expect(ev[0]).toMatchObject({ kind: "node-lang", language: "zz" });
  });
});

// The contract that makes a node declaration EVIDENCE, not a verdict: it
// decides when text evidence is weak or absent, and loses to a confident text
// read (the fuser's context-never-overrides-clear-script guard).
describe("evidenceFromNodeLang + fuse", () => {
  const titleScript = (language: string, confidence: number): LanguageEvidence => ({
    kind: "title-script",
    language,
    confidence,
    source: "title-script",
    value: "…",
  });

  it("a declaration alone decides (no text evidence yet)", () => {
    const verdict = fuse(evidenceFromNodeLang({ "data-rl": "ru" }));
    expect(verdict.language).toBe("ru");
  });

  it("a declaration outweighs a weak text read", () => {
    // franc-tier read below the script-confidence floor: context may win.
    const weakText: LanguageEvidence = {
      kind: "franc",
      language: "uk",
      confidence: 0.45,
      source: "franc",
      value: "…",
    };
    const verdict = fuse([weakText, ...evidenceFromNodeLang({ "data-rl": "ru" })]);
    expect(verdict.language).toBe("ru");
  });

  it("a confident text read defeats a mislabeling declaration", () => {
    const verdict = fuse([titleScript("uk", 0.95), ...evidenceFromNodeLang({ "data-rl": "ru" })]);
    expect(verdict.language).toBe("uk");
  });

  it("an agreeing declaration keeps the text verdict and both trail entries", () => {
    const verdict = fuse([titleScript("ru", 0.95), ...evidenceFromNodeLang({ "data-rl": "ru" })]);
    expect(verdict.language).toBe("ru");
    expect(verdict.evidence).toHaveLength(2);
  });

  it("weights can silence a specific attribute by its source id", () => {
    const verdict = fuse(evidenceFromNodeLang({ "data-rl": "ru" }), {
      weights: { "data-rl": 0 },
    });
    expect(verdict.language).toBe("unknown");
  });
});
