/**
 * `langtell/profiles` — ready-to-use {@link LanguageProfile} data.
 *
 * This is the heavy DATA half of the library: alphabets, curated function-word
 * lists, and corpus-frequent word lists. It is deliberately kept behind its own
 * subpath, OUT of the zero-dependency core, so `import { compile } from
 * "langtell"` never drags the word corpora into a bundle that only needs the
 * script/letter rungs. Pass these into `compile({ candidates: [...] })`.
 *
 * Each profile is declarative and auditable:
 *   - `alphabet`        — the language's lowercased alphabet (raw; distinctiveness
 *                         is computed at runtime per candidate set).
 *   - `marks`           — orthographic marks that count as rung-1 evidence but
 *                         are not alphabet letters (the intra-word apostrophe).
 *   - `words.function`  — curated grammatical markers, hand-verified.
 *   - `words.frequent`  — common everyday words from a subtitle-frequency corpus.
 *   - `iso6393`         — ISO 639-3 code for the optional franc engine.
 *
 * Curation rule for `function`: a token may appear in exactly one candidate's
 * list ONLY if that form is genuinely used by only that language among those we
 * support. Shared forms must be in every list that uses them (set-difference
 * then cancels them) or omitted from all. When in doubt, omit: a missing marker
 * only costs recall.
 */
import type { LanguageCode, LanguageProfile } from "./types.js";
import { FREQUENT_GENERATED } from "./internal/frequent.js";

/** Belarusian has no subtitle frequency data — hand-curated content words. */
const BE_FREQUENT: readonly string[] = [
  "навіны",
  "відэа",
  "горад",
  "краіна",
  "дзень",
  "жыццё",
  "людзі",
  "праца",
  "беларуская",
  "сёння",
  "вядомы",
];

/** Bulgarian has no subtitle frequency data here — hand-curated content words,
 *  mirroring the BE fallback. Forms whose spelling is genuinely Bulgarian
 *  (e.g. `град`/`днес` vs ru `город`/`сегодня`) so set-difference can use them. */
const BG_FREQUENT: readonly string[] = [
  "новини",
  "видео",
  "град",
  "държава",
  "днес",
  "живот",
  "хора",
  "работа",
  "българия",
  "български",
  "известен",
  "страна",
];

/** Serbian Cyrillic has NO usable subtitle frequency data: hermitdave/
 *  FrequencyWords ships Serbian in LATIN script only, and blind transliteration
 *  would invent data, so this is a hand-curated Cyrillic content-word list,
 *  mirroring the BE/BG fallbacks. Forms are everyday Serbian content words spelt
 *  in Cyrillic; many use Serbian-distinctive letters (ј, ћ, ђ, џ) so they read as
 *  distinctive at runtime. NEEDS NATIVE-SPEAKER / LINGUISTIC REVIEW before
 *  release. */
const SR_FREQUENT: readonly string[] = [
  "вести",
  "видео",
  "град",
  "држава",
  "данас",
  "живот",
  "људи",
  "посао",
  "србија",
  "српски",
  "познат",
  "земља",
  "време",
  "деца",
  "године",
  "човек",
  "новине",
  "свет",
  "данашњи",
  "недеља",
];

const uk: LanguageProfile = {
  code: "uk",
  iso6393: "ukr",
  // has і ї є ґ and и; lacks ё ъ ы э
  alphabet: "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя",
  // intra-word apostrophe (uk/be use it where ru uses ъ/nothing). All three
  // codepoints: U+0027 ' U+2019 ’ U+02BC ʼ.
  marks: "'’ʼ",
  words: {
    function: [
      "і",
      "й",
      "що",
      "як",
      "це",
      "бо",
      "ще",
      "дуже",
      "де",
      "його",
      "її",
      "але",
      "який",
      "яка",
      "цей",
      "ця",
      "навіть",
      "чи",
      "або",
      "ні",
      "щоб",
      "теж",
      "також",
      "він",
      "вона",
      "вони",
    ],
    frequent: FREQUENT_GENERATED["uk"] ?? [],
  },
};

const ru: LanguageProfile = {
  code: "ru",
  iso6393: "rus",
  // has ё ъ ы э and и; lacks і ї є ґ ў
  alphabet: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
  words: {
    function: [
      "и",
      "что",
      "как",
      "это",
      "бы",
      "уже",
      "или",
      "нет",
      "очень",
      "его",
      "её",
      "ее",
      "где",
      "когда",
      "этот",
      "эта",
      "но",
      "какой",
      "какая",
      "даже",
      "ещё",
      "чтобы",
      "потому",
      "тоже",
      "он",
      "она",
      "они",
    ],
    frequent: FREQUENT_GENERATED["ru"] ?? [],
  },
};

const be: LanguageProfile = {
  code: "be",
  iso6393: "bel",
  // has і ў and ы ё э; lacks и щ ъ ї є ґ
  alphabet: "абвгдеёжзійклмнопрстуўфхцчшыьэюя",
  // intra-word apostrophe — same uk/be keep-signal; inert between uk and be.
  marks: "'’ʼ",
  words: {
    function: [
      "і",
      "што",
      "гэта",
      "вельмі",
      "дзе",
      "ці",
      "таксама",
      "як",
      "але",
      "бо",
      "каб",
      "ён",
      "яна",
      "яны",
      "быў",
    ],
    frequent: FREQUENT_GENERATED["be"] ?? BE_FREQUENT,
  },
};

const bg: LanguageProfile = {
  code: "bg",
  iso6393: "bul",
  // 30-letter Bulgarian alphabet. Has и й щ ъ ь (ъ is a full vowel); lacks ё ы э
  // і ї є ґ ў. `ъ` is shared with ru — inert between {ru, bg}; the word rungs
  // decide, exactly the mechanism `be` relies on for its shared letters.
  alphabet: "абвгдежзийклмнопрстуфхцчшщъьюя",
  words: {
    // Bulgarian-distinctive grammatical markers. Shared forms are omitted.
    function: [
      "ще",
      "съм",
      "това",
      "този",
      "тази",
      "който",
      "която",
      "което",
      "които",
      "защото",
      "също",
      "тя",
      "ние",
      "вие",
    ],
    frequent: FREQUENT_GENERATED["bg"] ?? BG_FREQUENT,
  },
};

const en: LanguageProfile = {
  code: "en",
  iso6393: "eng",
  alphabet: "abcdefghijklmnopqrstuvwxyz",
  words: {
    function: [
      "the",
      "and",
      "or",
      "but",
      "of",
      "to",
      "in",
      "on",
      "at",
      "is",
      "are",
      "was",
      "were",
      "this",
      "that",
      "for",
      "with",
      "you",
      "we",
      "they",
      "he",
      "she",
      "it",
      "his",
      "her",
      "what",
      "how",
      "when",
      "where",
      "why",
      "who",
      "which",
      "a",
      "an",
      "i",
      "my",
      "your",
    ],
    frequent: FREQUENT_GENERATED["en"] ?? [],
  },
};

const sr: LanguageProfile = {
  code: "sr",
  iso6393: "srp",
  // Serbian Cyrillic azbuka (Вук), 30 letters. Distinctive vs the other Cyrillic
  // profiles: ђ ћ (sr-only) and ј љ њ џ (shared with mk, inert between them; the
  // word rungs decide sr↔mk). No ё й щ ъ ы ь э ю я.
  alphabet: "абвгдђежзијклљмнњопрстћуфхцчџш",
  words: {
    // Serbian-distinctive grammatical markers. `сам` (I am) is omitted: it
    // collides with Macedonian `сам` ("alone"). Shared forms with mk (и, да, се,
    // не, на, само, …) are omitted so set-difference is not cancelled to nothing.
    // The future markers use ћ, a letter no other profile has.
    function: [
      "је",
      "су",
      "али",
      "ће",
      "ћемо",
      "ћеш",
      "због",
      "јер",
      "овај",
      "када",
      "увек",
      "сада",
    ],
    // Hand-curated Cyrillic fallback — see SR_FREQUENT. Flagged for review.
    frequent: FREQUENT_GENERATED["sr"] ?? SR_FREQUENT,
  },
};

const mk: LanguageProfile = {
  code: "mk",
  iso6393: "mkd",
  // Macedonian alphabet, 31 letters. Distinctive: ѓ ќ ѕ (mk-only) plus ј љ њ џ
  // (shared with sr). No ё й щ ъ ы ь э ю я, no ђ ћ (those are Serbian).
  alphabet: "абвгдѓежзѕијклљмнњопрстќуфхцчџш",
  words: {
    // Macedonian-distinctive grammatical markers. The future particle `ќе` and
    // `зошто`/`затоа` use ќ (mk-only); the clitics `го`/`ги` and `сум` (I am) are
    // distinctively Macedonian. Forms shared with sr (и, да, се, не, само, …) are
    // omitted; `вие`/`ние` are omitted as they collide with bg.
    function: [
      "го",
      "ги",
      "сум",
      "ќе",
      "дека",
      "зошто",
      "затоа",
      "тоа",
      "оваа",
      "овој",
      "тој",
      "таа",
      "тие",
      "сега",
      "сите",
    ],
    frequent: FREQUENT_GENERATED["mk"] ?? [],
  },
};

const kk: LanguageProfile = {
  code: "kk",
  iso6393: "kaz",
  // Kazakh Cyrillic, 42 letters (post-1940). Distinctive Turkic letters ә ғ қ ң
  // ө ұ ү һ і set it apart from every Slavic profile; it keeps the Russian set
  // (и й ё ц щ ъ ы ь э ю я) for loanwords. Highly distinctive, so low-risk.
  alphabet: "аәбвгғдеёжзийкқлмнңоөпрстуұүфхһцчшщъыіьэюя",
  words: {
    // Kazakh function words — no overlap with any Slavic profile, so every form
    // is safely distinctive. (`ма`/`ба`/`бе`/`па` interrogative particles are
    // omitted: too short and ambiguous against Slavic two-letter clitics.)
    function: [
      "мен",
      "сен",
      "бұл",
      "және",
      "бар",
      "жоқ",
      "ол",
      "үшін",
      "оны",
      "менің",
      "сенің",
      "оның",
      "бірақ",
      "егер",
      "сол",
      "осы",
      "біз",
      "сіз",
      "олар",
      "қайда",
      "неге",
      "себебі",
      "қандай",
      "мұнда",
      "деп",
      "ғой",
    ],
    // Corpus-derived from the smaller `kk_full.txt` (no curated kk_50k exists).
    frequent: FREQUENT_GENERATED["kk"] ?? [],
  },
};

export { uk, ru, be, bg, en, sr, mk, kk };

/** Registry of shipped profiles, keyed by BCP-47 code. */
export const PROFILES: Readonly<Record<LanguageCode, LanguageProfile>> = {
  uk,
  ru,
  be,
  bg,
  en,
  sr,
  mk,
  kk,
};

/** BCP-47 codes for which langtell ships a ready-made {@link LanguageProfile}.
 *  Handy for narrowing a caller's roster to codes that can actually classify —
 *  e.g. `codes.filter(hasProfile)`. Derived from {@link PROFILES}. */
export const PROFILED_CODES: readonly LanguageCode[] = Object.keys(PROFILES);

/** Whether langtell ships a ready-made {@link LanguageProfile} for `code`. An
 *  own-property check, so inherited names (`"toString"`, `"constructor"`) read
 *  as absent. */
export function hasProfile(code: LanguageCode): boolean {
  return Object.prototype.hasOwnProperty.call(PROFILES, code);
}

/** Resolve profiles for the given codes, skipping any without a shipped profile. */
export function getProfiles(codes: readonly LanguageCode[]): LanguageProfile[] {
  return codes.map((c) => PROFILES[c]).filter((p): p is LanguageProfile => p !== undefined);
}
