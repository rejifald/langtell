import type { AsyncSource, LanguageEvidence } from "./types.js";

/**
 * Opt-in on-device engine wrapping the browser `LanguageDetector` API (Chrome
 * 138+/Edge). Lives behind the `langtell/chrome-ai` subpath; never pulled into
 * the core.
 *
 * Scaffold — availability gating and the real `LanguageDetector` wrapper land in
 * a later step. Reports unavailable for now.
 */
export const chromeAiEngine: AsyncSource = {
  id: "chrome-ai",
  sync: false,
  inputs: ["text"],
  isAvailable: () => false,
  detect(): Promise<LanguageEvidence[]> {
    return Promise.resolve([]);
  },
};
