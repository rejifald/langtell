import { describe, expect, it } from "vitest";
import { PROFILES, bg, getProfiles, ru, uk } from "./profiles.js";

describe("PROFILES registry", () => {
  it("ships uk, ru, be, bg, en", () => {
    expect(Object.keys(PROFILES).sort()).toEqual(["be", "bg", "en", "ru", "uk"]);
  });

  it("each profile carries an alphabet and an iso6393 code", () => {
    for (const p of Object.values(PROFILES)) {
      expect(p.alphabet.length).toBeGreaterThan(0);
      expect(p.iso6393).toBeTruthy();
    }
  });

  it("the Cyrillic profiles carry their distinctive letters", () => {
    expect(uk.alphabet).toContain("і");
    expect(ru.alphabet).toContain("ы");
    expect(bg.alphabet).toContain("ъ");
    expect(bg.alphabet).not.toContain("ы"); // bg has no ы
  });

  it("ships non-empty frequent lists for the corpus-backed languages", () => {
    expect((uk.words?.frequent ?? []).length).toBeGreaterThan(100);
    expect((ru.words?.frequent ?? []).length).toBeGreaterThan(100);
  });
});

describe("getProfiles", () => {
  it("resolves known codes and skips unknown ones", () => {
    expect(getProfiles(["uk", "ru"]).map((p) => p.code)).toEqual(["uk", "ru"]);
    expect(getProfiles(["uk", "zz"]).map((p) => p.code)).toEqual(["uk"]);
  });
});
