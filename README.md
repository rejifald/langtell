# langtell

> Tell me the language.

`langtell` infers the language of short strings — titles, snippets, headlines —
by **fusing evidence from many signals** into a single weighted verdict with a
confidence score and an auditable trail. It reads the _tells_: the script and
distinctive letters of the text, the `<html lang>` / `og:locale` / meta tags of
the page it came from, the HTTP `Content-Language` header, and — optionally —
heavier statistical engines like [franc](https://github.com/wooorm/franc) or the
on-device Chrome AI language detector.

It is **not** another trigram detector competing with franc/cld3/tinyld. Those
answer _"what language is this body of text?"_ from the characters alone.
`langtell` answers _"what language is this **title**, given the page, transport,
and source it arrived in?"_ — and shows its work.

> **Status:** early. The core detector (candidate-relative script/letter
> scoring, the BCP-47-aware fuser with the context-vs-script guard, and the
> opt-in franc and Chrome AI engines) is implemented and tested. The API below
> reflects the committed design.

## Why

- **Short strings beat statistical detectors.** A two-word title gives franc too
  little to chew on. `langtell` leans on script ranges, distinctive letters, and
  out-of-band metadata that a pure text detector never sees.
- **Auditable, not magic.** Every verdict carries the list of signals that
  produced it (`evidence[]`), each with its kind, language, confidence, and raw
  value — so you can debug _why_ a title was classified the way it was.
- **Pay only for what you use.** The zero-dependency core (script + HTML + header
  signals) is fully synchronous. Heavy engines (franc's trigram tables, the
  browser detector) live behind their own subpaths and only enter your bundle —
  and only run — when you opt in.

## Quick start

```ts
import { compile } from "langtell";
import { uk, ru, en } from "langtell/profiles"; // ready-made roster data

// compile() does the per-roster setup once; call the returned fn many times.
const detect = compile({ candidates: [uk, ru, en] });

const result = detect({
  text: "Їжак Сонік",
  html, // optional: <html lang>, og:locale, meta content-language
  responseHeaders, // optional: HTTP Content-Language
});
// → { language: "uk", confidence: 0.9x, evidence: [{ kind: "title-script", ... }, ...] }
```

Add the franc engine — it stays behind its own import door so its trigram tables
never reach a bundle that doesn't use it. franc runs in-process and
synchronously, so `detect` stays synchronous:

```ts
import { compile } from "langtell";
import { uk, ru, en } from "langtell/profiles";
import { createFrancEngine } from "langtell/franc";

const candidates = [uk, ru, en];
const detect = compile({ candidates, engines: [createFrancEngine(candidates)] });
const result = detect({ text, html, responseHeaders });
```

Register the on-device Chrome AI engine and the return type becomes `Promise`
automatically, because that engine is async:

```ts
import { compile } from "langtell";
import { uk, ru, en } from "langtell/profiles";
import { chromeAiEngine } from "langtell/chrome-ai";

const detect = compile({ candidates: [uk, ru, en], engines: [chromeAiEngine] });
const result = await detect({ text }); // Promise<Classification>
```

Need more than "what language + how sure"? The default `Classification` collapses
the candidate-relative ladder into one `confidence` float. When you need the raw
structure — _which_ rung decided (distinctive letters → function words → frequent
words → optional trigram backstop) and the integer **margin** (the winner's lead
over the runner-up) — reach for the opt-in `langtell/classify` door. It stays
zero-dependency and franc-free; scoring is relative to the roster you pass in.

```ts
import { classifyBySnippet } from "langtell/classify";
import { uk, ru } from "langtell/profiles";

classifyBySnippet("Слава Україні", [uk, ru]);
// → { language: "uk", margin: 2, rung: 1, discriminating: true }  (a distinctive letter)
classifyBySnippet("Кофе и чай", [uk, ru]);
// → { language: "ru", margin: 1, rung: "2a", … }                  (a function-word marker)
```

This powers per-rung safety gates ("act only when a _weak_ rung clears a high
margin") and diagnostics — uses a single confidence number can't serve. The
high-level `compile`/`detect`/`fuse` output is unchanged; this is purely additive.

#### A closed set says "unknown" rather than the nearest thing it has

The ladder counts what each candidate uniquely _owns_, which can only ever argue
_for_ someone — so on its own it has no answer to text written in a language the
roster does not carry. Belarusian handed to `{uk, ru}` spends its `і`s electing
Ukrainian, while `ы`, `ў` and `э` — letters Ukrainian does not have at all —
count for nobody and stop nothing.

So a winner is checked against the text one last time: a candidate whose own
alphabet cannot account for **2 %** of the letters (`CONTRADICTION_SHARE`) loses
to `"unknown"`, and the runner-up is not promoted in its place.

```ts
classifyBySnippet("Мова і культура Беларусі маюць багатую гісторыю", [uk, ru]);
// → { language: "unknown", … }   `ы` is not a letter Ukrainian has
classifyBySnippet("Мова і культура Беларусі маюць багатую гісторыю", [uk, ru, be]);
// → { language: "be", … }        widen the roster and the text stops arguing
```

The measurement is exported too, for callers that have to _explain_ a verdict
rather than only act on it. Derive the text's own alphabet once, then ask each
candidate to account for it:

```ts
import { textAlphabet, contradictionOf, contradiction } from "langtell/classify";

const alphabet = textAlphabet("Беларусь — гэта краіна ў цэнтры Еўропы");
contradictionOf(alphabet, uk); // → { letters: ["ў"], share: 0.116 }
contradictionOf(alphabet, be); // → { letters: [],    share: 0 }

contradiction("Слава Україні", uk); // → { letters: [], share: 0 }  one-text form
```

**Quotations belong to whoever said them.** They are scrubbed before the
measurement, alongside URLs and @handles — a Ukrainian article quoting a Russian
sentence is still a Ukrainian article, and the Russian letters inside the marks
are evidence about the person being quoted, not the person writing. Unless the
quotation _is_ the text: at half the letters or more (a pull-quote, a headline in
guillemets) it is the content, and it is measured like any other. Only paired
double marks count — `«» "" “” „“` — never the single forms, which uk/be spell
words with (`комп'ютер`).

What the threshold is left to survive is the other kind of foreignness, the kind
with no structure to exploit: a borrowed proper noun runs ~1.5 % (`Нұрсұлтан` in
a Russian article), while genuinely other-language text sits at 2.3 % and up.
`alphabet` is what all of this measures against, so a profile you write yourself
should carry its language's full alphabet — a partial one contradicts its own
word lists.

### Roster-free Cyrillic fast-path

`langtell/classify` scores a snippet _relative to a roster you pass in_.
`langtell/cyrillic` is the opposite trade: a fixed, zero-config discriminator for
the four Cyrillic languages langtell profiles — Ukrainian, Russian, Belarusian,
Bulgarian — decided purely by distinctive letters, with no roster, no
tokenization, and no franc. Reach for it when you just need _"is this Russian? is
this Ukrainian?"_ on a hot path and don't want to assemble a candidate set.

```ts
import { detectCyrillicLanguage, isUkrainian } from "langtell/cyrillic";

detectCyrillicLanguage("Їжак"); // → { language: "uk", … }  ї is uniquely Ukrainian
detectCyrillicLanguage("жёлтый"); // → { language: "ru", … }  ё / ы are Russian
detectCyrillicLanguage("съм българин"); // → { language: "bg", … }  ъ used as a vowel, repeated
detectCyrillicLanguage("подъезд"); // → { language: "ru", … }  lone ъ in a short word
isUkrainian("Слава Україні"); // → true
```

It returns `"unknown"` rather than guessing when the signals are insufficient — no
Cyrillic at all, a uk/ru tie, or only an ambiguous `э` — and withdraws a call the
text itself argues with, on the same 2 % rule as the roster-relative classifier,
quotations excluded the same way:
`Мова і культура Беларусі маюць багатую гісторыю` is not Ukrainian, however many
`і`s it has, because Ukrainian has no `ы`. The `CyrillicVerdict` also
carries the raw `ukScore` / `ruScore` tallies behind the call. Zero-dependency and
side-effect-free; escalate to `classifyBySnippet` or a franc-backed source when
letter signals aren't enough.

## API at a glance

| Export                                | Role                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `compile(config)`                     | Build a configured `detect` function (does the precompute once).                                             |
| `detect(input)`                       | The compiled detector. Sync or `Promise`, by config — see below.                                             |
| `evidenceFromText(text, candidates?)` | Producer: roster-relative script + distinctive-letter signals. Zero-dep, sync.                               |
| `evidenceFromHtml(html)`              | Producer: `<html lang>`, meta content-language, `og:locale`. Zero-dep, sync.                                 |
| `evidenceFromHeaders(h)`              | Producer: HTTP `Content-Language`. Zero-dep, sync.                                                           |
| `normalizeBCP47(tag)`                 | Normalize a BCP-47 tag/alias to a canonical code (`uk-UA`/`ua` → `uk`).                                      |
| `fuse(evidence, opts?)`               | Weighted blend + "context never overrides clear script" guard.                                               |
| `langtell/profiles`                   | Ready-made `LanguageProfile` data (uk/ru/be/bg/en). Opt-in (carries word data).                              |
| `langtell/classify`                   | Opt-in structured snippet verdict (`{ language, margin, rung }`). Zero-dep.                                  |
| `langtell/cyrillic`                   | Opt-in roster-free Cyrillic fast-path (`detectCyrillicLanguage`, `isRussian`/`isUkrainian`). Zero-dep, sync. |
| `langtell/franc`                      | Opt-in franc engine (pulls trigram tables). Sync.                                                            |
| `langtell/chrome-ai`                  | Opt-in on-device Chrome AI engine (browser). Async.                                                          |

`detect` returns a plain `Classification` when every registered source is
synchronous, and `Promise<Classification>` the moment an async engine is in the
mix — the type reflects the config, so you never guess whether to `await`. See
[DESIGN.md](./DESIGN.md) for the full architecture.

## Prior art

- [`franc`](https://github.com/wooorm/franc) — trigram detection over 400+
  languages. `langtell` can use it as one engine, but works on short strings
  where franc has too little signal, and fuses it with page/transport metadata.
- `cld3`, `tinyld`, `languagedetect` — statistical text-only detectors.
  `langtell` differs by combining script logic with out-of-band evidence and
  emitting an auditable trail.

## License

[MIT](./LICENSE)
