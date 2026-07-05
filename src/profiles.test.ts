import { describe, expect, it } from "vitest";
import {
  PROFILED_CODES,
  PROFILES,
  bg,
  getProfiles,
  hasProfile,
  kk,
  mk,
  ru,
  sr,
  uk,
} from "./profiles.js";

describe("PROFILES registry", () => {
  it("ships uk, ru, be, bg, en, sr, mk, kk", () => {
    expect(Object.keys(PROFILES).sort()).toEqual(["be", "bg", "en", "kk", "mk", "ru", "sr", "uk"]);
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

  it("the Cyrillic-sibling profiles carry their canonical alphabets and distinctives", () => {
    // Lengths are the canonical letter counts.
    expect(sr.alphabet.length).toBe(30);
    expect(mk.alphabet.length).toBe(31);
    expect(kk.alphabet.length).toBe(42);
    // Serbian: ђ ћ (sr-only) + ј љ њ џ (shared with mk).
    for (const ch of "ђћјљњџ") expect(sr.alphabet).toContain(ch);
    expect(sr.alphabet).not.toContain("ы"); // no Russian letters
    expect(sr.alphabet).not.toContain("ъ");
    // Macedonian: ѓ ќ ѕ (mk-only) + ј љ њ џ; no Serbian ђ ћ.
    for (const ch of "ѓќѕјљњџ") expect(mk.alphabet).toContain(ch);
    expect(mk.alphabet).not.toContain("ђ");
    expect(mk.alphabet).not.toContain("ћ");
    // Kazakh: the distinctive Turkic set.
    for (const ch of "әғқңөұүһі") expect(kk.alphabet).toContain(ch);
  });

  it("iso6393 codes for the new profiles are srp / mkd / kaz", () => {
    expect(sr.iso6393).toBe("srp");
    expect(mk.iso6393).toBe("mkd");
    expect(kk.iso6393).toBe("kaz");
  });

  it("ships non-empty frequent lists for the corpus-backed languages", () => {
    expect((uk.words?.frequent ?? []).length).toBeGreaterThan(100);
    expect((ru.words?.frequent ?? []).length).toBeGreaterThan(100);
    // mk is corpus-backed too; sr/kk are thinner (hand-curated / small corpus)
    // but must still be non-empty.
    expect((mk.words?.frequent ?? []).length).toBeGreaterThan(100);
    expect((sr.words?.frequent ?? []).length).toBeGreaterThan(0);
    expect((kk.words?.frequent ?? []).length).toBeGreaterThan(0);
  });

  it("every new profile's function words are spelt in its own alphabet", () => {
    for (const p of [sr, mk, kk]) {
      const letters = new Set(p.alphabet);
      for (const w of p.words?.function ?? []) {
        for (const ch of w) expect(letters.has(ch)).toBe(true);
      }
    }
  });
});

describe("getProfiles", () => {
  it("resolves known codes and skips unknown ones", () => {
    expect(getProfiles(["uk", "ru"]).map((p) => p.code)).toEqual(["uk", "ru"]);
    expect(getProfiles(["uk", "zz"]).map((p) => p.code)).toEqual(["uk"]);
  });
});

describe("PROFILED_CODES / hasProfile", () => {
  it("PROFILED_CODES lists exactly the shipped codes", () => {
    expect([...PROFILED_CODES].sort()).toEqual(["be", "bg", "en", "kk", "mk", "ru", "sr", "uk"]);
  });

  it("hasProfile is true for shipped codes, false otherwise", () => {
    expect(hasProfile("uk")).toBe(true);
    expect(hasProfile("en")).toBe(true);
    expect(hasProfile("zz")).toBe(false);
  });

  it("hasProfile is not fooled by inherited Object.prototype names", () => {
    expect(hasProfile("toString")).toBe(false);
    expect(hasProfile("constructor")).toBe(false);
  });

  it("every PROFILED_CODES entry resolves via hasProfile and getProfiles", () => {
    for (const code of PROFILED_CODES) expect(hasProfile(code)).toBe(true);
    expect(getProfiles(PROFILED_CODES).map((p) => p.code)).toEqual([...PROFILED_CODES]);
  });
});
