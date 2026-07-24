---
"langtell": minor
---

Honor `AsyncSource.isAvailable()` in the compiled detector, and self-gate `langtell/chrome-ai` inside `detect()`, so a merely `downloadable` on-device model is never reached via `create()` — the call that starts a multi-hundred-MB Gemini Nano download the user never consented to — and emits no `chrome-ai` evidence.

Implement `DetectContext.signal`: an aborted detection now rejects with the signal's reason (web-standard `AbortSignal.throwIfAborted()` semantics), checked before each dispatch and after every await, including inside `langtell/chrome-ai`. It was previously a typed, documented no-op.

Implement `DetectorConfig.earlyExit`: sources now run cheaper-first, one at a time, stopping as soon as the fused confidence clears `minConfidence`. Opt-in only — detectors without `earlyExit` keep running their async engines concurrently.

Contain faults from registered engines: an engine that throws _synchronously_ from `detect()` (a plain function returning a promise satisfies `AsyncSource.detect`) no longer escapes the guard and fails the whole detection, and registered sync engines are contained too. The built-in producers are deliberately left uncontained, so a bug in langtell still surfaces.
