---
"langtell": minor
---

Add `langtell/cyrillic` — a roster-free Cyrillic language fast-path

A new opt-in subpath exposing `detectCyrillicLanguage(text)` plus the `isRussian` / `isUkrainian` convenience predicates: a fixed, zero-config discriminator for the four Cyrillic languages langtell profiles (Ukrainian, Russian, Belarusian, Bulgarian), decided purely by distinctive letters — no candidate roster, no tokenization, no franc. It complements `classifyBySnippet` (`langtell/classify`), which scores relative to a roster you pass in; reach for `langtell/cyrillic` when you just need "is this Russian / is this Ukrainian?" on a hot path. Zero-dependency and side-effect-free.
