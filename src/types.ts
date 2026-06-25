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
}

/** The verdict: the winning language, a confidence, and the evidence behind it. */
export interface Classification {
  /** A language code, or the sentinel `"unknown"`. */
  language: LanguageCode;
  confidence: number;
  evidence: LanguageEvidence[];
}

/** A candidate language, used by the text engines for roster-relative scoring. */
export interface LanguageProfile {
  code: LanguageCode;
  /** Lowercased alphabet. */
  alphabet: string;
  /** Characters distinctive to this language within a roster (optional hint). */
  distinctive?: string;
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

export interface EarlyExit {
  /** Stop running further (cheaper-first) sources once confidence clears this. */
  minConfidence: number;
}

export interface DetectorConfig<E extends readonly EvidenceSource[] = []> {
  candidates?: readonly LanguageProfile[];
  engines?: E;
  weights?: Weights;
  earlyExit?: EarlyExit;
}

/** The compiled detector. Synchronous when every source is sync; `Promise`-typed
 *  the moment an async engine is registered — so callers never guess `await`. */
export type DetectFn<E extends readonly EvidenceSource[]> =
  HasAsync<E> extends true
    ? (input: DetectInput, ctx?: DetectContext) => Promise<Classification>
    : (input: DetectInput) => Classification;
