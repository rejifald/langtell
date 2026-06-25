/** A BCP-47 language code (e.g. `"uk"`, `"en"`, `"pt-BR"`). `"unknown"` is a
 *  sentinel value used in results, not a code. */
export type LanguageCode = string;

export type EvidenceKind =
  | "title-script"
  | "html-lang"
  | "meta-content-language"
  | "meta-og-locale"
  | "http-content-language"
  | "source-prior"
  | "franc"
  | "chrome-ai"
  | "explicit-locale";

/** One signal contributing to a classification, kept for the audit trail. */
export interface LanguageEvidence {
  kind: EvidenceKind;
  /** A language code, or the sentinel `"unknown"`. */
  language: LanguageCode;
  /** 0..1. */
  confidence: number;
  /** Producer/engine id (e.g. `"title-script"`, `"franc"`). Weights may key on this. */
  source: string;
  /** The raw signal value, for debugging the verdict. */
  value: string;
  /** Set to `false` on a script read whose winning script is owned by ≤1 roster
   *  candidate — the script alone selected the language (a lone-candidate
   *  default), not the distinctive-letter/word machinery, so the read carries no
   *  evidence that the text is *distinctively* that language. Omitted (treated as
   *  discriminating) when ≥2 same-script candidates were in play. Consumed by
   *  {@link fuse}'s `nonDiscriminatingScript` option; otherwise informational. */
  discriminating?: boolean;
}

/** The verdict: the winning language, a confidence, and the evidence behind it. */
export interface Classification {
  /** A language code, or the sentinel `"unknown"`. */
  language: LanguageCode;
  confidence: number;
  evidence: LanguageEvidence[];
}

/** A candidate language, used by the text engines for roster-relative scoring.
 *
 * Distinctiveness is computed at runtime relative to the active candidate set —
 * the fields below are raw inputs, never pre-differenced. A minimal profile
 * (`{ code, alphabet }`) works; the word lists and `iso6393` sharpen accuracy. */
export interface LanguageProfile {
  code: LanguageCode;
  /** Lowercased alphabet. Rung 1 of the classifier. Raw — never pre-differenced. */
  alphabet: string;
  /** Orthographic marks that count as rung-1 evidence but are not alphabet
   *  letters — e.g. the intra-word apostrophe Ukrainian/Belarusian use where
   *  Russian uses a hard sign or nothing. Merged into the rung-1 character set;
   *  distinctiveness stays candidate-relative, so a mark shared by ≥2 candidates
   *  cancels out. Optional. */
  marks?: string;
  /** Curated lexical markers, split into two tiers (rungs 2a/2b). Optional — a
   *  profile with only an `alphabet` still classifies on distinctive letters. */
  words?: {
    /** Grammatical markers (conjunctions, prepositions, pronouns, particles),
     *  hand-auditable. Highest-precision word tier. */
    function: readonly string[];
    /** Corpus-frequent content words. Lower-precision backstop. */
    frequent: readonly string[];
  };
  /** ISO 639-3 code, used to scope the optional franc engine's `only`
   *  restriction. Omit to skip franc for this profile. */
  iso6393?: string;
}

export type HeaderBag = Headers | Record<string, string | string[] | undefined | null>;

export interface DetectInput {
  text?: string;
  html?: string;
  headers?: HeaderBag;
}

export interface DetectContext {
  signal?: AbortSignal;
  maxChars?: number;
}

export type SourceInput = "text" | "html" | "headers";

/** A synchronous, dependency-free evidence source (script, HTML tags, headers). */
export interface SyncSource {
  readonly id: string;
  readonly sync: true;
  readonly inputs: readonly SourceInput[];
  detect(input: DetectInput): LanguageEvidence[];
}

/** A possibly-expensive, asynchronous engine (franc bridge, on-device model). */
export interface AsyncSource {
  readonly id: string;
  readonly sync: false;
  readonly inputs: readonly SourceInput[];
  isAvailable?(): boolean | Promise<boolean>;
  detect(input: DetectInput, ctx: DetectContext): Promise<LanguageEvidence[]>;
}

export type EvidenceSource = SyncSource | AsyncSource;

/** `true` iff the engine tuple contains any async source. Drives {@link DetectFn}. */
export type HasAsync<E extends readonly EvidenceSource[]> =
  Extract<E[number], AsyncSource> extends never ? false : true;

/** Weights keyed by evidence `source` id or `kind`; missing keys use defaults. */
export type Weights = Partial<Record<string, number>>;

/** How {@link fuse} resolves a *non-discriminating* script read — one whose
 *  winning script is owned by ≤1 roster candidate, so the script alone (not the
 *  distinctive-signal machinery) picked the language:
 *
 *  - `"candidate"` (default) keeps the lone candidate, preserving today's
 *    behavior: a closed roster where the script is taken to imply the language.
 *  - `"unknown"` drops such a read from the verdict *unless* non-script evidence
 *    (a page tag, a `Content-Language` header) corroborates the same language —
 *    the conservative "name a language only on real evidence" policy. In a
 *    `[uk, en]` roster a Latin-only title then resolves to `unknown`, while a
 *    Latin title plus an explicit `en` `Content-Language` stays `en`. */
export type NonDiscriminatingScript = "candidate" | "unknown";

export interface EarlyExit {
  /** Stop running further (cheaper-first) sources once confidence clears this. */
  minConfidence: number;
}

export interface DetectorConfig<E extends readonly EvidenceSource[] = []> {
  candidates?: readonly LanguageProfile[];
  engines?: E;
  weights?: Weights;
  earlyExit?: EarlyExit;
  /** Forwarded to {@link fuse}. See {@link NonDiscriminatingScript}. Defaults to
   *  `"candidate"` (current behavior); opt into `"unknown"` for a roster-closed,
   *  evidence-only policy. */
  nonDiscriminatingScript?: NonDiscriminatingScript;
}

/** The compiled detector. Synchronous when every source is sync; `Promise`-typed
 *  the moment an async engine is registered — so callers never guess `await`. */
export type DetectFn<E extends readonly EvidenceSource[]> =
  HasAsync<E> extends true
    ? (input: DetectInput, ctx?: DetectContext) => Promise<Classification>
    : (input: DetectInput) => Classification;
