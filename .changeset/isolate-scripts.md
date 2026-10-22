---
"langtell": minor
---

Add an opt-in `isolateScripts` option that judges each script in a mixed-script snippet on its own evidence.

- `classifyBySnippet(text, candidates, rung3, { isolateScripts: true })`: when the dominant script holds a lone candidate, a minority script with ≥2 candidates and at least `MINORITY_MIN_LETTERS` (8) letters is classified on its own with rungs 1–2. «Самые дешевые в Украине | Victron Multiplus II 48V 6k5va» now reads `ru` instead of `en`.
- The rung-3 resolver receives only the scope's own script (new export `textInScope`). A 20-character Ukrainian name inside an English sentence no longer clears a 24-character trigram floor on the strength of the English around it.
- `compile({ isolateScripts })` forwards the option to the built-in text producer, and `createFrancEngine(candidates, { isolateScripts })` / `evidenceFromFranc(text, candidates, { isolateScripts })` apply the same span and floor.

Off by default. Behaviour without the option is unchanged.
