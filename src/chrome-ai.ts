/**
 * `langtell/chrome-ai` — the opt-in on-device engine wrapping the browser's
 * `LanguageDetector` API (Gemini Nano on Chrome 138+ / Edge). Lives behind its
 * own subpath; the zero-dependency core never imports it.
 *
 * Opportunistic: it never triggers a model download. Availability (per Chrome
 * docs):
 *   - `available`    — model loaded, ready. We're available.
 *   - `downloadable` — could be fetched on demand. Treated as unavailable so we
 *                      never initiate a download the user hasn't consented to.
 *   - `downloading`  — same reasoning; wait for the model to land.
 *   - `unavailable`  — Chrome's flat-out no. Skip.
 *
 * Emits `kind: "chrome-ai"` evidence with the model's own confidence. An
 * `AsyncSource`: registering it flips the compiled `detect` to `Promise`-typed.
 */
import type { AsyncSource, DetectContext, LanguageEvidence } from "./types.js";

const DEFAULT_MAX_CHARS = 2000;
/** Minimum top-language confidence to count as a confident detection; below
 *  this we abstain rather than risk a thin-plurality misclassification. */
const CONFIDENCE_THRESHOLD = 0.6;

type AvailabilityState = "available" | "downloadable" | "downloading" | "unavailable";

interface LanguageDetectorResult {
  detectedLanguage: string;
  confidence: number;
}

interface LanguageDetectorSession {
  detect(text: string): Promise<LanguageDetectorResult[]>;
}

interface LanguageDetectorApi {
  availability(): Promise<AvailabilityState>;
  create(): Promise<LanguageDetectorSession>;
}

function getApi(): LanguageDetectorApi | null {
  const globalRef = globalThis as unknown as { LanguageDetector?: LanguageDetectorApi };
  return globalRef.LanguageDetector ?? null;
}

/**
 * Build a chrome-ai {@link AsyncSource}. State (availability + session) is
 * cached per instance: once availability is confirmed it is not re-probed for
 * the instance's lifetime, and the detector session is created once and reused.
 */
export function createChromeAiEngine(): AsyncSource {
  let cachedAvailability: boolean | null = null;
  let cachedSession: LanguageDetectorSession | null = null;

  async function checkAvailability(): Promise<boolean> {
    if (cachedAvailability !== null) return cachedAvailability;
    const api = getApi();
    if (!api) {
      cachedAvailability = false;
      return false;
    }
    const state = await api.availability();
    cachedAvailability = state === "available";
    return cachedAvailability;
  }

  async function getSession(): Promise<LanguageDetectorSession> {
    if (cachedSession) return cachedSession;
    const api = getApi();
    if (!api) throw new Error("chrome-ai: LanguageDetector API missing");
    cachedSession = await api.create();
    return cachedSession;
  }

  return {
    id: "chrome-ai",
    sync: false,
    inputs: ["text"],
    isAvailable(): boolean | Promise<boolean> {
      if (cachedAvailability !== null) return cachedAvailability;
      // No API at all — return false synchronously so the common (non-Chrome)
      // case skips without a promise round-trip.
      if (!getApi()) {
        cachedAvailability = false;
        return false;
      }
      return checkAvailability();
    },
    async detect(input, ctx: DetectContext = {}): Promise<LanguageEvidence[]> {
      const text = input.text;
      if (text === undefined || text.trim().length === 0) return [];
      const session = await getSession();
      const sample = text.slice(0, ctx.maxChars ?? DEFAULT_MAX_CHARS);
      const results = await session.detect(sample);
      const top = results[0];
      if (!top || top.confidence < CONFIDENCE_THRESHOLD) return [];
      return [
        {
          kind: "chrome-ai",
          language: top.detectedLanguage,
          confidence: clamp01(top.confidence),
          source: "chrome-ai",
          value: top.detectedLanguage,
        },
      ];
    },
  };
}

/** A ready-to-register chrome-ai engine instance. */
export const chromeAiEngine: AsyncSource = createChromeAiEngine();

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
