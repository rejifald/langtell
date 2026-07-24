---
"langtell": patch
---

Duck-type `Headers` detection on `.get` instead of `instanceof Headers`, so non-global `Headers` implementations (node-fetch, cross-fetch, jsdom/worker realms, test doubles) are no longer silently dropped.
