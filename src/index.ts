export { compile } from "./compile.js";
export { fuse } from "./fuse.js";
export type { FuseOptions } from "./fuse.js";
export { evidenceFromText } from "./text.js";
export { evidenceFromHtml } from "./html.js";
export { evidenceFromHeaders } from "./headers.js";
export { normalizeBCP47, normalizeLanguageCode, primarySubtag } from "./internal/bcp47.js";
export type { NormalizeBCP47Options } from "./internal/bcp47.js";
export type {
  AsyncSource,
  Classification,
  DetectContext,
  DetectFn,
  DetectInput,
  DetectorConfig,
  EarlyExit,
  EvidenceKind,
  EvidenceSource,
  HasAsync,
  HeaderBag,
  LanguageCode,
  LanguageEvidence,
  LanguageProfile,
  NonDiscriminatingScript,
  SourceInput,
  SyncSource,
  Weights,
} from "./types.js";
