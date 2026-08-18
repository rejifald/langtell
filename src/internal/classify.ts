/**
 * Per-snippet language classification by candidate-set-relative set-difference.
 *
 * A ladder of rungs; the first rung whose leader clears a lead (margin) of ≥1
 * wins; otherwise `"unknown"`:
 *
 *   1   alphabet       — characters distinctive within the candidate set
 *   2a  function words — curated grammatical markers (highest precision)
 *   2b  frequent words — corpus content words
 *   3   franc          — optional trigram backstop for the distinctive-free
 *                        residual, injected as a resolver (this module stays
 *                        franc-free and importable without franc's tables)
 *
 * "Distinctive" is ALWAYS relative to the candidate set: a signal counts for a
 * candidate iff it appears in that candidate's profile and in NO other
 * candidate's. So `і` decides {uk, ru} (only uk has it) but is inert in
 * {uk, be} (both have it), and the word `и` decides {uk, ru} even though the
 * *letter* `и` is shared. Nothing is precomputed — uniqueness is the runtime
 * output, never stored.
 *
 * Above the ladder sits one veto. Ownership is additive evidence and can only
 * ever argue FOR a candidate, which leaves a closed set defenceless against text
 * written in a language it does not contain: Belarusian handed to {uk, ru} spends
 * its `і`s electing Ukrainian while its `ы`/`ў`/`э` — letters Ukrainian does not
 * have at all — count for nobody and stop nothing. So a winner is checked against
 * the text one last time, and a winner whose own alphabet cannot account for
 * {@link CONTRADICTION_SHARE} of it loses to `"unknown"`.
 *
 * Adapted to langtell's {@link LanguageProfile} shape: the `words` and `iso6393`
 * fields are optional here, so a bare `{ code, alphabet }` profile still
 * classifies on rung 1.
 */
import type { LanguageProfile } from "../types.js";

export const FRANC_RUNG = 3;

/** Which rung decided a verdict; `null` when unknown. */
export type Rung = 1 | "2a" | "2b" | typeof FRANC_RUNG | null;

export interface SnippetVerdict {
  /** Winning language code, or the sentinel `"unknown"`. */
  language: string;
  /** Lead of the winner over the runner-up, in the rung's own unit (distinctive
   *  char/word count for rungs 1–2; franc score-gap for rung 3). 0 when unknown. */
  margin: number;
  /** Which rung decided; `null` when unknown. */
  rung: Rung;
  /** Whether ≥2 same-script candidates were in scope when the verdict was
   *  reached. `true` ⇒ the distinctive-letter/word machinery actually chose
   *  between candidates; `false` ⇒ the winner was the lone candidate in its
   *  script, selected by script alone (no evidence it is *distinctively* that
   *  language). `false` for `"unknown"`. */
  discriminating: boolean;
}

/** A rung's verdict before {@link classifyBySnippet} stamps on the scope-derived
 *  `discriminating` flag (which a single rung can't know — it depends on how many
 *  same-script candidates were scoped). */
export type RungVerdict = Pick<SnippetVerdict, "language" | "margin" | "rung">;

const UNKNOWN: SnippetVerdict = {
  language: "unknown",
  margin: 0,
  rung: null,
  discriminating: false,
};

/** Resolver for rung 3 (the optional trigram backstop), injected into
 *  {@link classifyBySnippet} by callers that have franc available. Kept as an
 *  injected seam — not a direct import — so this module stays franc-free and
 *  importable without pulling franc's tables. Returns a rung-3 verdict or
 *  `null` (abstain).
 *
 *  Generic over the concrete profile type `P` the caller classifies with, so a
 *  consumer that defines a stricter profile (e.g. `words` required) can type its
 *  resolver over that exact shape and hand it to {@link classifyBySnippet} with
 *  no adapter — the resolver sees `readonly P[]`, the same array the classifier
 *  scoped from its input. Defaults to {@link LanguageProfile} for callers that
 *  don't narrow. */
export type Rung3Resolver<P extends LanguageProfile = LanguageProfile> = (
  text: string,
  scoped: readonly P[],
) => RungVerdict | null;

const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/u;

/** A coarse script bucket — the only two the candidate-relative classifier
 *  distinguishes today. `null` means "no letters / undetermined". */
export type ScriptName = "cyrillic" | "latin";

/** Below this length, trigrams are too noisy to justify a rung-3 verdict. */
export const RUNG3_MIN_LENGTH = 24;

/**
 * Trailing/inline Latin "noise" tokens — URLs, @handles, #hashtags — that a
 * Cyrillic title commonly carries (a headline followed by a link or a social
 * handle). These are almost always Latin even on Cyrillic-language content, so
 * left in they can flip {@link dominantScript} to Latin and let genuinely
 * Cyrillic content scope to the wrong roster. Stripped before the script vote
 * AND before the rung tallies so the URL's letters never contribute either.
 *
 * Kept as separate simple patterns (applied in order — schemes/www before bare
 * domains) rather than one big alternation, so each stays readable. ASCII-only
 * `[a-z0-9-]` in the domain pattern means a Cyrillic word is never mistaken for
 * a domain.
 */
const NOISE_PATTERNS: readonly RegExp[] = [
  /\bhttps?:\/\/\S+/gi, // full URLs
  /\bwww\.\S+/gi, // www.… without a scheme
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/gi, // bare domains (example.com/path)
  /[@#][\p{L}\p{N}_]+/gu, // @handles and #hashtags
];

/** Drop URLs / @handles / #hashtags so trailing Latin noise can't outvote the
 *  prose's script or pollute the per-rung tallies. */
export function stripNoise(text: string): string {
  let out = text;
  for (const re of NOISE_PATTERNS) out = out.replace(re, " ");
  return out;
}

/** The script most of `text` is written in, or `null` if it carries no letters.
 *  Noise (URLs/handles/hashtags) is stripped first so a single trailing link
 *  can't flip a multi-word Cyrillic title's vote to Latin. */
function dominantScript(text: string): "cyrillic" | "latin" | null {
  let cyr = 0;
  let lat = 0;
  for (const ch of stripNoise(text)) {
    if (CYRILLIC_RE.test(ch)) cyr += 1;
    else if (LATIN_RE.test(ch)) lat += 1;
  }
  if (cyr === 0 && lat === 0) return null;
  return cyr >= lat ? "cyrillic" : "latin";
}

/** The script a profile's alphabet is written in, or `null` if it carries no
 *  Cyrillic/Latin letter. Exported so the fuser can derive each roster
 *  candidate's script without re-deriving the script regexes — a Latin alphabet
 *  ⇒ `"latin"`, a Cyrillic one ⇒ `"cyrillic"`. */
export function scriptOfProfile(profile: LanguageProfile): ScriptName | null {
  for (const ch of profile.alphabet) {
    if (CYRILLIC_RE.test(ch)) return "cyrillic";
    if (LATIN_RE.test(ch)) return "latin";
  }
  return null;
}

/** Candidates whose script matches the text's dominant script (others can't tip
 *  the verdict). Empty when the text carries no letters. Generic over the
 *  concrete profile type `P`: the result is a subset of the input array, so it
 *  keeps `P` — a stricter caller's profiles stay strictly typed downstream. */
export function scopeCandidates<P extends LanguageProfile>(
  text: string,
  candidates: readonly P[],
): P[] {
  const script = dominantScript(text);
  if (script === null) return [];
  // Keep one profile per code. A language listed twice would otherwise make its
  // own distinctive chars/words read as "owned by ≥2 candidates" in `tally`,
  // cancelling them out and collapsing the verdict to "unknown".
  const seen = new Set<string>();
  const scoped: P[] = [];
  for (const c of candidates) {
    if (scriptOfProfile(c) !== script || seen.has(c.code)) continue;
    seen.add(c.code);
    scoped.push(c);
  }
  return scoped;
}

/**
 * Per-language set of characters globally unique within `profiles` — present in
 * exactly one profile's alphabet. Relative to the given profile set: the unique
 * set shrinks as languages are added (a second Latin language un-uniques a–z).
 */
export function distinctiveChars(profiles: readonly LanguageProfile[]): Map<string, Set<string>> {
  const owners = new Map<string, string[]>();
  for (const p of profiles) {
    for (const ch of new Set(p.alphabet)) {
      const list = owners.get(ch);
      if (list) list.push(p.code);
      else owners.set(ch, [p.code]);
    }
  }
  const result = new Map<string, Set<string>>(profiles.map((p) => [p.code, new Set()]));
  for (const [ch, codes] of owners) {
    const [only] = codes;
    if (codes.length === 1 && only !== undefined) result.get(only)?.add(ch);
  }
  return result;
}

/**
 * Share of a text's letters, in a profile's own script, that the profile's
 * alphabet does not contain — evidence AGAINST that profile.
 *
 * Beyond which a candidate is treated as contradicted by the text. Measured, not
 * picked: across a mixed corpus (Cyrillic siblings + Latin), the three
 * populations separate cleanly.
 *
 *   0.3–0.9 %  an in-language snippet quoting a sibling (a Ukrainian article
 *              carrying a Russian sentence, and vice versa)
 *   1.4–1.5 %  a foreign proper noun in otherwise monolingual prose
 *              (`Нұрсұлтан` in a Russian article, `Ђоковић` in another)
 *   2.3–17 %   text that is simply written in a language nobody on the roster
 *              profiles (Belarusian against {uk, ru}, German against {en})
 *
 * 2 % sits in the gap. It is deliberately nearer the incidental end: the cost of
 * vetoing too eagerly is an `"unknown"` a caller escalates, while the cost of
 * vetoing too late is a confident wrong language.
 */
export const CONTRADICTION_SHARE = 0.02;

/** {@link contradictionShare} over text a caller has already noise-stripped. */
function shareOfCleaned(cleaned: string, profile: LanguageProfile): number {
  const script = scriptOfProfile(profile);
  if (script === null) return 0;
  const inScript = script === "cyrillic" ? CYRILLIC_RE : LATIN_RE;
  // `marks` joins the alphabet for the same reason it does at rung 1: an
  // apostrophe is part of how uk/be spell, not a foreign letter. (It is not a
  // letter, so the script filter drops it first — kept for the profiles whose
  // marks ever grow to include one.)
  const own = new Set(profile.alphabet + (profile.marks ?? ""));
  let letters = 0;
  let foreign = 0;
  for (const ch of cleaned.toLowerCase()) {
    if (!inScript.test(ch)) continue;
    letters += 1;
    if (!own.has(ch)) foreign += 1;
  }
  return letters === 0 ? 0 : foreign / letters;
}

/**
 * How much of `text` a candidate's own alphabet cannot account for — 0..1.
 *
 * Counted over the letters of that candidate's script only, so a Cyrillic
 * headline followed by a Latin brand name does not read as evidence against
 * either. Noise (URLs, @handles, #hashtags) is stripped exactly as
 * {@link classifyBySnippet} strips it.
 *
 * WHY THIS EXISTS AT ALL. The rung ladder is additive: it counts what each
 * candidate uniquely OWNS and never counts what a candidate cannot possibly
 * have written. Those are different questions, and the second one is the only
 * defence a closed set has against a language that is not in it. Belarusian
 * `Мова і культура Беларусі маюць багатую гісторыю` hands `і` to Ukrainian four
 * times over against {uk, ru} — while `ы`, a letter Ukrainian does not have,
 * sits in the same sentence saying the winner cannot be right. Ownership alone
 * cannot see that; this is what sees it.
 *
 * Exported so a caller that has to EXPLAIN a verdict (a diagnostics screen, an
 * audit trail) can show the same number the veto acted on, rather than deriving
 * a second, drifting copy of it.
 */
export function contradictionShare(text: string, profile: LanguageProfile): number {
  return shareOfCleaned(stripNoise(text), profile);
}

interface Membership {
  code: string;
  set: ReadonlySet<string>;
}

/** Lowercased Unicode letter-run tokens. Keeps single-char tokens (`і`, `и`). */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\p{L}+/gu) ?? [];
}

/**
 * Tally how many items (characters or word tokens) are distinctive to each
 * candidate — present in exactly one candidate's set. Items owned by zero or by
 * ≥2 candidates contribute nothing.
 */
function tally(items: Iterable<string>, membership: readonly Membership[]): Map<string, number> {
  const scores = new Map<string, number>(membership.map((m) => [m.code, 0]));
  for (const item of items) {
    let owner: string | null = null;
    let owners = 0;
    for (const m of membership) {
      if (m.set.has(item)) {
        owners += 1;
        if (owners > 1) {
          owner = null;
          break;
        }
        owner = m.code;
      }
    }
    if (owner !== null) scores.set(owner, (scores.get(owner) ?? 0) + 1);
  }
  return scores;
}

/** The leading candidate and its lead over the runner-up, or `null` if <1. */
function leader(scores: Map<string, number>): { code: string; margin: number } | null {
  let max = -1;
  let second = -1;
  let code: string | null = null;
  for (const [c, score] of scores) {
    if (score > max) {
      second = max;
      max = score;
      code = c;
    } else if (score > second) {
      second = score;
    }
  }
  if (code === null || max < 1) return null;
  const margin = max - Math.max(second, 0);
  return margin >= 1 ? { code, margin } : null;
}

function membershipFor(
  candidates: readonly LanguageProfile[],
  pick: (p: LanguageProfile) => Iterable<string>,
): Membership[] {
  return candidates.map((c) => ({ code: c.code, set: new Set(pick(c)) }));
}

/** Rung 1 — characters (alphabet + orthographic {@link LanguageProfile.marks})
 *  distinctive within the scoped candidate set. */
function letterRung(text: string, scoped: readonly LanguageProfile[]): RungVerdict | null {
  const r = leader(
    tally(
      text.toLowerCase(),
      membershipFor(scoped, (p) => p.alphabet + (p.marks ?? "")),
    ),
  );
  return r ? { language: r.code, margin: r.margin, rung: 1 } : null;
}

/** Rung 2 — distinctive words from the given tier (2a function, 2b frequent). */
function wordRung(
  tokens: readonly string[],
  scoped: readonly LanguageProfile[],
  tier: "function" | "frequent",
  rung: "2a" | "2b",
): RungVerdict | null {
  const r = leader(
    tally(
      tokens,
      membershipFor(scoped, (p) => p.words?.[tier] ?? []),
    ),
  );
  return r ? { language: r.code, margin: r.margin, rung } : null;
}

/**
 * Classify `text` among `candidates`. Synchronous and allocation-light. Returns
 * `"unknown"` on empty evidence, on a tie inside the candidate set, when nothing
 * is distinctive, or when the winning candidate is contradicted by the text
 * itself (see {@link contradictionShare}).
 *
 * Generic over the concrete profile type `P`, inferred from `candidates`. The
 * optional `rung3` resolver is typed over the same `P`, so a consumer with a
 * stricter profile (e.g. `words` required) can pass its own resolver directly,
 * with no adapter — the resolver sees exactly the profiles the caller passed.
 * `P` defaults to {@link LanguageProfile}, so the bare two-argument form and
 * every existing call site are unchanged.
 */
export function classifyBySnippet<P extends LanguageProfile = LanguageProfile>(
  text: string,
  candidates: readonly P[],
  rung3?: Rung3Resolver<P>,
): SnippetVerdict {
  if (!text || candidates.length === 0) return UNKNOWN;

  // Drop URLs / @handles / #hashtags once, up front: trailing Latin noise must
  // not flip the dominant-script vote nor pollute the per-rung tallies.
  const cleaned = stripNoise(text);

  // Restrict to candidates in the text's dominant script.
  const scoped = scopeCandidates(cleaned, candidates);
  if (scoped.length === 0) return UNKNOWN;

  // ≥2 same-script candidates means the distinctive machinery actually had a
  // choice to make; a lone scoped candidate wins by script alone. Stamped onto
  // whichever rung decides — a single rung can't see the scope size.
  const discriminating = scoped.length >= 2;

  /**
   * A winner the text itself argues against is no winner — see
   * {@link contradictionShare}.
   *
   * Applied to whichever rung decided, franc's included: every rung answers the
   * same forced-choice question, so every rung can be forced into the same wrong
   * answer by a language the roster does not carry. The runner-up is NOT
   * promoted — a set that could not account for the text does not get a second
   * guess at it. `"unknown"` is the honest answer, and the signal a caller needs
   * to widen the roster or escalate.
   */
  const settle = (verdict: RungVerdict): SnippetVerdict => {
    const winner = scoped.find((c) => c.code === verdict.language);
    if (winner && shareOfCleaned(cleaned, winner) >= CONTRADICTION_SHARE) return UNKNOWN;
    return { ...verdict, discriminating };
  };

  const byLetter = letterRung(cleaned, scoped);
  if (byLetter) return settle(byLetter);

  const tokens = tokenize(cleaned);
  if (tokens.length === 0) return UNKNOWN;

  const byWord =
    wordRung(tokens, scoped, "function", "2a") ??
    wordRung(tokens, scoped, "frequent", "2b") ??
    rung3?.(cleaned, scoped);
  return byWord ? settle(byWord) : UNKNOWN;
}
