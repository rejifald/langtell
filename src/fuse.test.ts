import { describe, expect, it } from "vitest";
import { fuse } from "./fuse.js";
import type { LanguageEvidence, LanguageProfile } from "./types.js";

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

describe("fuse — nonDiscriminatingScript (the inverse of the script guard)", () => {
  /** A lone-Latin-candidate read: the script chose `en` only because it was the
   *  one Latin option, so it carries `discriminating: false`. */
  const loneLatin: LanguageEvidence = {
    kind: "title-script",
    language: "en",
    confidence: 0.95,
    source: "title-script",
    value: "Inception",
    discriminating: false,
  };

  it("default keeps the lone candidate (behavior unchanged)", () => {
    expect(fuse([loneLatin]).language).toBe("en");
    expect(fuse([loneLatin], { nonDiscriminatingScript: "candidate" }).language).toBe("en");
  });

  it("'unknown' resolves an uncorroborated non-discriminating read to unknown", () => {
    const result = fuse([loneLatin], { nonDiscriminatingScript: "unknown" });
    expect(result.language).toBe("unknown");
    // The read is dropped from scoring but stays in the audit trail.
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({ kind: "title-script", discriminating: false });
  });

  it("'unknown' keeps the language when non-script evidence corroborates it", () => {
    const evidence: LanguageEvidence[] = [
      loneLatin,
      {
        kind: "http-content-language",
        language: "en",
        confidence: 0.8,
        source: "http-content-language",
        value: "en",
      },
    ];
    expect(fuse(evidence, { nonDiscriminatingScript: "unknown" }).language).toBe("en");
  });

  it("'unknown' does NOT let another lone-candidate script read corroborate", () => {
    // Two script reads agreeing is still two lone-candidate defaults, not real
    // evidence — so franc (also non-discriminating) must not rescue the verdict.
    const evidence: LanguageEvidence[] = [
      loneLatin,
      {
        kind: "franc",
        language: "en",
        confidence: 0.6,
        source: "franc",
        value: "en",
        discriminating: false,
      },
    ];
    expect(fuse(evidence, { nonDiscriminatingScript: "unknown" }).language).toBe("unknown");
  });

  it("'unknown' leaves a discriminating script read (≥2 candidates) untouched", () => {
    const discriminating: LanguageEvidence[] = [
      {
        kind: "title-script",
        language: "uk",
        confidence: 0.9,
        source: "title-script",
        value: "Слава",
      },
    ];
    expect(fuse(discriminating, { nonDiscriminatingScript: "unknown" }).language).toBe("uk");
  });
});

describe("fuse — nonDiscriminatingScript: context in a different script may not name the title", () => {
  // Minimal `{ code, alphabet }` rosters are enough to derive each candidate's
  // script (the cross-script cut only needs the alphabet).
  const uk: LanguageProfile = { code: "uk", alphabet: "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя" };
  const en: LanguageProfile = { code: "en", alphabet: "abcdefghijklmnopqrstuvwxyz" };
  const de: LanguageProfile = { code: "de", alphabet: "abcdefghijklmnopqrstuvwxyzäöüß" };

  /** A lone-Latin-candidate title read against `[uk, en]` — Latin owned by `en`
   *  alone, so non-discriminating. */
  const latinTitle: LanguageEvidence = {
    kind: "title-script",
    language: "en",
    confidence: 0.95,
    source: "title-script",
    value: "Inception",
    discriminating: false,
  };

  // High confidence so a *surviving* context clears the winning-score floor; the
  // point of these tests is the script cut, not the score arithmetic.
  function pageContext(kind: LanguageEvidence["kind"], language: string): LanguageEvidence {
    return { kind, language, confidence: 0.95, source: kind, value: language };
  }

  it("drops uk page context (Cyrillic) for a Latin title → unknown", () => {
    for (const kind of [
      "html-lang",
      "meta-og-locale",
      "http-content-language",
    ] as const satisfies LanguageEvidence["kind"][]) {
      const evidence = [latinTitle, pageContext(kind, "uk")];
      expect(
        fuse(evidence, { nonDiscriminatingScript: "unknown", candidates: [uk, en] }).language,
      ).toBe("unknown");
    }
  });

  it("keeps same-script en context for a Latin title → en", () => {
    const evidence = [latinTitle, pageContext("http-content-language", "en")];
    expect(
      fuse(evidence, { nonDiscriminatingScript: "unknown", candidates: [uk, en] }).language,
    ).toBe("en");
  });

  it("among same-script candidates, de context still disambiguates a Latin title → de", () => {
    // Latin owned by both en & de — but a Latin read that named `en` only because
    // it was the *first* lone-ish pick (discriminating:false) must not block the
    // de page from naming the title, since de is the same (Latin) script.
    const evidence = [latinTitle, pageContext("html-lang", "de")];
    expect(
      fuse(evidence, { nonDiscriminatingScript: "unknown", candidates: [en, de] }).language,
    ).toBe("de");
  });

  it("a Cyrillic uk/ru disambiguation is unaffected by the cross-script cut", () => {
    const ru: LanguageProfile = { code: "ru", alphabet: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя" };
    const cyrillicTitle: LanguageEvidence = {
      kind: "title-script",
      language: "uk",
      confidence: 0.9,
      source: "title-script",
      value: "Слава Україні",
      // ≥2 same-script candidates ⇒ discriminating ⇒ never neutralized.
    };
    expect(
      fuse([cyrillicTitle], { nonDiscriminatingScript: "unknown", candidates: [uk, ru] }).language,
    ).toBe("uk");
  });

  it("without candidates, falls back to 0.3.0 behavior (cross-script context still wins)", () => {
    const evidence = [latinTitle, pageContext("http-content-language", "uk")];
    // No roster ⇒ scripts can't be derived ⇒ no cut ⇒ uk context wins as before.
    expect(fuse(evidence, { nonDiscriminatingScript: "unknown" }).language).toBe("uk");
  });
});
