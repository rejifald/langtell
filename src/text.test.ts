import { describe, expect, it } from "vitest";
import { evidenceFromText } from "./text.js";
import { be, bg, en, ru, uk } from "./profiles.js";
import type { LanguageProfile } from "./types.js";

/** The standard candidate set: two scripts, the uk/ru/be/bg disambiguation set. */
const CANDIDATES = [uk, en, ru, be, bg];

/** The single language code the text producer settled on, or `"unknown"` when
 *  it abstained (emitted nothing). */
function lang(text: string, candidates: readonly LanguageProfile[]): string {
  const ev = evidenceFromText(text, candidates);
  return ev[0]?.language ?? "unknown";
}

describe("evidenceFromText — abstains without a roster", () => {
  it("emits nothing when no candidates are given", () => {
    expect(evidenceFromText("Слава Україні")).toEqual([]);
    expect(evidenceFromText("Слава Україні", [])).toEqual([]);
  });

  it("emits nothing for empty/whitespace text", () => {
    expect(evidenceFromText("", CANDIDATES)).toEqual([]);
    expect(evidenceFromText("   ", CANDIDATES)).toEqual([]);
  });
});

describe("evidenceFromText — rung 1 (distinctive letters)", () => {
  it("decides uk via a distinctive letter (і)", () => {
    expect(lang("Слава Україні", [uk, ru])).toBe("uk");
  });

  it("decides ru via distinctive letters (э/ы/ъ)", () => {
    expect(lang("Это русский язык, объём", [uk, ru])).toBe("ru");
  });

  it("decides be via ў against ru", () => {
    expect(lang("Я ведаю беларускую мову, дзякуй за ўсё", [be, ru])).toBe("be");
  });

  it("emits a title-script item with a non-zero confidence", () => {
    const ev = evidenceFromText("Слава Україні", [uk, ru]);
    expect(ev).toHaveLength(1);
    expect(ev[0]?.kind).toBe("title-script");
    expect(ev[0]?.confidence).toBeGreaterThan(0.6);
  });
});

describe("evidenceFromText — fellow Cyrillic is never mislabeled ru", () => {
  it("Bulgarian text → bg, never ru, under the full candidate set", () => {
    const v = lang("Аз съм българин и това е защото обичам езика", CANDIDATES);
    expect(v).toBe("bg");
    expect(v).not.toBe("ru");
  });

  it("a lone ъ no longer reads as ru once bg is a candidate", () => {
    expect(lang("ъ", [uk, ru])).toBe("ru");
    expect(lang("ъ", [ru, bg])).toBe("unknown");
    expect(lang("ъ", CANDIDATES)).not.toBe("ru");
  });

  it("Belarusian text → be, never ru, under the full set", () => {
    const v = lang("Я ведаю беларускую мову, дзякуй за ўсё", CANDIDATES);
    expect(v).toBe("be");
    expect(v).not.toBe("ru");
  });

  it("Russian distinctive text still wins ru even with be/bg present", () => {
    expect(lang("Это очень важно для всех нас", CANDIDATES)).toBe("ru");
  });
});

describe("evidenceFromText — distinctiveness is candidate-set-relative", () => {
  it("`і` → uk in {uk, ru}", () => {
    expect(lang("і", [uk, ru])).toBe("uk");
  });

  it("`і` → be in {be, ru}", () => {
    expect(lang("і", [be, ru])).toBe("be");
  });

  it("`і` → unknown in {uk, be} (both have it — inert)", () => {
    expect(lang("і", [uk, be])).toBe("unknown");
  });

  it("`и` is ru-distinctive vs be (be has no и)", () => {
    expect(lang("ы и", [be, ru])).toBe("ru");
  });
});

describe("evidenceFromText — intra-word apostrophe (uk/be keep-signal)", () => {
  for (const [label, ch] of [
    ["U+0027", "'"],
    ["U+2019", "’"],
    ["U+02BC", "ʼ"],
  ] as const) {
    it(`комп${ch}ютер → uk (apostrophe ${label})`, () => {
      expect(lang(`комп${ch}ютер`, [uk, ru])).toBe("uk");
    });
  }

  it("an apostrophe-only word is inert between uk and be (both carry it)", () => {
    expect(lang("комп'ютер", CANDIDATES)).not.toBe("ru");
    expect(lang("комп'ютер", [uk, be])).toBe("unknown");
  });

  it("a Latin contraction stays en, not uk", () => {
    expect(lang("don't worry, it's fine", CANDIDATES)).toBe("en");
  });
});

describe("evidenceFromText — rung 2 (words)", () => {
  it("standalone `и` → ru (letter shared, word is not)", () => {
    expect(lang("Кофе и чай", [uk, ru])).toBe("ru");
  });

  it("`що` (shared letters) → uk via the word rung", () => {
    expect(lang("Зробити що треба", [uk, ru])).toBe("uk");
  });

  it("a distinctive-free word decides via frequent lists (работа → ru)", () => {
    expect(lang("работа", [uk, ru])).toBe("ru");
  });

  it("synthetic frequent words decide in both directions", () => {
    const a: LanguageProfile = {
      code: "xa",
      alphabet: "abc",
      words: { function: [], frequent: ["cat"] },
    };
    const b: LanguageProfile = {
      code: "xb",
      alphabet: "abc",
      words: { function: [], frequent: ["dog"] },
    };
    expect(lang("cat", [a, b])).toBe("xa");
    expect(lang("dog", [a, b])).toBe("xb");
  });
});

describe("evidenceFromText — unknown abstains", () => {
  it("Latin text with only Cyrillic candidates → abstain", () => {
    expect(lang("Apple Music", [uk, ru])).toBe("unknown");
  });

  it("detects en when en is a candidate", () => {
    expect(lang("Apple Music", [uk, ru, en])).toBe("en");
  });

  it("empty / numeric / punctuation → abstain", () => {
    expect(lang("12345 !!! ...", [uk, ru])).toBe("unknown");
  });

  it("a genuine tie → abstain", () => {
    expect(lang("ї ы", [uk, ru])).toBe("unknown");
  });
});

describe("evidenceFromText — dominant-script scoping", () => {
  it("a Latin brand name in a Cyrillic title does not tip to en", () => {
    expect(lang("Всё о коде на YouTube", [uk, ru, en])).toBe("ru");
  });

  it("a Cyrillic name in an English sentence stays en", () => {
    expect(lang("New album by Иван today", [uk, ru, en])).toBe("en");
  });
});

describe("evidenceFromText — trailing Latin noise does not flip the script vote", () => {
  it("Russian title + long trailing URL still classifies ru", () => {
    expect(lang("Это важно для всех https://www.example.com/a/b/c/d/e", CANDIDATES)).toBe("ru");
  });

  it("Russian title + @handle still classifies ru", () => {
    expect(lang("Это очень важно сегодня @some_news_channel", CANDIDATES)).toBe("ru");
  });

  it("Russian title + #hashtags still classifies ru", () => {
    expect(lang("Как это работает на практике #обзор #новости", CANDIDATES)).toBe("ru");
  });
});
