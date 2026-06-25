import { evidenceFromHeaders } from "./headers.js";
import { evidenceFromHtml } from "./html.js";
import { evidenceFromText } from "./text.js";
import { fuse, type FuseOptions } from "./fuse.js";
import type {
  Classification,
  DetectContext,
  DetectFn,
  DetectInput,
  DetectorConfig,
  EvidenceSource,
  LanguageEvidence,
  LanguageProfile,
  SyncSource,
} from "./types.js";

/** The always-on, zero-dependency producers. The text producer is bound to the
 *  configured candidate roster so its scoring is roster-relative (and so it
 *  abstains when no roster was supplied — its signals need candidates). */
function builtIns(candidates: readonly LanguageProfile[] | undefined): SyncSource[] {
  return [
    {
      id: "text",
      sync: true,
      inputs: ["text"],
      detect: (i) => evidenceFromText(i.text, candidates),
    },
    { id: "html", sync: true, inputs: ["html"], detect: (i) => evidenceFromHtml(i.html) },
    {
      id: "headers",
      sync: true,
      inputs: ["headers"],
      detect: (i) => evidenceFromHeaders(i.headers),
    },
  ];
}

/** Run a source only when every input it declares is present. */
function applicable(source: EvidenceSource, input: DetectInput): boolean {
  return source.inputs.every((key) => input[key] !== undefined);
}

/**
 * Build a configured detector. Does the per-roster setup once and returns a
 * `detect` function whose sync/async shape is fixed by the registered engines
 * (see {@link DetectFn}). The built-in producers are always registered; opt-in
 * engines (franc, chrome-ai) are added via `config.engines`.
 */
export function compile<const E extends readonly EvidenceSource[] = []>(
  config: DetectorConfig<E> = {},
): DetectFn<E> {
  const sources: EvidenceSource[] = [...builtIns(config.candidates), ...(config.engines ?? [])];
  const hasAsync = sources.some((source) => !source.sync);
  const fuseOptions: FuseOptions = {
    weights: config.weights,
    candidates: config.candidates,
    nonDiscriminatingScript: config.nonDiscriminatingScript,
  };

  if (!hasAsync) {
    const detect = (input: DetectInput): Classification => {
      const evidence: LanguageEvidence[] = [];
      for (const source of sources) {
        if (source.sync && applicable(source, input)) evidence.push(...source.detect(input));
      }
      return fuse(evidence, fuseOptions);
    };
    return detect as DetectFn<E>;
  }

  const detect = async (input: DetectInput, ctx: DetectContext = {}): Promise<Classification> => {
    const evidence: LanguageEvidence[] = [];
    const pending: Promise<LanguageEvidence[]>[] = [];
    for (const source of sources) {
      if (!applicable(source, input)) continue;
      if (source.sync) evidence.push(...source.detect(input));
      else pending.push(Promise.resolve(source.detect(input, ctx)).catch(() => []));
    }
    for (const batch of await Promise.all(pending)) evidence.push(...batch);
    return fuse(evidence, fuseOptions);
  };
  return detect as DetectFn<E>;
}
