---
"langtell": minor
---

Expose the structured snippet verdict through a new opt-in `langtell/classify` entry.

The candidate-relative ladder classifier already computes a richer verdict than the
default `Classification` surfaces — which rung decided (distinctive letters →
function words → frequent words → optional trigram backstop) and the integer
`margin` (the winner's lead over the runner-up). A single `confidence` float can
reconstruct neither. That structure is now exported, behind its own door, for the
power-user cases that need it: per-rung safety gates and diagnostics/labeling.

- New subpath `langtell/classify` exports `classifyBySnippet(text, candidates, rung3?)`
  and `FRANC_RUNG`, plus the types `SnippetVerdict` (`{ language, margin, rung, discriminating }`),
  `Rung`, `RungVerdict`, and `Rung3Resolver`. Zero-dependency and franc-free — scoring
  is relative to the roster you pass in, so nothing here pulls profile data or franc's
  tables (enforced by the same ESLint boundary as the rest of the core).
- `langtell/profiles` adds `PROFILED_CODES` (the BCP-47 codes that ship a profile) and
  `hasProfile(code)`, so callers can narrow a roster to codes that will actually classify.

Purely additive: the high-level `compile`/`detect`/`fuse` output (`language`,
`confidence`, `evidence[]`) is unchanged. The default interface stays narrow; the
rung/margin verdict is opt-in only.
