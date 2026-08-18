/**
 * `langtell/classify` — the structured, opt-in snippet verdict.
 *
 * The high-level {@link Classification} from `compile`/`detect`/`fuse`
 * (`language`, `confidence`, `evidence[]`) stays the default surface and is
 * unchanged by this entry. This subpath exposes the layer *beneath* it: the
 * candidate-relative ladder classifier's raw {@link SnippetVerdict} — which
 * {@link Rung} decided (distinctive letters → function words → frequent words →
 * an optional trigram backstop) and the integer `margin` (the winner's lead over
 * the runner-up). A single `confidence` float can reconstruct neither, so the
 * power-user cases that need them — per-rung safety gates, diagnostics,
 * labeling — reach for this door while the common path keeps a narrow interface.
 *
 * Zero-dependency and franc-free: scoring is relative to the candidate roster
 * you pass in, so nothing here pulls profile data or franc's trigram tables. The
 * optional `rung3` resolver is an injected seam for callers who DO have franc
 * available (see `langtell/franc`); without it the classifier simply stops at
 * the word rungs. Pair this with {@link hasProfile}/`PROFILED_CODES` from
 * `langtell/profiles` to build a roster of codes that will actually classify.
 *
 * Both {@link classifyBySnippet} and {@link Rung3Resolver} are generic over the
 * concrete profile type, inferred from the `candidates` you pass. A consumer
 * with a stricter profile (e.g. `words` required) can hand its own resolver
 * straight to `classifyBySnippet` with no adapter — the generic defaults to
 * {@link LanguageProfile}, so the bare form is unchanged.
 *
 * The ladder answers a forced choice, so it carries one veto: a winner whose own
 * alphabet cannot account for {@link CONTRADICTION_SHARE} of the text loses to
 * `"unknown"` rather than speaking for a language that is not on the roster. The
 * measurement behind it is exported too, for callers that have to explain a
 * verdict instead of only acting on it: {@link textAlphabet} derives the letters
 * a text actually uses (its quotations and URLs left out, being someone else's
 * words and nobody's words respectively), and {@link contradictionOf} asks one
 * candidate to account for them — the letters it cannot, and their weight.
 * {@link contradiction} is the one-text convenience over both.
 *
 * For callers building a rung-3 resolver that ALSO runs its backstop off-path
 * (e.g. an oracle over raw, unscoped candidates), two helpers from the same
 * machinery are exposed so that scoping stays consistent with the classifier
 * rather than re-derived: {@link scopeCandidates} narrows a roster to the text's
 * dominant script exactly as `classifyBySnippet` does internally, and
 * {@link RUNG3_MIN_LENGTH} is the length floor below which a trigram verdict is
 * too noisy to trust.
 */
export {
  classifyBySnippet,
  contradiction,
  CONTRADICTION_SHARE,
  contradictionOf,
  FRANC_RUNG,
  RUNG3_MIN_LENGTH,
  scopeCandidates,
  textAlphabet,
} from "./internal/classify.js";
export type {
  Contradiction,
  Rung,
  Rung3Resolver,
  RungVerdict,
  SnippetVerdict,
  TextAlphabet,
} from "./internal/classify.js";
