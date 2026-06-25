import { describe, expect, it } from "vitest";
import { PROFILED_CODES, PROFILES, bg, getProfiles, hasProfile, ru, uk } from "./profiles.js";

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

describe("PROFILED_CODES / hasProfile", () => {
  it("PROFILED_CODES lists exactly the shipped codes", () => {
    expect([...PROFILED_CODES].sort()).toEqual(["be", "bg", "en", "ru", "uk"]);
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
