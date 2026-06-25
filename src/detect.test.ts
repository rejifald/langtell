import { describe, expect, it } from "vitest";
import { compile } from "./compile.js";
import { chromeAiEngine } from "./chrome-ai.js";

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

describe("compile (async path)", () => {
  it("returns a Promise once an async engine is registered", async () => {
    const detect = compile({ engines: [chromeAiEngine] });
    const pending = detect({ headers: { "content-language": "en-US" } });
    expect(pending).toBeInstanceOf(Promise);
    const result = await pending;
    expect(result.language).toBe("en");
  });
});
