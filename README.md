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

> **Status:** design preview. The API below is the committed design; the
> implementation is in progress. This `0.0.x` release reserves the name and
> documents the design — it has no runtime yet.

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

// compile() does the per-roster setup once; call the returned fn many times.
const detect = compile({ candidates: [UK, RU, EN] });

const result = detect({
  text: "Їжак Сонік",
  html, // optional: <html lang>, og:locale, meta content-language
  responseHeaders, // optional: HTTP Content-Language
});
// → { language: "uk", confidence: 0.9x, evidence: [{ kind: "title-script", ... }, ...] }
```

Add a heavy engine — it stays behind its own import door, and the return type
becomes `Promise` automatically because the engine is async:

```ts
import { compile } from "langtell";
import { francEngine } from "langtell/franc";

const detect = compile({ candidates: [UK, RU, EN], engines: [francEngine] });
const result = await detect({ text, html, responseHeaders });
```

## API at a glance

| Export                   | Role                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| `compile(config)`        | Build a configured `detect` function (does the precompute once).             |
| `detect(input)`          | The compiled detector. Sync or `Promise`, by config — see below.             |
| `evidenceFromText(text)` | Producer: script + distinctive-letter signals. Zero-dep, sync.               |
| `evidenceFromHtml(html)` | Producer: `<html lang>`, meta content-language, `og:locale`. Zero-dep, sync. |
| `evidenceFromHeaders(h)` | Producer: HTTP `Content-Language`. Zero-dep, sync.                           |
| `fuse(evidence, opts?)`  | Weighted blend + "context never overrides clear script" guard.               |
| `langtell/franc`         | Opt-in franc engine (pulls trigram tables).                                  |
| `langtell/chrome-ai`     | Opt-in on-device Chrome AI engine (browser).                                 |

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
