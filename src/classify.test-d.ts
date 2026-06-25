import { expectTypeOf } from "vitest";
import { classifyBySnippet } from "./classify.js";
import type { Rung3Resolver, RungVerdict, SnippetVerdict } from "./classify.js";
import type { LanguageProfile } from "./types.js";

// `classifyBySnippet` / `Rung3Resolver` are generic over the concrete profile
// type the caller classifies with. This pins issue #8: a consumer whose profile
// requires `words` (optional on the base `LanguageProfile`) can hand its own
// resolver to `classifyBySnippet` directly — no adapter, no `as`. Parameter
// positions are contravariant, so before the generic the stricter resolver was
// rejected against a `words`-optional `Rung3Resolver`.

/** A consumer profile that makes `words` REQUIRED (optional on the base type). */
interface StrictProfile extends LanguageProfile {
  words: { function: readonly string[]; frequent: readonly string[] };
}

declare const text: string;
declare const strictProfiles: readonly StrictProfile[];
declare const strictResolver: (
  text: string,
  scoped: readonly StrictProfile[],
) => RungVerdict | null;

// The core of #8: a strict-profile resolver is assignable as the `rung3` arg
// with NO adapter and NO `as`. `P` infers from `strictProfiles` to StrictProfile.
expectTypeOf(
  classifyBySnippet(text, strictProfiles, strictResolver),
).toEqualTypeOf<SnippetVerdict>();

// The exported `Rung3Resolver<StrictProfile>` is the same strict shape — a
// consumer can name the type for its own resolver without an adapter.
expectTypeOf(strictResolver).toMatchTypeOf<Rung3Resolver<StrictProfile>>();

// The default form (no narrowing) is unchanged: `P` defaults to LanguageProfile.
declare const candidates: readonly LanguageProfile[];
expectTypeOf(classifyBySnippet(text, candidates)).toEqualTypeOf<SnippetVerdict>();

// A base `Rung3Resolver` (the default generic arg) still flows through the
// default form, exactly as before this change.
declare const baseResolver: Rung3Resolver;
expectTypeOf(classifyBySnippet(text, candidates, baseResolver)).toEqualTypeOf<SnippetVerdict>();

// `Rung3Resolver`'s default type argument keeps the bare name usable.
expectTypeOf<Rung3Resolver>().toEqualTypeOf<Rung3Resolver<LanguageProfile>>();
