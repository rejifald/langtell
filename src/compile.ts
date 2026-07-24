import { evidenceFromHeaders } from "./headers.js";
import { evidenceFromHtml } from "./html.js";
import { DEFAULT_NODE_LANG_ATTRIBUTES, evidenceFromNodeLang } from "./node-lang.js";
import { evidenceFromText } from "./text.js";
import { fuse, type FuseOptions } from "./fuse.js";
import type {
  AsyncSource,
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
 *  abstains when no roster was supplied — its signals need candidates). The
 *  node-lang producer is bound to the configured declaration-attribute list
 *  (standard `lang` only, unless the config opts into vendor attributes), and
 *  reads them from `input.attrs` in configured order. */
function builtIns(
  candidates: readonly LanguageProfile[] | undefined,
  nodeLangAttributes: readonly string[],
): SyncSource[] {
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
    {
      id: "node-lang",
      sync: true,
      inputs: ["attrs"],
      detect: (i) => {
        const declared: Record<string, string | null | undefined> = {};
        for (const name of nodeLangAttributes) declared[name] = i.attrs?.[name];
        return evidenceFromNodeLang(declared);
      },
    },
  ];
}

/** Run a source only when every input it declares is present. */
function applicable(source: EvidenceSource, input: DetectInput): boolean {
  return source.inputs.every((key) => input[key] !== undefined);
}

/** Run one sync source.
 *
 *  `contained` marks code the library does not own — the opt-in engines from
 *  `config.engines`. Those are optional by construction, so a throw there costs
 *  only their evidence: the detection still returns the verdict the remaining
 *  sources support. The built-in producers are deliberately *not* contained: a
 *  throw in `text`/`html`/`headers`/`node-lang` is a bug in langtell, and
 *  swallowing it would launder that bug into a silently thinner verdict. */
function runSync(source: SyncSource, input: DetectInput, contained: boolean): LanguageEvidence[] {
  if (!contained) return source.detect(input);
  try {
    return source.detect(input);
  } catch {
    return [];
  }
}

/** Run one async source behind its isolation boundary. Containment is
 *  unconditional here: every async source is a registered engine, since the
 *  built-in producers are all sync.
 *
 *  Everything the engine controls happens *inside* the `try` — the optional
 *  {@link AsyncSource.isAvailable} gate (an engine that says no is skipped
 *  entirely, so chrome-ai's "never trigger a model download" contract holds no
 *  matter who drives it) and the `detect()` call itself. Calling `detect` inside
 *  the boundary is what contains an engine that throws *synchronously*: a plain
 *  (non-`async`) function returning a promise satisfies `AsyncSource.detect`,
 *  and `Promise.resolve(source.detect(...)).catch(...)` evaluates the call
 *  before any guard exists. */
async function runAsync(
  source: AsyncSource,
  input: DetectInput,
  ctx: DetectContext,
): Promise<LanguageEvidence[]> {
  try {
    if (source.isAvailable && !(await source.isAvailable())) return [];
    return await source.detect(input, ctx);
  } catch {
    return [];
  }
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
  const producers = builtIns(
    config.candidates,
    config.nodeLangAttributes ?? DEFAULT_NODE_LANG_ATTRIBUTES,
  );
  const sources: EvidenceSource[] = [...producers, ...(config.engines ?? [])];
  /** Everything from here on is an opt-in engine — code the library does not
   *  own, so its faults are contained. See {@link runSync}. */
  const firstEngine = producers.length;
  const hasAsync = sources.some((source) => !source.sync);
  const earlyExit = config.earlyExit;
  const fuseOptions: FuseOptions = {
    weights: config.weights,
    candidates: config.candidates,
    nonDiscriminatingScript: config.nonDiscriminatingScript,
  };

  if (!hasAsync) {
    const detect = (input: DetectInput): Classification => {
      const evidence: LanguageEvidence[] = [];
      for (const [i, source] of sources.entries()) {
        if (!source.sync || !applicable(source, input)) continue;
        evidence.push(...runSync(source, input, i >= firstEngine));
        if (!earlyExit) continue;
        const soFar = fuse(evidence, fuseOptions);
        if (soFar.confidence >= earlyExit.minConfidence) return soFar;
      }
      return fuse(evidence, fuseOptions);
    };
    return detect as DetectFn<E>;
  }

  const detect = async (input: DetectInput, ctx: DetectContext = {}): Promise<Classification> => {
    // Abort is checked before every dispatch and after every await: an aborted
    // detection rejects with the signal's reason (web-standard
    // `AbortSignal.throwIfAborted()` semantics) rather than resolving with a
    // verdict that silently skipped sources.
    const signal = ctx.signal;
    const evidence: LanguageEvidence[] = [];
    // Default mode: every async source is started here and they are awaited
    // together, so registering N engines costs one round of latency, not N.
    // `earlyExit` opts out of that — it awaits each source in turn (`sources` is
    // in registration order, cheaper-first) so it can stop before reaching the
    // expensive ones; you cannot decline to start a source you already started.
    // `pending` stays empty in that mode.
    const pending: Promise<LanguageEvidence[]>[] = [];
    for (const [i, source] of sources.entries()) {
      signal?.throwIfAborted();
      if (!applicable(source, input)) continue;
      if (source.sync) evidence.push(...runSync(source, input, i >= firstEngine));
      else if (earlyExit) evidence.push(...(await runAsync(source, input, ctx)));
      else pending.push(runAsync(source, input, ctx));
      if (!earlyExit) continue;
      signal?.throwIfAborted();
      const soFar = fuse(evidence, fuseOptions);
      if (soFar.confidence >= earlyExit.minConfidence) return soFar;
    }
    for (const batch of await Promise.all(pending)) evidence.push(...batch);
    signal?.throwIfAborted();
    return fuse(evidence, fuseOptions);
  };
  return detect as DetectFn<E>;
}
