---
"langtell": minor
---

New `evidenceFromNodeLang` producer: per-node declared-language attributes (e.g. Google's `data-rl` response-language label, or a subtree `lang` attribute) become `node-lang` context evidence — the `<html lang>` declaration concept, one scope down. Which attributes count is the caller's choice (pass extracted values keyed by attribute name; the module stays DOM-free), and each item's `source` is the attribute name so `fuse` weights can target a specific attribute (`"data-rl"`) rather than the whole kind. Default kind weight 0.65: a declaration decides when text evidence is weak or absent, and loses to a confident text read via the existing context-never-overrides-clear-script guard.
