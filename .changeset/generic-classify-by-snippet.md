---
"langtell": patch
---

Make `classifyBySnippet` and `Rung3Resolver` generic over the concrete profile
type (`langtell/classify`).

`classifyBySnippet<P extends LanguageProfile = LanguageProfile>(text, candidates, rung3?)`
now infers `P` from `candidates`, and `Rung3Resolver<P extends LanguageProfile = LanguageProfile>`
is typed over the same `P`. A consumer that defines a stricter profile (e.g.
`words` required) can hand its own `rung3` resolver straight to
`classifyBySnippet` with no adapter and no `as` — previously the stricter
resolver was rejected against the `words`-optional base type because parameter
positions are contravariant.

Types-only and non-breaking: the generic defaults to `LanguageProfile`, so the
bare two-argument form, the base `Rung3Resolver`, and every existing call site
type-check and behave exactly as before. Runtime behavior is unchanged.
