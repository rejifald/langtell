/**
 * Text that is in the string but is not the string's own language.
 *
 * Two kinds, and the distinction is provenance rather than content: a URL is
 * machine text that happens to sit in a sentence, and a quotation is someone
 * else's sentence. Neither is evidence about the language of the writing around
 * it, so both are removed before a measurement that would otherwise read them as
 * such.
 *
 * Its own module because both detectors need it and they must not disagree: the
 * roster-relative classifier and the roster-free Cyrillic fast-path are separate
 * entry points with separate bundles, and a second copy of "what is not the
 * text's own voice" is a second thing to keep in sync. Zero-dependency, so
 * neither entry pays for the other.
 */

/**
 * Trailing/inline Latin "noise" tokens — URLs, @handles, #hashtags — that a
 * Cyrillic title commonly carries (a headline followed by a link or a social
 * handle). These are almost always Latin even on Cyrillic-language content, so
 * left in they can flip the dominant-script vote and let genuinely Cyrillic
 * content scope to the wrong roster.
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

/**
 * Paired quotation marks, by the conventions the languages here actually use.
 *
 * DOUBLE forms only, and that is not an omission: Ukrainian and Belarusian spell
 * with an apostrophe (`комп'ютер`, `сям'я`), so a pattern that paired single
 * quotes would eat the inside of ordinary words and take their letters with it.
 * Unbalanced marks match nothing, which fails in the safe direction — a stray
 * `«` leaves the text exactly as it was.
 */
const QUOTED_PATTERNS: readonly RegExp[] = [
  /«[^«»]*»/g, // guillemets — uk/ru/be/bg/fr
  /»[^«»]*«/g, // …and the inverted German/Polish order
  /“[^“”]*”/g, // curly English
  /„[^„“”]*[“”]/g, // low-opening German / Bulgarian / Polish
  /"[^"]*"/g, // straight
];

/** Letters, for weighing how much of a text a span is. */
function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length;
}

/**
 * Drop quoted spans — someone else's words, in whatever language they wrote them.
 *
 * A quotation is the one kind of foreign text a well-written page is EXPECTED to
 * carry: a Ukrainian article quoting a Russian sentence is still a Ukrainian
 * article, and the Russian letters inside the quotation marks are evidence about
 * the person being quoted. Measuring a language against them is measuring the
 * wrong author.
 *
 * UNLESS THE QUOTATION IS THE TEXT. A pull-quote, a headline in guillemets, a
 * one-line testimonial — strip those and nothing is left to judge, or worse, a
 * sliver of framing prose speaks for a passage it merely introduces. So when
 * quotations are at least half the letters, they are treated as the content they
 * plainly are and the text is returned untouched.
 */
export function stripQuoted(text: string): string {
  let out = text;
  for (const re of QUOTED_PATTERNS) out = out.replace(re, " ");
  if (out === text) return text;
  return letterCount(out) * 2 >= letterCount(text) ? out : text;
}
