import { describe, expect, it } from "vitest";
import { compile } from "./compile.js";
import { chromeAiEngine } from "./chrome-ai.js";
import { createFrancEngine } from "./franc.js";
import { en, ru, uk } from "./profiles.js";
import type { LanguageProfile } from "./types.js";

describe("compile (sync path)", () => {
  it("classifies from header evidence synchronously", () => {
    const detect = compile();
    const result = detect({ headers: { "content-language": "uk-UA" } });
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.language).toBe("uk");
  });

  it("returns unknown when there is no usable evidence", () => {
    const detect = compile();
    expect(detect({}).language).toBe("unknown");
  });
});

describe("compile (text + roster, end to end)", () => {
  it("classifies a Ukrainian title against the roster", () => {
    const detect = compile({ candidates: [uk, ru, en] });
    expect(detect({ text: "Слава Україні" }).language).toBe("uk");
  });

  it("distinguishes ru from uk on distinctive-free frequent words", () => {
    const detect = compile({ candidates: [uk, ru, en] });
    expect(detect({ text: "работа" }).language).toBe("ru");
  });

  it("clear script evidence is not flipped by a conflicting page locale", () => {
    const detect = compile({ candidates: [uk, ru, en] });
    const result = detect({
      text: "This is a clear English sentence about coding",
      headers: { "content-language": "uk" },
    });
    expect(result.language).toBe("en");
  });

  it("stays synchronous with a franc engine (franc is a SyncSource)", () => {
    const detect = compile({
      candidates: [uk, ru, en],
      engines: [createFrancEngine([uk, ru, en])],
    });
    const result = detect({ text: "Собака медленно бежала домой по дороге" });
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.language).toBe("ru");
  });
});

describe("compile — nonDiscriminatingScript: 'unknown' (issue #2)", () => {
  it("a Latin-only title with no other en evidence → unknown", () => {
    const detect = compile({ candidates: [uk, en], nonDiscriminatingScript: "unknown" });
    expect(detect({ text: "Inception" }).language).toBe("unknown");
    expect(detect({ text: "Der Untergang" }).language).toBe("unknown");
    expect(detect({ text: "XYZ123" }).language).toBe("unknown");
  });

  it("a Latin title WITH a corroborating en Content-Language → still en", () => {
    const detect = compile({ candidates: [uk, en], nonDiscriminatingScript: "unknown" });
    const result = detect({ text: "Inception", headers: { "content-language": "en" } });
    expect(result.language).toBe("en");
  });

  it("Cyrillic uk/ru disambiguation is unchanged with the option on", () => {
    const detect = compile({ candidates: [uk, ru, en], nonDiscriminatingScript: "unknown" });
    expect(detect({ text: "Слава Україні" }).language).toBe("uk");
    expect(detect({ text: "работа" }).language).toBe("ru");
  });

  it("the default (no option) still names the lone candidate", () => {
    const detect = compile({ candidates: [uk, en] });
    expect(detect({ text: "Inception" }).language).toBe("en");
  });
});

describe("compile — nonDiscriminatingScript: 'unknown' (issue #9, cross-script context)", () => {
  it("Latin title + uk page context (html-lang) → unknown, not uk", () => {
    const detect = compile({ candidates: [uk, en], nonDiscriminatingScript: "unknown" });
    expect(detect({ text: "Inception", html: '<html lang="uk">' }).language).toBe("unknown");
  });

  it("Latin title + uk og-locale → unknown", () => {
    const detect = compile({ candidates: [uk, en], nonDiscriminatingScript: "unknown" });
    const html = '<meta property="og:locale" content="uk_UA" />';
    expect(detect({ text: "Inception", html }).language).toBe("unknown");
  });

  it("Latin title + uk Content-Language header → unknown", () => {
    const detect = compile({ candidates: [uk, en], nonDiscriminatingScript: "unknown" });
    expect(detect({ text: "Inception", headers: { "content-language": "uk" } }).language).toBe(
      "unknown",
    );
  });

  it("Latin title + explicit en Content-Language → en (same script may name it)", () => {
    const detect = compile({ candidates: [uk, en], nonDiscriminatingScript: "unknown" });
    expect(detect({ text: "Inception", headers: { "content-language": "en" } }).language).toBe(
      "en",
    );
  });

  it("both-Latin roster [en, de]: Latin title + de page context → de still allowed", () => {
    // A bare title with no distinctive en/de signal abstains from a text read, so
    // the de page context (same Latin script) legitimately disambiguates.
    const de: LanguageProfile = { code: "de", alphabet: "abcdefghijklmnopqrstuvwxyzäöüß" };
    const detect = compile({ candidates: [en, de], nonDiscriminatingScript: "unknown" });
    expect(detect({ text: "Inception", html: '<html lang="de">' }).language).toBe("de");
  });

  it("Cyrillic uk/ru disambiguation is unchanged by the cross-script cut", () => {
    const detect = compile({ candidates: [uk, ru, en], nonDiscriminatingScript: "unknown" });
    expect(detect({ text: "Слава Україні", headers: { "content-language": "ru" } }).language).toBe(
      "uk",
    );
    expect(detect({ text: "работа" }).language).toBe("ru");
  });
});

describe("compile (async path)", () => {
  it("returns a Promise once an async engine is registered", async () => {
    const detect = compile({ engines: [chromeAiEngine] });
    const pending = detect({ headers: { "content-language": "en-US" } });
    expect(pending).toBeInstanceOf(Promise);
    const result = await pending;
    expect(result.language).toBe("en");
  });
});
