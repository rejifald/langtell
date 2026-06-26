---
"langtell": minor
---

BCP-47 normalization options and classifier scoping seams

- `normalizeBCP47` gains an optional `{ unknownHead: "subtag" | "null" }` argument. The default (`"subtag"`) is unchanged — an unknown primary subtag still passes through (`pt-BR` → `pt`). Pass `"null"` to return `null` for any tag whose head isn't in the alias table, for callers that gate on a fixed alias set and read `null` as "not a language I handle". The new `NormalizeBCP47Options` type is exported from the root.
- The alias table gains the Ukrainian exonym phrases for Polish, German, French, Spanish, and Italian (`польська мова`/`по-польськи`, `німецька мова`/`по-німецьки`, `французька мова`/`по-французьки`, `іспанська мова`/`по-іспанськи`, `італійська мова`/`по-італійськи`), bringing them to parity with the existing uk/ru entries.
- `langtell/classify` now also exports `scopeCandidates` and `RUNG3_MIN_LENGTH`, so a caller injecting a rung-3 resolver can scope its own (unscoped) candidates and honor the trigram length floor consistently with the classifier rather than re-deriving them.
