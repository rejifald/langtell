import { describe, expect, it } from "vitest";
import { createFrancEngine, evidenceFromFranc } from "./franc.js";
import { be, bg, en, ru, uk } from "./profiles.js";
import type { LanguageProfile } from "./types.js";

/** Profiles with empty word lists so only rung 3 (franc) can decide; real
 *  alphabets + iso6393 keep rung 1 abstaining on shared-letter text. */
const ukRaw: LanguageProfile = {
  code: "uk",
  iso6393: "ukr",
  alphabet: uk.alphabet,
  words: { function: [], frequent: [] },
};
const ruRaw: LanguageProfile = {
  code: "ru",
  iso6393: "rus",
  alphabet: ru.alphabet,
  words: { function: [], frequent: [] },
};

const CANDIDATES = [uk, en, ru, be, bg];

describe("evidenceFromFranc", () => {
  it("catches distinctive-free Russian via franc", () => {
    const ev = evidenceFromFranc("Собака медленно бежала домой по дороге", [ukRaw, ruRaw]);
    expect(ev[0]).toMatchObject({ kind: "franc", language: "ru" });
    expect(ev[0]?.confidence).toBeGreaterThan(0.4);
  });

  it("abstains below the length floor", () => {
    expect(evidenceFromFranc("кот", [ukRaw, ruRaw])).toEqual([]);
  });

  it("abstains when fewer than two candidates carry an iso6393 code", () => {
    const noIso: LanguageProfile = {
      code: "xx",
      alphabet: ru.alphabet,
      words: { function: [], frequent: [] },
    };
    expect(evidenceFromFranc("Собака медленно бежала домой по дороге", [noIso, ruRaw])).toEqual([]);
  });

  it("abstains without a candidate roster", () => {
    expect(evidenceFromFranc("Собака медленно бежала домой по дороге", undefined)).toEqual([]);
    expect(evidenceFromFranc("Собака медленно бежала домой по дороге", [])).toEqual([]);
  });

  it("scopes Cyrillic past trailing Latin noise and ranks ru", () => {
    const ev = evidenceFromFranc(
      "Собака медленно бежала домой по дороге https://example.com/article/123",
      CANDIDATES,
    );
    expect(ev[0]?.language).toBe("ru");
  });
});

describe("createFrancEngine", () => {
  it("is a synchronous source bound to its roster", () => {
    const engine = createFrancEngine([uk, ru]);
    expect(engine.sync).toBe(true);
    expect(engine.id).toBe("franc");
    const ev = engine.detect({ text: "Собака медленно бежала домой по дороге" });
    expect(ev[0]?.language).toBe("ru");
  });
});
