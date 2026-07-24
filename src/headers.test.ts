import { describe, expect, it } from "vitest";
import { evidenceFromHeaders } from "./headers.js";
import type { HeaderBag } from "./types.js";

describe("evidenceFromHeaders", () => {
  it("reads a duck-typed Headers-like object that is not instanceof Headers", () => {
    // Simulates a node-fetch/cross-fetch/jsdom Headers instance: it has a
    // working `.get`, but fails `instanceof Headers` against the realm's
    // global class.
    const polyfilled = {
      get: (n: string) => (n === "content-language" ? "uk" : null),
    } as unknown as Headers;
    const ev = evidenceFromHeaders(polyfilled);
    expect(ev).toContainEqual(
      expect.objectContaining({ kind: "http-content-language", language: "uk" }),
    );
  });

  it("reads a real global Headers instance", () => {
    const headers = new Headers({ "Content-Language": "ru-RU" });
    const ev = evidenceFromHeaders(headers);
    expect(ev[0]).toMatchObject({ kind: "http-content-language", language: "ru" });
  });

  it("reads a plain object with a mixed-case key", () => {
    const ev = evidenceFromHeaders({ "Content-Language": "uk" });
    expect(ev[0]).toMatchObject({ kind: "http-content-language", language: "uk" });
  });

  it("joins an array-valued record header", () => {
    const ev = evidenceFromHeaders({ "content-language": ["en", "US"] });
    expect(ev[0]).toMatchObject({ kind: "http-content-language", value: "en,US" });
  });

  it("takes the record branch for a plain object whose 'get' key is not a function", () => {
    const headers = { get: "not-a-function", "content-language": "uk" } as unknown as HeaderBag;
    const ev = evidenceFromHeaders(headers);
    expect(ev[0]).toMatchObject({ kind: "http-content-language", language: "uk" });
  });

  it("returns [] for undefined input", () => {
    expect(evidenceFromHeaders(undefined)).toEqual([]);
  });
});
