import { describe, expect, it } from "vitest";
import {
  classifyBySnippet,
  CONTRADICTION_SHARE,
  contradictionShare,
  distinctiveChars,
  scopeCandidates,
  stripNoise,
} from "./classify.js";
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

  it("the ladder carries on past a rung-1 blank to the word rungs", () => {
    // No distinctive letter on either side (`и` is shared) — rung 1 scores 0-0
    // and the ladder keeps going, deciding on the function word `и`.
    expect(classifyBySnippet("Кофе и чай", [uk, ru])).toMatchObject({ rung: "2a" });
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

describe("classifyBySnippet — a contradicted winner loses to unknown", () => {
  // The closed set {uk, ru} does not contain Belarusian, and Belarusian is built
  // from letters both of them own plus a few neither does. Rung 1 hands the `і`s
  // to Ukrainian; `ы`/`э`/`ў` — none of which Ukrainian has — are what says the
  // answer cannot be Ukrainian.
  it("Belarusian carrying no ў is not called Ukrainian on its і's", () => {
    expect(
      classifyBySnippet("Мова і культура Беларусі маюць багатую гісторыю", [uk, ru]),
    ).toMatchObject({ language: "unknown", rung: null });
  });

  it("Belarusian with э and ы is not called Ukrainian", () => {
    expect(
      classifyBySnippet("Гэта цікавая кніга і добры фільм пра нашу краіну", [uk, ru]).language,
    ).toBe("unknown");
  });

  it("Belarusian carrying ў is not called Russian either", () => {
    expect(classifyBySnippet("Беларусь — гэта краіна ў цэнтры Еўропы", [uk, ru]).language).toBe(
      "unknown",
    );
  });

  it("a word-rung winner is vetoed the same as a letter-rung one", () => {
    // Not one distinctive letter in the roster's favour; the verdict came from
    // rung 2, and the contradiction applies there too.
    const v = classifyBySnippet(
      "Прывітанне! Як твае справы сёння? Дзякуй вялікі за дапамогу і падтрымку.",
      [uk, ru],
    );
    expect(v.language).toBe("unknown");
  });

  it("а rung-1 tie between letters neither side can spell is unknown, not a word-rung call", () => {
    // `і` ties `ы`: each is a letter the other candidate does not have, so the
    // text argues against both. It is Belarusian's signature, not a tie to break.
    expect(classifyBySnippet("і ы", [uk, ru]).language).toBe("unknown");
  });

  it("the veto is script-symmetric: German against a lone en candidate", () => {
    // Non-discriminating rosters are where a forced choice is most confident and
    // least earned — every Latin text "matches" the only Latin candidate.
    expect(
      classifyBySnippet("Die Prüfung war für alle Schüler außerordentlich schwierig", [uk, en])
        .language,
    ).toBe("unknown");
  });

  it("Polish against a lone en candidate", () => {
    expect(
      classifyBySnippet("Wczoraj spotkałem się z przyjaciółmi w kawiarni na rynku", [en]).language,
    ).toBe("unknown");
  });

  it("does NOT promote the runner-up — a set that cannot account for the text abstains", () => {
    // ru is the only other candidate and it is contradicted too (by `і`/`ў`).
    // Even were it not, the answer stays `unknown`: the winner losing its claim
    // is not evidence for anyone else.
    expect(classifyBySnippet("Беларусь — гэта краіна ў цэнтры Еўропы", [uk, ru]).rung).toBeNull();
  });
});

describe("classifyBySnippet — the veto leaves earned verdicts alone", () => {
  it("Ukrainian is still Ukrainian", () => {
    expect(classifyBySnippet("Слава Україні, її мова і культура", [uk, ru]).language).toBe("uk");
  });

  it("Russian is still Russian", () => {
    expect(classifyBySnippet("Это русский язык, объём и мысли", [uk, ru]).language).toBe("ru");
  });

  it("Belarusian IS Belarusian once the roster carries it", () => {
    // The point of the veto is a roster that cannot account for the text — not a
    // penalty on Belarusian. Add be and the text stops contradicting its winner
    // (be's own contradiction share here is 0), so the verdict lands.
    expect(classifyBySnippet("Беларусь — гэта краіна ў цэнтры Еўропы", [uk, ru, be])).toMatchObject(
      { language: "be" },
    );
    expect(contradictionShare("Беларусь — гэта краіна ў цэнтры Еўропы", be)).toBe(0);
  });

  it("a borrowed proper noun is a loanword, not a contradiction", () => {
    // ~1.5 % of the letters. Withdrawing here would mean any Russian article
    // about a neighbour stops being detectable as Russian.
    const ru_with_sr =
      "Сербский теннисист Новак Ђоковић выиграл турнир в Белграде. Он поблагодарил " +
      "болельщиков и рассказал о планах на следующий сезон, который начнётся уже в январе.";
    expect(classifyBySnippet(ru_with_sr, [uk, ru]).language).toBe("ru");
  });

  it("an article quoting its neighbour keeps its own language", () => {
    const uk_with_ru =
      "Сьогодні в Києві відкрилася нова виставка українського мистецтва. Російський " +
      "критик написав: «Это прекрасно». Експозиція триватиме до кінця літа, кажуть організатори.";
    expect(classifyBySnippet(uk_with_ru, [uk, ru]).language).toBe("uk");
  });

  it("English with an accented citation is still English", () => {
    const en_with_de =
      "The exhibition opened last night with a short speech from the mayor, who " +
      "greeted the visitors with a warm Grüße before the curator took over and " +
      "walked the room through the collection piece by piece.";
    expect(classifyBySnippet(en_with_de, [en]).language).toBe("en");
  });
});

describe("contradictionShare", () => {
  it("is 0 for text a profile can spell", () => {
    expect(contradictionShare("Слава Україні", uk)).toBe(0);
    expect(contradictionShare("Это русский язык", ru)).toBe(0);
  });

  it("counts only letters of the profile's own script", () => {
    // The Latin brand name is not evidence against a Cyrillic candidate.
    expect(contradictionShare("Купуйте квитки на Ryanair", uk)).toBe(0);
  });

  it("ignores URLs, @handles and #hashtags, as the classifier does", () => {
    // The handle is Cyrillic and carries `ы` — inside the noise it must not
    // count against a Ukrainian reading of the prose.
    expect(contradictionShare("Слава Україні @мысли", uk)).toBe(0);
  });

  it("rises with letters the profile does not have", () => {
    expect(contradictionShare("ыыыы", uk)).toBe(1);
    expect(
      contradictionShare("Мова і культура Беларусі маюць багатую гісторыю", uk),
    ).toBeGreaterThan(CONTRADICTION_SHARE);
  });

  it("a profile that cannot spell its own words contradicts itself", () => {
    // Documented, not incidental: `alphabet` is what the veto measures against,
    // so a partial alphabet silently disarms the word rungs for that candidate.
    const partial = { code: "xa", alphabet: "abc", words: { function: [], frequent: ["cat"] } };
    expect(contradictionShare("cat", partial)).toBeGreaterThan(CONTRADICTION_SHARE);
  });
});
