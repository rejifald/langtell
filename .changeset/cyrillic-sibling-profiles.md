---
"langtell": minor
---

Add Cyrillic-sibling language profiles: **sr** (Serbian, Cyrillic), **mk**
(Macedonian), and **kk** (Kazakh, Cyrillic).

- `langtell/profiles` now ships `sr`, `mk`, and `kk` profiles (alphabet,
  curated `words.function`, `words.frequent`, and `iso6393` `srp`/`mkd`/`kaz`),
  wired into the `PROFILES` registry, `PROFILED_CODES`, and the named exports.
  These let `classifyBySnippet`/`compile` discriminate Serbian, Macedonian, and
  Kazakh within a Cyrillic roster.
  - `mk` frequent words are corpus-derived from hermitdave/FrequencyWords
    (OpenSubtitles, `mk_50k.txt`). `kk` frequent words come from the smaller
    `kk_full.txt` (no curated 50k exists), filtered of subtitle proper nouns.
    `sr` uses a hand-curated Cyrillic content-word fallback because
    FrequencyWords Serbian is Latin-script only — flagged for native review.
- `langtell/cyrillic`: the roster-free fast-path no longer mislabels Serbian,
  Macedonian, or Kazakh as Russian. Text carrying letters distinctive to
  sr/mk/kk (ђ ћ џ ѓ ќ ѕ љ њ ј, or the Kazakh Turkic set ә ғ қ ң ө ұ ү һ) now
  returns `"unknown"` so the snippet escalates to the classifier instead of
  falling through to the Russian default. The fast-path still only _positively_
  detects uk/ru/be/bg; `CyrillicVerdict` is unchanged.
