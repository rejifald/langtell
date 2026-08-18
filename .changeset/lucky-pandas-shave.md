---
"langtell": minor
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

New on `langtell/classify`: `contradictionShare(text, profile)` and
`CONTRADICTION_SHARE`, so a caller explaining a verdict shows the number the
veto acted on rather than deriving a second, drifting copy.

Also drops 23 Russian words (`это`, `ты`, `который`, …) that OpenSubtitles'
Ukrainian content set had bled into `uk.words.frequent`. Each is spelled with a
letter Ukrainian does not have, so it was never evidence for Ukrainian — but by
sitting in both lists it cancelled the same word in Russian's, disarming a
marker `ru` genuinely owns. `profiles.test.ts` now pins the invariant for every
shipped list.
