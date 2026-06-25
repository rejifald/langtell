import { expectTypeOf } from "vitest";
import { compile } from "./compile.js";
import { chromeAiEngine } from "./chrome-ai.js";
import type { Classification } from "./types.js";

// All-sync configuration → `detect` returns a plain Classification (no await).
expectTypeOf(compile()).returns.toEqualTypeOf<Classification>();
expectTypeOf(compile({})).returns.toEqualTypeOf<Classification>();

// An async engine registered → `detect` returns Promise<Classification>.
expectTypeOf(compile({ engines: [chromeAiEngine] })).returns.toEqualTypeOf<
  Promise<Classification>
>();
