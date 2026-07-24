import { describe, expect, it } from "vitest";
import { fuse, type FuseOptions } from "./fuse.js";
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

describe("fuse — a silenced signal cannot pin either (weights: 0)", () => {
  const uk: LanguageProfile = { code: "uk", alphabet: "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя" };
  const ru: LanguageProfile = { code: "ru", alphabet: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя" };

  /** The issue-28 repro: a confident `uk` script read (the score the classifier
   *  gives "Кофе і чай" against a `[uk, ru]` roster) against an `ru` page tag.
   *  Left alone the script read pins and wins; silenced, only the tag is left. */
  function scriptVsRuPage(
    kind: "title-script" | "franc" | "chrome-ai",
    source: string = kind,
  ): LanguageEvidence[] {
    return [
      { kind, language: "uk", confidence: 0.6875, source, value: "Кофе і чай" },
      { kind: "html-lang", language: "ru", confidence: 0.9, source: "html-lang", value: "ru" },
    ];
  }

  it("at its default weight, each script kind pins and wins (behavior unchanged)", () => {
    for (const kind of ["title-script", "franc", "chrome-ai"] as const) {
      expect(fuse(scriptVsRuPage(kind), { candidates: [uk, ru] }).language).toBe("uk");
    }
  });

  it("weights { 'title-script': 0 } hands the verdict to the page tag", () => {
    const result = fuse(scriptVsRuPage("title-script"), {
      candidates: [uk, ru],
      weights: { "title-script": 0 },
    });
    expect(result.language).toBe("ru");
    expect(result.confidence).toBeGreaterThan(0);
    // Silenced for the verdict, still present in the audit trail.
    expect(result.evidence).toHaveLength(2);
  });

  it("weights { franc: 0 } hands the verdict to the page tag", () => {
    const result = fuse(scriptVsRuPage("franc"), {
      candidates: [uk, ru],
      weights: { franc: 0 },
    });
    expect(result.language).toBe("ru");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("weights { 'chrome-ai': 0 } hands the verdict to the page tag", () => {
    const result = fuse(scriptVsRuPage("chrome-ai"), {
      candidates: [uk, ru],
      weights: { "chrome-ai": 0 },
    });
    expect(result.language).toBe("ru");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("silencing by namespaced source id disqualifies the pin too", () => {
    const evidence = scriptVsRuPage("chrome-ai", "chrome-ai:v2");
    expect(fuse(evidence, { candidates: [uk, ru] }).language).toBe("uk");
    expect(fuse(evidence, { candidates: [uk, ru], weights: { "chrome-ai:v2": 0 } }).language).toBe(
      "ru",
    );
  });

  it("a negative weight is not evidence either — it cannot pin", () => {
    const result = fuse(scriptVsRuPage("title-script"), {
      candidates: [uk, ru],
      weights: { "title-script": -1 },
    });
    expect(result.language).toBe("ru");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("silencing one script read leaves the others free to pin", () => {
    const evidence: LanguageEvidence[] = [
      {
        kind: "title-script",
        language: "en",
        confidence: 0.9,
        source: "title-script",
        value: "Hi",
      },
      { kind: "franc", language: "uk", confidence: 0.9, source: "franc", value: "uk" },
      { kind: "html-lang", language: "ru", confidence: 0.9, source: "html-lang", value: "ru" },
    ];
    expect(fuse(evidence, { weights: { "title-script": 0 } }).language).toBe("uk");
  });

  it("silencing a context kind keeps working as it always has", () => {
    const evidence: LanguageEvidence[] = [
      {
        kind: "explicit-locale",
        language: "en",
        confidence: 0.9,
        source: "explicit-locale",
        value: "en",
      },
      { kind: "html-lang", language: "uk", confidence: 0.9, source: "html-lang", value: "uk" },
    ];
    expect(fuse(evidence).language).toBe("en");
    expect(fuse(evidence, { weights: { "explicit-locale": 0 } }).language).toBe("uk");
  });
});

describe("fuse — a verdict never names a language at confidence 0", () => {
  const uk: LanguageProfile = { code: "uk", alphabet: "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя" };
  const ru: LanguageProfile = { code: "ru", alphabet: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя" };
  const en: LanguageProfile = { code: "en", alphabet: "abcdefghijklmnopqrstuvwxyz" };

  it("a pinned read whose tally is cancelled out resolves to unknown, not to itself", () => {
    const evidence: LanguageEvidence[] = [
      { kind: "title-script", language: "uk", confidence: 0.9, source: "title-script", value: "…" },
      { kind: "franc", language: "uk", confidence: 0.9, source: "franc", value: "uk" },
    ];
    // franc's negative weight cancels the pinned read's score. Naming `uk` off a
    // non-positive tally reports a language the confidence itself denies — and a
    // negative tally would even invert the ratio into a false 1.
    const result = fuse(evidence, { weights: { franc: -1.5 } });
    expect(result.language).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("holds across weighted, silenced, and negated evidence sets", () => {
    const script = (
      kind: "title-script" | "franc" | "chrome-ai",
      language: string,
      confidence: number,
    ): LanguageEvidence => ({ kind, language, confidence, source: kind, value: language });

    const context = (
      kind: "html-lang" | "explicit-locale" | "http-content-language",
      language: string,
      confidence: number,
    ): LanguageEvidence => ({ kind, language, confidence, source: kind, value: language });

    const loneLatin: LanguageEvidence = {
      kind: "title-script",
      language: "en",
      confidence: 0.95,
      source: "title-script",
      value: "Inception",
      discriminating: false,
    };

    const evidenceSets: readonly LanguageEvidence[][] = [
      [],
      [script("title-script", "uk", 0.6875), context("html-lang", "ru", 0.9)],
      [script("franc", "uk", 0.6875), context("html-lang", "ru", 0.9)],
      [script("chrome-ai", "uk", 0.6875), context("html-lang", "ru", 0.9)],
      [script("title-script", "uk", 0.9), script("franc", "uk", 0.9)],
      [script("title-script", "ru", 0.7), context("html-lang", "uk", 0.9)],
      [loneLatin, context("html-lang", "uk", 0.95)],
      [context("explicit-locale", "en", 0.9), context("http-content-language", "uk", 0.9)],
    ];

    const optionSets: readonly FuseOptions[] = [
      {},
      { candidates: [uk, ru, en] },
      { weights: { "title-script": 0 } },
      { weights: { franc: 0 } },
      { weights: { "chrome-ai": 0 } },
      { weights: { "title-script": 0, franc: 0, "chrome-ai": 0, "html-lang": 0 } },
      { weights: { "title-script": -1, franc: -1.5, "explicit-locale": -0.5 } },
      { nonDiscriminatingScript: "unknown", candidates: [uk, en] },
      {
        nonDiscriminatingScript: "unknown",
        candidates: [uk, en],
        weights: { "title-script": 0, "chrome-ai": 0 },
      },
    ];

    let named = 0;
    for (const evidence of evidenceSets) {
      for (const options of optionSets) {
        const result = fuse(evidence, options);
        if (result.language === "unknown") continue;
        named += 1;
        expect(result.confidence, JSON.stringify({ evidence, options })).toBeGreaterThan(0);
      }
    }
    // The sweep must actually reach named verdicts — it must not pass vacuously.
    expect(named).toBeGreaterThan(0);
  });
});
