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

## API at a glance

| Export                                | Role                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `compile(config)`                     | Build a configured `detect` function (does the precompute once).                |
| `detect(input)`                       | The compiled detector. Sync or `Promise`, by config — see below.                |
| `evidenceFromText(text, candidates?)` | Producer: roster-relative script + distinctive-letter signals. Zero-dep, sync.  |
| `evidenceFromHtml(html)`              | Producer: `<html lang>`, meta content-language, `og:locale`. Zero-dep, sync.    |
| `evidenceFromHeaders(h)`              | Producer: HTTP `Content-Language`. Zero-dep, sync.                              |
| `normalizeBCP47(tag)`                 | Normalize a BCP-47 tag/alias to a canonical code (`uk-UA`/`ua` → `uk`).         |
| `fuse(evidence, opts?)`               | Weighted blend + "context never overrides clear script" guard.                  |
| `langtell/profiles`                   | Ready-made `LanguageProfile` data (uk/ru/be/bg/en). Opt-in (carries word data). |
| `langtell/franc`                      | Opt-in franc engine (pulls trigram tables). Sync.                               |
| `langtell/chrome-ai`                  | Opt-in on-device Chrome AI engine (browser). Async.                             |

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
