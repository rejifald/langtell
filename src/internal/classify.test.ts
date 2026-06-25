import { describe, expect, it } from "vitest";
import { classifyBySnippet, distinctiveChars, scopeCandidates, stripNoise } from "./classify.js";
import { be, bg, en, ru, uk } from "../profiles.js";

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
    expect(classifyBySnippet("", [uk, ru])).toEqual({ language: "unknown", margin: 0, rung: null });
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

describe("distinctiveChars — frequent lists carry no globally-unique characters", () => {
  // A word containing a char unique to its own language is dead weight — rung 1
  // catches it first. This pins the invariant for the shipped profiles.
  const unique = distinctiveChars([uk, ru, be, bg, en]);
  for (const p of [uk, ru, be, bg, en]) {
    it(`${p.code}.words.frequent`, () => {
      const u = unique.get(p.code) ?? new Set<string>();
      const offenders = (p.words?.frequent ?? []).filter((w) => hasDistinctiveChar(w, u));
      expect(offenders).toEqual([]);
    });
  }
});
