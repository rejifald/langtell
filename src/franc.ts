import type { AsyncSource, LanguageEvidence } from "./types.js";

/**
 * Opt-in franc engine. Lives behind the `langtell/franc` subpath so franc's
 * trigram tables never enter the core bundle.
 *
 * Scaffold — the real `franc` integration (declared as an optional peer
 * dependency) lands in a later step. Returns no evidence yet.
 */
export const francEngine: AsyncSource = {
  id: "franc",
  sync: false,
  inputs: ["text"],
  detect(): Promise<LanguageEvidence[]> {
    return Promise.resolve([]);
  },
};
