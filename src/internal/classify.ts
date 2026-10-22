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
import { stripNoise, stripQuoted } from "./scrub.js";

// Re-exported so the classifier stays the one door onto its own preprocessing.
export { stripNoise, stripQuoted } from "./scrub.js";

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

/** Under {@link ClassifyOptions.isolateScripts}, the fewest letters a minority
 *  script must carry before it is classified on its own. A quoted word
 *  («привет») stays below it; a clause («Самые дешевые») clears it. */
export const MINORITY_MIN_LETTERS = 8;

/** Options for {@link classifyBySnippet}. */
export interface ClassifyOptions {
  /**
   * Judge each script on its own evidence. Off by default; when on:
   *
   * - **A discriminating minority beats a non-discriminating majority.** When
   *   the dominant script holds a lone candidate (its win is decided by script
   *   alone, not evidence) and another script in the text holds ≥2 candidates
   *   and at least {@link MINORITY_MIN_LETTERS} letters, that script's span is
   *   classified on its own with rungs 1–2. A verdict there is returned; an
   *   abstention falls back to the dominant-script verdict unchanged. Rung 3
   *   never runs on the minority span — it is short by construction, and short
   *   spans are where trigrams misread.
   * - **The rung-3 resolver reads only the scope's own script** (see
   *   {@link textInScope}), so another script's letters can't lift a short span
   *   over a resolver's length floor nor add noise to its trigrams.
   *
   * Without this, «Самые дешевые в Украине | Victron Multiplus II 48V 6k5va»
   * resolves to the lone Latin candidate (22 Latin letters outvote 20
   * Cyrillic), and «Interview with Володимир Зеленський on CNN» reaches a
   * trigram backstop on 42 characters when its Cyrillic is a 20-character name.
   */
  isolateScripts?: boolean;
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

const SCRIPT_RE: Record<ScriptName, RegExp> = { cyrillic: CYRILLIC_RE, latin: LATIN_RE };
const OTHER_SCRIPT: Record<ScriptName, ScriptName> = { cyrillic: "latin", latin: "cyrillic" };

/** Word runs carrying at least one letter of the script, with the marks,
 *  apostrophes and hyphens that spell words inside it (`п'ять`, `Най-евтините`). */
const SCRIPT_WORD_RE: Record<ScriptName, RegExp> = {
  cyrillic: /[\p{Script=Cyrillic}\p{M}'ʼ’-]*\p{Script=Cyrillic}[\p{Script=Cyrillic}\p{M}'ʼ’-]*/gu,
  latin: /[\p{Script=Latin}\p{M}'’-]*\p{Script=Latin}[\p{Script=Latin}\p{M}'’-]*/gu,
};

/** The text's words in one script, space-joined. */
function scriptSpan(text: string, script: ScriptName): string {
  return (text.match(SCRIPT_WORD_RE[script]) ?? []).join(" ");
}

function countLetters(text: string, script: ScriptName): number {
  let n = 0;
  for (const ch of text) if (SCRIPT_RE[script].test(ch)) n += 1;
  return n;
}

/**
 * The part of `text` a scope can be judged on: its words in the scope's script,
 * when the text also carries letters of another script; otherwise `text`
 * unchanged.
 *
 * What a rung-3 resolver receives under {@link ClassifyOptions.isolateScripts}.
 * Exported so an off-path resolver (an oracle over raw candidates) feeds its
 * backstop exactly what the classifier would. Single-script text is passed
 * through byte-for-byte: rewriting it (dropping punctuation and digits) would
 * shift trigram scores on the common case for no gain.
 */
export function textInScope(text: string, scoped: readonly LanguageProfile[]): string {
  const first = scoped[0];
  const script = first === undefined ? null : scriptOfProfile(first);
  if (script === null) return text;
  if (!SCRIPT_RE[OTHER_SCRIPT[script]].test(text)) return text;
  return scriptSpan(text, script);
}

/** Candidates in one script, one per code (see {@link scopeCandidates}). */
function candidatesIn<P extends LanguageProfile>(
  candidates: readonly P[],
  script: ScriptName,
): P[] {
  const seen = new Set<string>();
  const out: P[] = [];
  for (const c of candidates) {
    if (scriptOfProfile(c) !== script || seen.has(c.code)) continue;
    seen.add(c.code);
    out.push(c);
  }
  return out;
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
  return candidatesIn(candidates, script);
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

/**
 * A text's own alphabet: each letter it uses, and how often — its script's
 * letters only in the sense that non-letters are simply absent.
 *
 * Insertion-ordered, so a caller rendering it shows letters in the order the
 * reader met them rather than in an order a hash table chose.
 */
export type TextAlphabet = ReadonlyMap<string, number>;

/** What one candidate's alphabet cannot account for in a text. */
export interface Contradiction {
  /** The letters, distinct and in first-seen order. Empty when there are none. */
  readonly letters: readonly string[];
  /** Their weight, 0..1, against the letters of that candidate's script. */
  readonly share: number;
}

const NO_CONTRADICTION: Contradiction = { letters: [], share: 0 };

/** {@link textAlphabet} over text a caller has already scrubbed. */
function alphabetOfScrubbed(scrubbed: string): TextAlphabet {
  const counts = new Map<string, number>();
  for (const ch of scrubbed.toLowerCase()) {
    if (!CYRILLIC_RE.test(ch) && !LATIN_RE.test(ch)) continue;
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  return counts;
}

/**
 * Derive the alphabet a text is written in, before asking anyone to account for
 * it.
 *
 * Derived ONCE and then compared against candidates, rather than re-walking the
 * text per candidate: for a screen reporting on a whole roster that is one pass
 * plus a set lookup each, and — more to the point — it makes "the text's
 * alphabet" a thing the caller can hold, print and diff, instead of a number
 * falling out of a comparison.
 *
 * Scrubbed first ({@link stripNoise}, {@link stripQuoted}): a URL's letters and
 * a quotation's letters are in the string without being the string's own.
 */
export function textAlphabet(text: string): TextAlphabet {
  return alphabetOfScrubbed(stripQuoted(stripNoise(text)));
}

/**
 * Compare a derived {@link TextAlphabet} against one candidate.
 *
 * The primitive form, for a caller holding an alphabet and asking about several
 * candidates — an evidence report, an audit trail, a roster editor showing what
 * each choice would do.
 */
export function contradictionOf(alphabet: TextAlphabet, profile: LanguageProfile): Contradiction {
  const script = scriptOfProfile(profile);
  if (script === null) return NO_CONTRADICTION;
  const inScript = script === "cyrillic" ? CYRILLIC_RE : LATIN_RE;
  // `marks` joins the alphabet for the same reason it does at rung 1: an
  // apostrophe is part of how uk/be spell, not a foreign letter. (It is not a
  // letter, so it never reaches the alphabet — kept for the profiles whose
  // marks ever grow to include one.)
  const own = new Set(profile.alphabet + (profile.marks ?? ""));
  const letters: string[] = [];
  let foreign = 0;
  let total = 0;
  for (const [ch, count] of alphabet) {
    // Only the candidate's own script is its business: a Cyrillic headline
    // followed by a Latin brand name is not evidence against either language.
    if (!inScript.test(ch)) continue;
    total += count;
    if (own.has(ch)) continue;
    foreign += count;
    letters.push(ch);
  }
  return { letters, share: total === 0 ? 0 : foreign / total };
}

/**
 * How much of `text` a candidate's own alphabet cannot account for.
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
 * audit trail) can show the same letters and the same number the veto acted on,
 * rather than deriving a second, drifting copy of them.
 */
export function contradiction(text: string, profile: LanguageProfile): Contradiction {
  return contradictionOf(textAlphabet(text), profile);
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
 * itself (see {@link contradiction}).
 *
 * Generic over the concrete profile type `P`, inferred from `candidates`. The
 * optional `rung3` resolver is typed over the same `P`, so a consumer with a
 * stricter profile (e.g. `words` required) can pass its own resolver directly,
 * with no adapter — the resolver sees exactly the profiles the caller passed.
 * `P` defaults to {@link LanguageProfile}, so the bare two-argument form and
 * every existing call site are unchanged.
 *
 * `options` opts into behavior that is off by default — see
 * {@link ClassifyOptions}.
 */
export function classifyBySnippet<P extends LanguageProfile = LanguageProfile>(
  text: string,
  candidates: readonly P[],
  rung3?: Rung3Resolver<P>,
  options: ClassifyOptions = {},
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

  if (options.isolateScripts && !discriminating) {
    const minority = minorityVerdict(cleaned, candidates, scoped);
    if (minority) return minority;
  }

  /**
   * A winner the text itself argues against is no winner — see
   * {@link contradiction}.
   *
   * Applied to whichever rung decided, franc's included: every rung answers the
   * same forced-choice question, so every rung can be forced into the same wrong
   * answer by a language the roster does not carry. The runner-up is NOT
   * promoted — a set that could not account for the text does not get a second
   * guess at it. `"unknown"` is the honest answer, and the signal a caller needs
   * to widen the roster or escalate.
   *
   * Measured over the text's alphabet MINUS its quotations, while the rungs
   * above tallied the text whole. The asymmetry is deliberate and is the whole
   * point of measuring separately: a quotation is someone else's language and
   * cannot be held against this author, whereas removing it from the tally would
   * silently re-decide verdicts that have nothing to do with this veto. One
   * derivation, computed the first time a rung produces a winner.
   */
  // Derived on first use: the texts that never reach a verdict — most of them —
  // never pay for it.
  let alphabet: TextAlphabet | undefined;
  const settle = (verdict: RungVerdict): SnippetVerdict => {
    const winner = scoped.find((c) => c.code === verdict.language);
    alphabet ??= alphabetOfScrubbed(stripQuoted(cleaned));
    if (winner && contradictionOf(alphabet, winner).share >= CONTRADICTION_SHARE) return UNKNOWN;
    return { ...verdict, discriminating };
  };

  const byLetter = letterRung(cleaned, scoped);
  if (byLetter) return settle(byLetter);

  const tokens = tokenize(cleaned);
  if (tokens.length === 0) return UNKNOWN;

  const byWord =
    wordRung(tokens, scoped, "function", "2a") ??
    wordRung(tokens, scoped, "frequent", "2b") ??
    rung3?.(options.isolateScripts ? textInScope(cleaned, scoped) : cleaned, scoped);
  return byWord ? settle(byWord) : UNKNOWN;
}

/**
 * Under {@link ClassifyOptions.isolateScripts}: the verdict of a minority
 * script that can actually choose between candidates, when the dominant one
 * cannot. Rungs 1–2 over that script's unquoted span, with the same
 * contradiction veto;
 * `null` when the span is too short, holds fewer than two candidates, or
 * abstains — the caller then keeps the dominant-script verdict.
 */
function minorityVerdict(
  cleaned: string,
  candidates: readonly LanguageProfile[],
  dominant: readonly LanguageProfile[],
): SnippetVerdict | null {
  const first = dominant[0];
  const dominantScriptName = first === undefined ? null : scriptOfProfile(first);
  if (dominantScriptName === null) return null;
  const script = OTHER_SCRIPT[dominantScriptName];
  const scoped = candidatesIn(candidates, script);
  if (scoped.length < 2) return null;
  // Quotations are someone else's words: an English title quoting a Russian
  // slogan is not a Russian title (see {@link stripQuoted}).
  const span = scriptSpan(stripQuoted(cleaned), script);
  if (countLetters(span, script) < MINORITY_MIN_LETTERS) return null;

  const verdict =
    letterRung(span, scoped) ??
    wordRung(tokenize(span), scoped, "function", "2a") ??
    wordRung(tokenize(span), scoped, "frequent", "2b");
  if (!verdict) return null;
  const winner = scoped.find((c) => c.code === verdict.language);
  const alphabet = alphabetOfScrubbed(stripQuoted(cleaned));
  if (winner && contradictionOf(alphabet, winner).share >= CONTRADICTION_SHARE) return null;
  return { ...verdict, discriminating: true };
}
