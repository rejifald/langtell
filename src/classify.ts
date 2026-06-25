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
 */
export { classifyBySnippet, FRANC_RUNG } from "./internal/classify.js";
export type { Rung, Rung3Resolver, RungVerdict, SnippetVerdict } from "./internal/classify.js";
