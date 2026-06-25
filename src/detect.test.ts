import { describe, expect, it } from "vitest";
import { compile } from "./compile.js";
import { chromeAiEngine } from "./chrome-ai.js";
import { createFrancEngine } from "./franc.js";
import { en, ru, uk } from "./profiles.js";

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

describe("compile (async path)", () => {
  it("returns a Promise once an async engine is registered", async () => {
    const detect = compile({ engines: [chromeAiEngine] });
    const pending = detect({ headers: { "content-language": "en-US" } });
    expect(pending).toBeInstanceOf(Promise);
    const result = await pending;
    expect(result.language).toBe("en");
  });
});
