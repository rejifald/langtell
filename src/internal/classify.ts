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
/** Any Unicode letter. Non-global on purpose — tested against one code point at
 *  a time, so there is no `lastIndex` to reset. */
const LETTER_RE = /\p{L}/u;

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
 * a domain, and its last label must be an alphabetic TLD so ordinary prose is
 * not eaten (see the pattern's own comment).
 */
const NOISE_PATTERNS: readonly RegExp[] = [
  /\bhttps?:\/\/\S+/gi, // full URLs
  /\bwww\.\S+/gi, // www.… without a scheme
  // Bare domains (example.com/path). The final label MUST be an alphabetic TLD
  // of ≥2 chars, and the pattern is deliberately case-SENSITIVE (no `i` flag):
  // without both constraints any two alphanumeric runs joined by a dot are
  // deleted, which silently eats the very common missing-space-after-a-period
  // in scraped titles ("The end.The next one" → "The   next one", "e.g. this"),
  // and those words then contribute nothing to the script vote or any rung.
  // Two accepted residuals: an all-lowercase sentence join ("the end.the next
  // one") is indistinguishable from a domain and is still stripped, and a
  // mixed-case hostname ("Example.COM") is no longer stripped — the price of
  // dropping `i`.
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:[a-z]{2,})(?:\/\S*)?\b/g,
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

/**
 * Occurrences of `marks` that sit BETWEEN two letters — the only position where
 * {@link LanguageProfile.marks} carries the documented signal (the intra-word
 * apostrophe uk/be use where ru uses ъ or nothing). The same code points are
 * overwhelmingly punctuation everywhere else (U+0027/U+2019 as quotes), so a
 * whole-text tally reads `Фильм 'Брат' вышел` as Ukrainian and — because rung 1
 * runs first — short-circuits the far more precise word rungs.
 *
 * Scanned by code point against the set the scoped profiles actually declare,
 * rather than a regex built from that data, so profile text never has to be
 * escaped into a character class.
 */
function intraWordMarks(text: string, marks: ReadonlySet<string>): string[] {
  if (marks.size === 0) return [];
  const chars = [...text];
  const found: string[] = [];
  for (let i = 1; i < chars.length - 1; i += 1) {
    const ch = chars[i];
    if (ch === undefined || !marks.has(ch)) continue;
    const prev = chars[i - 1];
    const next = chars[i + 1];
    if (prev !== undefined && next !== undefined && LETTER_RE.test(prev) && LETTER_RE.test(next)) {
      found.push(ch);
    }
  }
  return found;
}

/** Rung 1 — characters distinctive within the scoped candidate set: alphabet
 *  letters wherever they appear, plus orthographic {@link LanguageProfile.marks}
 *  counted ONLY between two letters. Marks are tallied in their own pass against
 *  a marks-only membership, so distinctiveness stays candidate-relative exactly
 *  as for letters — a mark carried by ≥2 scoped candidates (uk and be both have
 *  one) is owned by neither and cancels out. */
function letterRung(text: string, scoped: readonly LanguageProfile[]): RungVerdict | null {
  const lower = text.toLowerCase();
  const scores = tally(
    lower,
    membershipFor(scoped, (p) => p.alphabet),
  );
  const markSets = membershipFor(scoped, (p) => p.marks ?? "");
  const declared = new Set<string>();
  for (const m of markSets) for (const ch of m.set) declared.add(ch);
  for (const [code, count] of tally(intraWordMarks(lower, declared), markSets)) {
    scores.set(code, (scores.get(code) ?? 0) + count);
  }
  const r = leader(scores);
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
 * `"unknown"` on empty evidence, on a tie inside the candidate set, or when
 * nothing is distinctive.
 *
 * Generic over the concrete profile type `P`, inferred from `candidates`. The
 * optional `rung3` resolver is typed over the same `P`, so a consumer with a
 * stricter profile (e.g. `words` required) can pass its own resolver directly,
 * with no adapter — the resolver sees exactly the profiles the caller passed.
 * `P` defaults to {@link LanguageProfile}, so the bare two-argument form and
 * every existing call site are unchanged. It is invoked only when the
 * noise-stripped text clears {@link RUNG3_MIN_LENGTH}; below that floor the
 * classifier abstains rather than asking for a trigram guess.
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

  const byLetter = letterRung(cleaned, scoped);
  if (byLetter) return { ...byLetter, discriminating };

  const tokens = tokenize(cleaned);
  if (tokens.length === 0) return UNKNOWN;

  // Rung 3 only runs past {@link RUNG3_MIN_LENGTH}: the floor is the whole
  // reason trigram evidence is trustworthy, so it is enforced here rather than
  // left to each injected resolver. Measured on `cleaned` — stripping only
  // shortens, so a sample that clears the floor after noise removal genuinely
  // has that many characters of prose.
  const byWord =
    wordRung(tokens, scoped, "function", "2a") ??
    wordRung(tokens, scoped, "frequent", "2b") ??
    (rung3 !== undefined && cleaned.length >= RUNG3_MIN_LENGTH ? rung3(cleaned, scoped) : null);
  return byWord ? { ...byWord, discriminating } : UNKNOWN;
}
