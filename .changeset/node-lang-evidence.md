---
"langtell": minor
---

Per-node declared language joins the pipeline. `DetectInput` gains `attrs` — the detection subject's own attributes — and a fourth always-on producer turns them into `node-lang` context evidence, the `<html lang>` declaration concept one scope down. By default only the standardized global `lang` attribute counts; vendor conventions (e.g. Google's `data-rl` response-language label) are compile-time opt-ins via `DetectorConfig.nodeLangAttributes`. Evidence sources are namespaced (`node-lang:data-rl`) so fuse weights can target one attribute without colliding with engine ids. Semantics come from the existing fusion guard: a declaration decides when text evidence is weak or absent, and loses to a confident text read — a mislabeled node can't override what the classifier actually read. The low-level `evidenceFromNodeLang` producer and `DEFAULT_NODE_LANG_ATTRIBUTES` are exported for callers composing `fuse` directly.
