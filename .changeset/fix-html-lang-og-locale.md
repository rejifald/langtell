---
"langtell": patch
---

Fix `<html lang>` and `og:locale` extraction in `evidenceFromHtml`: `\b` no longer lets `xml:lang=`/`data-lang=` masquerade as `lang=`, greedy matching no longer settles on the wrong (last) attribute, and `og:locale:alternate` (the page's OTHER locales) is no longer misread as `og:locale`.
