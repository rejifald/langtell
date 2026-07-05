import { describe, expect, it } from "vitest";
import { FRANC_RUNG, RUNG3_MIN_LENGTH, classifyBySnippet, scopeCandidates } from "./classify.js";
import type { Rung, SnippetVerdict } from "./classify.js";
import { en, ru, uk } from "./profiles.js";

// The `langtell/classify` entry is the opt-in, power-user layer beneath the
// default Classification: it surfaces WHICH rung decided and the integer margin,
// neither of which a confidence float can reconstruct. These assert the public
// surface (shape + which rung fires for representative inputs); the exhaustive
// ladder behavior lives in internal/classify.test.ts.
describe("langtell/classify — structured snippet verdict", () => {
  it("returns { language, margin, rung } (plus the discriminating flag)", () => {
    const v: SnippetVerdict = classifyBySnippet("Слава Україні", [uk, ru]);
    expect(v.language).toBe("uk");
    expect(v.rung).toBe(1);
    expect(typeof v.margin).toBe("number");
    expect(v.discriminating).toBe(true);
    // The public verdict is exactly these four fields — nothing leaks.
    expect(Object.keys(v).sort()).toEqual(["discriminating", "language", "margin", "rung"]);
  });

  it("rung 1 — a distinctive letter (`ї`/`і`) decides", () => {
    expect(classifyBySnippet("Слава Україні", [uk, ru])).toMatchObject({
      language: "uk",
      rung: 1,
    });
  });

  it("rung 2a — a distinctive function word built from shared letters decides", () => {
    expect(classifyBySnippet("Кофе и чай", [uk, ru])).toMatchObject({
      language: "ru",
      rung: "2a",
    });
  });

  it("rung 2b — a distinctive-free frequent word decides", () => {
    expect(classifyBySnippet("работа", [uk, ru])).toMatchObject({
      language: "ru",
      rung: "2b",
    });
  });

  it("abstains to unknown with margin 0 and a null rung", () => {
    expect(classifyBySnippet("", [uk, ru])).toMatchObject({
      language: "unknown",
      margin: 0,
      rung: null,
    });
  });

  it("margin is the winner's integer lead over the runner-up (≥1 when decided)", () => {
    expect(classifyBySnippet("Слава Україні", [uk, ru]).margin).toBeGreaterThanOrEqual(1);
  });

  it("FRANC_RUNG names the optional trigram-backstop rung", () => {
    expect(FRANC_RUNG).toBe(3);
    const rung: Rung = FRANC_RUNG; // FRANC_RUNG is assignable to the Rung union
    expect(rung).toBe(3);
  });
});

// The scoping seams a rung-3 resolver needs to run its backstop off-path (over
// raw, unscoped candidates) the same way `classifyBySnippet` scopes internally.
describe("langtell/classify — exposed scoping seams", () => {
  it("RUNG3_MIN_LENGTH is the trigram length floor", () => {
    expect(RUNG3_MIN_LENGTH).toBe(24);
  });

  it("scopeCandidates narrows a roster to the text's dominant script", () => {
    // Cyrillic text keeps the Cyrillic candidates, drops the lone Latin one.
    expect(
      scopeCandidates("Привіт світ", [uk, ru, en])
        .map((p) => p.code)
        .sort(),
    ).toEqual(["ru", "uk"]);
    // Latin text keeps only the Latin candidate.
    expect(scopeCandidates("hello world", [uk, ru, en]).map((p) => p.code)).toEqual(["en"]);
    // No letters → nothing in scope.
    expect(scopeCandidates("12345 — !!!", [uk, ru, en])).toEqual([]);
  });
});
