import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChromeAiEngine } from "./chrome-ai.js";
import type { AsyncSource } from "./types.js";

type AvailabilityState = "available" | "downloadable" | "downloading" | "unavailable";
interface DetectorResult {
  detectedLanguage: string;
  confidence: number;
}

function installStub(opts: {
  availability: AvailabilityState;
  detect?: (text: string) => DetectorResult[];
}): { availabilitySpy: ReturnType<typeof vi.fn>; createSpy: ReturnType<typeof vi.fn> } {
  const availabilitySpy = vi.fn(() => opts.availability);
  const detectSpy = vi.fn((text: string) =>
    opts.detect ? opts.detect(text) : [{ detectedLanguage: "en", confidence: 0.99 }],
  );
  const createSpy = vi.fn(() => ({ detect: detectSpy }));
  (globalThis as unknown as { LanguageDetector: unknown }).LanguageDetector = {
    availability: availabilitySpy,
    create: createSpy,
  };
  return { availabilitySpy, createSpy };
}

function uninstallStub(): void {
  delete (globalThis as unknown as { LanguageDetector?: unknown }).LanguageDetector;
}

let engine: AsyncSource;

beforeEach(() => {
  engine = createChromeAiEngine();
});
afterEach(() => {
  uninstallStub();
});

describe("chromeAiEngine.isAvailable", () => {
  it("returns false synchronously when LanguageDetector is missing", () => {
    uninstallStub();
    expect(engine.isAvailable?.()).toBe(false);
  });

  it("is available only for state 'available'", async () => {
    installStub({ availability: "available" });
    await expect(engine.isAvailable?.()).resolves.toBe(true);
  });

  it("treats 'downloadable' as unavailable — never triggers a download", async () => {
    const { createSpy } = installStub({ availability: "downloadable" });
    await expect(engine.isAvailable?.()).resolves.toBe(false);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("treats 'downloading' and 'unavailable' as unavailable", async () => {
    installStub({ availability: "downloading" });
    await expect(engine.isAvailable?.()).resolves.toBe(false);
    engine = createChromeAiEngine();
    installStub({ availability: "unavailable" });
    await expect(engine.isAvailable?.()).resolves.toBe(false);
  });

  it("caches the result — no repeat availability() probes", async () => {
    const { availabilitySpy } = installStub({ availability: "available" });
    await engine.isAvailable?.();
    await engine.isAvailable?.();
    expect(availabilitySpy).toHaveBeenCalledTimes(1);
  });
});

describe("chromeAiEngine.detect (model available)", () => {
  it("emits chrome-ai evidence for a confident detection", async () => {
    installStub({
      availability: "available",
      detect: () => [{ detectedLanguage: "uk", confidence: 0.92 }],
    });
    const ev = await engine.detect({ text: "Привіт, як справи" }, {});
    expect(ev[0]).toMatchObject({ kind: "chrome-ai", language: "uk", confidence: 0.92 });
  });

  it("abstains below the confidence threshold", async () => {
    installStub({
      availability: "available",
      detect: () => [{ detectedLanguage: "uk", confidence: 0.4 }],
    });
    expect(await engine.detect({ text: "ambiguous" }, {})).toEqual([]);
  });

  it("abstains on empty text", async () => {
    installStub({ availability: "available" });
    expect(await engine.detect({ text: "" }, {})).toEqual([]);
  });

  it("reuses one session across detect() calls", async () => {
    const { createSpy } = installStub({ availability: "available" });
    await engine.detect({ text: "one" }, {});
    await engine.detect({ text: "two" }, {});
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});

describe("chromeAiEngine.detect — self-gating on availability (issue #23)", () => {
  it("never calls create() for a 'downloadable' model, even when driven directly", async () => {
    const { availabilitySpy, createSpy } = installStub({ availability: "downloadable" });
    expect(await engine.detect({ text: "Привіт, як справи" }, {})).toEqual([]);
    expect(createSpy).not.toHaveBeenCalled();
    expect(availabilitySpy).toHaveBeenCalledTimes(1);
  });

  it("abstains for 'downloading' and 'unavailable' without creating a session", async () => {
    const downloading = installStub({ availability: "downloading" });
    expect(await engine.detect({ text: "Привіт" }, {})).toEqual([]);
    expect(downloading.createSpy).not.toHaveBeenCalled();

    engine = createChromeAiEngine();
    const unavailable = installStub({ availability: "unavailable" });
    expect(await engine.detect({ text: "Привіт" }, {})).toEqual([]);
    expect(unavailable.createSpy).not.toHaveBeenCalled();
  });

  it("abstains when the LanguageDetector API is missing entirely", async () => {
    uninstallStub();
    expect(await engine.detect({ text: "Привіт" }, {})).toEqual([]);
  });

  it("probes availability at most once across detect() calls", async () => {
    const { availabilitySpy } = installStub({ availability: "available" });
    await engine.detect({ text: "one" }, {});
    await engine.detect({ text: "two" }, {});
    expect(availabilitySpy).toHaveBeenCalledTimes(1);
  });
});

describe("chromeAiEngine.detect — abort signal (issue #29)", () => {
  it("throws the abort reason when the signal is already aborted", async () => {
    installStub({ availability: "available" });
    const controller = new AbortController();
    controller.abort(new Error("cancelled up front"));
    await expect(engine.detect({ text: "Привіт" }, { signal: controller.signal })).rejects.toThrow(
      "cancelled up front",
    );
  });

  it("throws when the signal aborts while the model call is in flight", async () => {
    const controller = new AbortController();
    installStub({
      availability: "available",
      detect: () => {
        controller.abort(new Error("cancelled in flight"));
        return [{ detectedLanguage: "uk", confidence: 0.92 }];
      },
    });
    await expect(engine.detect({ text: "Привіт" }, { signal: controller.signal })).rejects.toThrow(
      "cancelled in flight",
    );
  });

  it("is unaffected by a signal that never aborts", async () => {
    installStub({
      availability: "available",
      detect: () => [{ detectedLanguage: "uk", confidence: 0.92 }],
    });
    const controller = new AbortController();
    const ev = await engine.detect({ text: "Привіт" }, { signal: controller.signal });
    expect(ev[0]).toMatchObject({ kind: "chrome-ai", language: "uk" });
  });
});
