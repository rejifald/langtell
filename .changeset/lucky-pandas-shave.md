---
"langtell": patch
---

Withdraw a verdict the text itself contradicts, in both detectors.

The rung ladder counts what each candidate uniquely **owns**, which can only
argue _for_ a candidate — leaving a closed set defenceless against text written
in a language it does not carry. Belarusian handed to `{uk, ru}` spent its `і`s
electing Ukrainian while `ы`, `ў` and `э` — letters Ukrainian does not have at
all — counted for nobody and stopped nothing.

Both `classifyBySnippet` and the roster-free `detectCyrillicLanguage` fast-path
now check the winner against the text one last time: a candidate whose own
alphabet cannot account for 2 % of the letters (`CONTRADICTION_SHARE`) loses to
`"unknown"`. The runner-up is not promoted — a set that cannot account for the
text does not get a second guess at it. Widening the roster (adding `be`) makes
the same snippets resolve.

The threshold is measured, not picked: an in-language snippet quoting a sibling
runs 0.3–0.9 %, a borrowed proper noun 1.4–1.5 %, and genuinely other-language
text 2.3–17 %.

Quotations are not held against the author who quoted them. They are scrubbed
before the measurement alongside URLs and @handles — a Ukrainian article quoting
a Russian sentence is still Ukrainian — unless the quotation IS the text (half
the letters or more: a pull-quote, a headline in guillemets), in which case it is
the content and is measured like any other. Paired double marks only (`«» "" “”
„“`), never the single forms that uk/be spell words with. The rung tallies still
read the text whole; only the veto's measurement excludes quotations.

New on `langtell/classify`: `textAlphabet(text)` derives the letters a text
actually uses, once, and `contradictionOf(alphabet, profile)` asks one candidate
to account for them — returning the letters it cannot and their weight. A report
over a roster is then one pass plus a set lookup per candidate, on the same
derivation the verdict used. `contradiction(text, profile)` is the one-text
convenience; `CONTRADICTION_SHARE` is the threshold itself.

The core bundle budget moves 3.25 kB → 3.35 kB: the veto and the derivation are
reachable from `compile`, and 29 B of brotli is what they cost there.

Also drops 23 Russian words (`это`, `ты`, `который`, …) that OpenSubtitles'
Ukrainian content set had bled into `uk.words.frequent`. Each is spelled with a
letter Ukrainian does not have, so it was never evidence for Ukrainian — but by
sitting in both lists it cancelled the same word in Russian's, disarming a
marker `ru` genuinely owns. `profiles.test.ts` now pins the invariant for every
shipped list.
