import { describe, expect, it } from "vitest";
import {
  classifyBySnippet,
  distinctiveChars,
  RUNG3_MIN_LENGTH,
  scopeCandidates,
  stripNoise,
} from "./classify.js";
import type { RungVerdict } from "./classify.js";
import { be, bg, en, kk, mk, ru, sr, uk } from "../profiles.js";

/** True if any code point of `word` is in `distinctive`. */
function hasDistinctiveChar(word: string, distinctive: ReadonlySet<string>): boolean {
  for (const ch of word) if (distinctive.has(ch)) return true;
  return false;
}

describe("classifyBySnippet — reports the deciding rung and margin", () => {
  it("rung 1 for a distinctive letter", () => {
    const v = classifyBySnippet("Слава Україні", [uk, ru]);
    expect(v).toMatchObject({ language: "uk", rung: 1 });
    expect(v.margin).toBeGreaterThanOrEqual(1);
  });

  it("rung 2a for a distinctive function word built from shared letters", () => {
    expect(classifyBySnippet("Кофе и чай", [uk, ru])).toMatchObject({ language: "ru", rung: "2a" });
  });

  it("rung 2b for a distinctive-free frequent word", () => {
    expect(classifyBySnippet("работа", [uk, ru])).toMatchObject({ language: "ru", rung: "2b" });
  });

  it("the ladder breaks a rung-1 tie at a later rung (`і ы`)", () => {
    // і ties ы at rung 1, but і is also a uk function word → rung 2a decides.
    expect(classifyBySnippet("і ы", [uk, ru])).toMatchObject({ language: "uk", rung: "2a" });
  });

  it("unknown carries margin 0 and null rung", () => {
    expect(classifyBySnippet("", [uk, ru])).toEqual({
      language: "unknown",
      margin: 0,
      rung: null,
      discriminating: false,
    });
  });
});

describe("classifyBySnippet — discriminating flag (≥2 same-script candidates)", () => {
  it("a ≥2-candidate verdict is discriminating", () => {
    expect(classifyBySnippet("Слава Україні", [uk, ru])).toMatchObject({
      language: "uk",
      discriminating: true,
    });
  });

  it("a lone-candidate-in-script verdict is non-discriminating (Latin)", () => {
    expect(classifyBySnippet("Inception", [uk, en])).toMatchObject({
      language: "en",
      discriminating: false,
    });
  });

  it("the lone-candidate rule is symmetric across scripts (Cyrillic)", () => {
    expect(classifyBySnippet("Інкі", [uk, en])).toMatchObject({
      language: "uk",
      discriminating: false,
    });
  });
});

describe("classifyBySnippet — dedupes repeated candidate codes", () => {
  it("a repeated candidate's distinctive letter still wins", () => {
    expect(classifyBySnippet("і", [uk, uk, ru])).toMatchObject({ language: "uk", rung: 1 });
    expect(classifyBySnippet("і", [ru, uk, uk]).language).toBe("uk");
  });
});

describe("classifyBySnippet — degrades safely on DOM noise", () => {
  it("decides despite surrounding whitespace/newlines", () => {
    expect(classifyBySnippet("\n   работа\n  ", [uk, ru]).language).toBe("ru");
  });

  it("abstains (never a wrong call) when invisible chars split a word", () => {
    expect(classifyBySnippet("работа", [uk, ru]).language).toBe("ru"); // clean baseline
    expect(classifyBySnippet("раб​ота", [uk, ru]).language).toBe("unknown"); // zero-width
    expect(classifyBySnippet("раб­ота", [uk, ru]).language).toBe("unknown"); // soft hyphen
  });
});

describe("scopeCandidates", () => {
  it("restricts to candidates matching the text's dominant script", () => {
    expect(scopeCandidates("Слава Україні", [uk, en, ru]).map((p) => p.code)).toEqual(["uk", "ru"]);
    expect(scopeCandidates("Apple Music", [uk, en, ru]).map((p) => p.code)).toEqual(["en"]);
  });

  it("returns empty for letterless text", () => {
    expect(scopeCandidates("12345 !!!", [uk, ru])).toEqual([]);
  });
});

describe("stripNoise — URLs / @handles / #hashtags", () => {
  it("removes full URLs, bare domains, www, handles, and hashtags", () => {
    expect(stripNoise("текст https://example.com/a/b").trim()).toBe("текст");
    expect(stripNoise("текст www.example.com/x").trim()).toBe("текст");
    expect(stripNoise("текст example.com/path").trim()).toBe("текст");
    expect(stripNoise("текст @handle").trim()).toBe("текст");
    expect(stripNoise("текст #hashtag #other").trim()).toBe("текст");
  });

  it("leaves Cyrillic prose (and intra-word apostrophes) untouched", () => {
    expect(stripNoise("комп'ютер і сім'я")).toBe("комп'ютер і сім'я");
  });
});

describe("stripNoise — prose is not a domain (TLD-constrained, case-sensitive)", () => {
  // The bare-domain pattern used to be `[a-z0-9-]+(\.[a-z0-9-]+)+` with an `i`
  // flag: any two alphanumeric runs joined by a dot. A missing space after a
  // sentence-final period — everywhere in scraped titles — therefore deleted
  // both words before the script vote and every rung tally.
  it("keeps a missing-space sentence join", () => {
    expect(stripNoise("The end.The next one")).toBe("The end.The next one");
    expect(stripNoise("Zrobie to.Naprawde tak")).toBe("Zrobie to.Naprawde tak");
  });

  it("keeps abbreviations and decimals", () => {
    expect(stripNoise("e.g. this and that")).toBe("e.g. this and that");
    expect(stripNoise("Version 1.2 released")).toBe("Version 1.2 released");
  });

  it("still strips real hosts, schemes, www, handles and hashtags", () => {
    expect(stripNoise("see example.com/path now")).toBe("see   now");
    expect(stripNoise("https://x.com/y ok")).toBe("  ok");
    expect(stripNoise("www.foo.bar ok")).toBe("  ok");
    expect(stripNoise("@handle #tag hi")).toBe("    hi");
  });

  it("documents the two accepted residuals", () => {
    // An all-lowercase sentence join is indistinguishable from a host.
    expect(stripNoise("the end.the next one")).toBe("the   next one");
    // Mixed-case hosts survive — the price of dropping the `i` flag.
    expect(stripNoise("Example.COM ok")).toBe("Example.COM ok");
  });
});

describe("classifyBySnippet — marks count only between two letters", () => {
  // `LanguageProfile.marks` is the INTRA-WORD apostrophe. U+0027/U+2019 are
  // overwhelmingly punctuation elsewhere, and rung 1 runs before the word rungs,
  // so a whole-text tally let a pair of quotes in Russian prose short-circuit
  // the ladder and pin `uk`.
  it("quoted Russian prose is never uk", () => {
    expect(classifyBySnippet("Фильм 'Брат' вышел", [uk, ru])).toMatchObject({ language: "ru" });
    expect(classifyBySnippet("Он сказал ’привет’", [uk, ru])).toMatchObject({ language: "ru" });
    expect(classifyBySnippet("«Что» и 'это'", [uk, ru])).toMatchObject({ language: "ru" });
  });

  it("the quoteless control is unchanged", () => {
    expect(classifyBySnippet("Фильм Брат вышел", [uk, ru])).toMatchObject({
      language: "ru",
      rung: 1,
    });
  });

  it("the word rungs are reached instead of being short-circuited", () => {
    // что / и / это are all ru function words and none is uk's, so rung 2a —
    // which rung 1 used to pre-empt — decides with a margin of 3.
    expect(classifyBySnippet("«Что» и 'это'", [uk, ru, be, bg, en])).toMatchObject({
      language: "ru",
      rung: "2a",
      margin: 3,
    });
  });

  it("an apostrophe with no letter on both sides is inert", () => {
    expect(classifyBySnippet("Тест '90'", [uk, ru]).language).toBe("unknown");
  });

  it("keeps the intra-word signal for all three codepoints", () => {
    for (const ch of ["'", "’", "ʼ"]) {
      expect(classifyBySnippet(`комп${ch}ютер`, [uk, ru])).toMatchObject({
        language: "uk",
        rung: 1,
      });
    }
  });

  it("stays candidate-relative — a mark two candidates carry cancels", () => {
    expect(classifyBySnippet("комп'ютер", [uk, be]).language).toBe("unknown");
  });

  it("a Latin contraction stays en", () => {
    expect(classifyBySnippet("don't worry, it's fine", [uk, ru, en]).language).toBe("en");
  });
});

describe("classifyBySnippet — rung 3 respects RUNG3_MIN_LENGTH", () => {
  const stub = (seen: string[]): ((text: string) => RungVerdict) => {
    return (text: string) => {
      seen.push(text);
      return { language: "ru", margin: 0.5, rung: 3 };
    };
  };

  it("does not invoke the resolver below the floor", () => {
    const seen: string[] = [];
    const v = classifyBySnippet("аб вг", [uk, ru], stub(seen));
    expect(seen).toEqual([]);
    expect(v).toMatchObject({ language: "unknown", rung: null });
  });

  it("invokes the resolver at/above the floor", () => {
    const seen: string[] = [];
    const text = "аб вг".padEnd(RUNG3_MIN_LENGTH, " ");
    expect(text.length).toBe(RUNG3_MIN_LENGTH);
    expect(classifyBySnippet(text, [uk, ru], stub(seen))).toMatchObject({
      language: "ru",
      rung: 3,
    });
    expect(seen).toHaveLength(1);
  });

  it("measures the floor on the noise-stripped text, not the raw input", () => {
    const seen: string[] = [];
    const raw = "аб вг https://example.com/a/very/long/path";
    expect(raw.length).toBeGreaterThan(RUNG3_MIN_LENGTH);
    expect(classifyBySnippet(raw, [uk, ru], stub(seen)).language).toBe("unknown");
    expect(seen).toEqual([]);
  });
});

describe("distinctiveChars — frequent lists carry no globally-unique characters", () => {
  // A word containing a char unique to its own language is dead weight — rung 1
  // catches it first. This pins the invariant for the shipped profiles, the full
  // roster included (mk's ќ/ѓ/ѕ and kk's ә/ғ/қ/… words were filtered out of the
  // frequent lists for exactly this reason).
  const roster = [uk, ru, be, bg, en, sr, mk, kk];
  const unique = distinctiveChars(roster);
  for (const p of roster) {
    it(`${p.code}.words.frequent`, () => {
      const u = unique.get(p.code) ?? new Set<string>();
      const offenders = (p.words?.frequent ?? []).filter((w) => hasDistinctiveChar(w, u));
      expect(offenders).toEqual([]);
    });
  }
});

describe("classifyBySnippet — Cyrillic-sibling discrimination (sr/mk/kk)", () => {
  // The new profiles must actually classify within a mixed Cyrillic roster.
  const roster = [uk, ru, be, bg, sr, mk, kk];

  it("classifies Serbian via its distinctive letters/words", () => {
    // ћ/ђ/ј are sr-distinctive at rung 1 within this roster.
    expect(classifyBySnippet("Ово је српски језик, ћирилица", roster).language).toBe("sr");
  });

  it("classifies Macedonian via its distinctive letters/words", () => {
    // ќ/ѓ/ѕ are mk-distinctive; ј/љ/њ/џ cancel against sr.
    expect(classifyBySnippet("Ова е македонски јазик, ќе одиме дома", roster).language).toBe("mk");
  });

  it("classifies Kazakh via its distinctive Turkic letters", () => {
    expect(classifyBySnippet("Бұл қазақ тілі, мен сені жақсы көремін", roster).language).toBe("kk");
  });

  it("Russian in the same roster still resolves to ru, not a sibling", () => {
    expect(classifyBySnippet("Это русский язык, объём и мысли", roster).language).toBe("ru");
  });
});
