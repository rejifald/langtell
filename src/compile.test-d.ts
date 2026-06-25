import { expectTypeOf } from "vitest";
import { compile } from "./compile.js";
import { chromeAiEngine } from "./chrome-ai.js";
import { createFrancEngine } from "./franc.js";
import { uk } from "./profiles.js";
import type { Classification } from "./types.js";

// All-sync configuration → `detect` returns a plain Classification (no await).
expectTypeOf(compile()).returns.toEqualTypeOf<Classification>();
expectTypeOf(compile({})).returns.toEqualTypeOf<Classification>();

// A franc engine is a SyncSource → `detect` stays synchronous.
expectTypeOf(
  compile({ engines: [createFrancEngine([uk])] }),
).returns.toEqualTypeOf<Classification>();

// An async engine registered → `detect` returns Promise<Classification>.
expectTypeOf(compile({ engines: [chromeAiEngine] })).returns.toEqualTypeOf<
  Promise<Classification>
>();
