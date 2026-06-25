---
"langtell": minor
---

Make `nonDiscriminatingScript: "unknown"` script-aware: context written in a
different script than the title can no longer name the title's language.

Previously, when a non-discriminating script read was dropped under `"unknown"`
mode (e.g. a Latin title against a `[uk, en]` roster), surrounding page/transport
context could still win — so a Latin title on a `lang="uk"` page resolved to `uk`.
A foreign-script title's language is not the page's language.

Now, when resolving such a title, the fuser derives the title's script from the
candidate roster's alphabets and ignores context evidence whose language is in a
different script. Same-script context (an explicit `Content-Language: en` for a
Latin title, or a `de` page locale among the same-script candidates `[en, de]`)
may still name or disambiguate the title; cross-script context cannot. With
nothing valid remaining, the verdict is `unknown`.

The cut needs `candidates` to map each language to its script. When `candidates`
is absent the scripts can't be derived, so behavior falls back to the previous
0.3.0 mode (it does not throw). The default mode (option unset / `"candidate"`)
is unchanged.
