// ruby: the `ordinalize_full` gem, version 1.5.0 (lib/ordinalize_full.rb and
//       lib/ordinalize_full/locales/*.yml), pulled in by
//       lib/church-calendar/services/calendar_facade.rb via
//       `require 'ordinalize_full/integer'`.
//
// The gem is nothing but an i18n lookup of `ordinalize_full.n_<number>`, so the
// tables below are the gem's own YAML, verbatim -- including the Italian file's
// erratic endings (`venticinque` for 25, `ventiduesima` for 22) and the French
// `vingt-et-unieme`. Do not "correct" them: `spell_out_ordinals` feeds the result
// straight into the search comparison, so a corrected word changes which days a
// query matches.
//
// LIMITS -- verified inside sourceandsummit/church-calendar-api:2.7.0 on
// 2026-09-18: the gem ships `n_1` .. `n_100` only. `I18n.t(..., throw: true)` for
// anything outside that range throws `:exception`, which surfaces as an
// `UncaughtThrowError` (an `ArgumentError`), which the gem rescues and re-raises
// as `NotImplementedError: Unknown locale <locale>`. So `101.ordinalize_in_full`
// RAISES; there is no "one hundred first" in this gem, and a title containing
// `101st` would 502 the Ruby service. This port reproduces that (see
// docs/QUIRKS.md Q20).
//
// Locale coverage: the gem ships en, es, fr, it and nl. The API's accepted langs
// are cs, en, fr, it and la; `es` is not accepted. `cs` and `la` have no
// ordinalize_full table, and church-calendar-api mixes `I18n::Backend::Fallbacks`
// into the Simple backend, so they fall back to `:en` -- verified: with
// `I18n.locale = :la`, `24.ordinalize_in_full` is "twenty fourth".

import { i18n } from '../core/i18n.js';
import { OrdinalizeError } from './errors.js';

/** `ordinalize_full/locales/en.yml`, `n_1` .. `n_100`. */
const EN: readonly string[] = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
  "eighteenth", "nineteenth", "twentieth", "twenty first", "twenty second", "twenty third",
  "twenty fourth", "twenty fifth", "twenty sixth", "twenty seventh", "twenty eighth",
  "twenty ninth", "thirtieth", "thirty first", "thirty second", "thirty third", "thirty fourth",
  "thirty fifth", "thirty sixth", "thirty seventh", "thirty eighth", "thirty ninth", "fortieth",
  "forty first", "forty second", "forty third", "forty fourth", "forty fifth", "forty sixth",
  "forty seventh", "forty eighth", "forty ninth", "fiftieth", "fifty first", "fifty second",
  "fifty third", "fifty fourth", "fifty fifth", "fifty sixth", "fifty seventh", "fifty eighth",
  "fifty ninth", "sixtieth", "sixty first", "sixty second", "sixty third", "sixty fourth",
  "sixty fifth", "sixty sixth", "sixty seventh", "sixty eighth", "sixty ninth", "seventieth",
  "seventy first", "seventy second", "seventy third", "seventy fourth", "seventy fifth",
  "seventy sixth", "seventy seventh", "seventy eighth", "seventy ninth", "eightieth",
  "eighty first", "eighty second", "eighty third", "eighty fourth", "eighty fifth",
  "eighty sixth", "eighty seventh", "eighty eighth", "eighty ninth", "ninetieth", "ninety first",
  "ninety second", "ninety third", "ninety fourth", "ninety fifth", "ninety sixth",
  "ninety seventh", "ninety eighth", "ninety ninth", "one hundredth",
];

/** `ordinalize_full/locales/fr.yml`, `n_1` .. `n_100`. */
const FR: readonly string[] = [
  "premier", "deuxième", "troisième", "quatrième", "cinquième", "sixième", "septième",
  "huitième", "neuvième", "dixième", "onzième", "douzième", "treizième", "quatorzième",
  "quinzième", "seizième", "dix-septième", "dix-huitième", "dix-neuvième", "vingtième",
  "vingt-et-unième", "vingt-deuxième", "vingt-troisième", "vingt-quatrième", "vingt-cinquième",
  "vingt-sixième", "vingt-septième", "vingt-huitième", "vingt-neuvième", "trentième",
  "trente-et-unième", "trente-deuxième", "trente-troisième", "trente-quatrième",
  "trente-cinquième", "trente-sixième", "trente-septième", "trente-huitième", "trente-neuvième",
  "quarantième", "quarante-et-unième", "quarante-deuxième", "quarante-troisième",
  "quarante-quatrième", "quarante-cinquième", "quarante-sixième", "quarante-septième",
  "quarante-huitième", "quarante-neuvième", "cinquantième", "cinquante-et-unième",
  "cinquante-deuxième", "cinquante-troisième", "cinquante-quatrième", "cinquante-cinquième",
  "cinquante-sixième", "cinquante-septième", "cinquante-huitième", "cinquante-neuvième",
  "soixantième", "soixante-et-unième", "soixante-deuxième", "soixante-troisième",
  "soixante-quatrième", "soixante-cinquième", "soixante-sixième", "soixante-septième",
  "soixante-huitième", "soixante-neuvième", "soixante-dixième", "soixante-et-onzième",
  "soixante-douzième", "soixante-treizième", "soixante-quatorzième", "soixante-quinzième",
  "soixante-seizième", "soixante-dix-septième", "soixante-dix-huitième", "soixante-dix-neuvième",
  "quatre-vingtième", "quatre-vingt-unième", "quatre-vingt-deuxième", "quatre-vingt-troisième",
  "quatre-vingt-quatrième", "quatre-vingt-cinquième", "quatre-vingt-sixième",
  "quatre-vingt-septième", "quatre-vingt-huitième", "quatre-vingt-neuvième",
  "quatre-vingt-dixième", "quatre-vingt-onzième", "quatre-vingt-douzième",
  "quatre-vingt-treizième", "quatre-vingt-quatorzième", "quatre-vingt-quinzième",
  "quatre-vingt-seizième", "quatre-vingt-dix-septième", "quatre-vingt-dix-huitième",
  "quatre-vingt-dix-neuvième", "centième",
];

/** `ordinalize_full/locales/it.yml`, `n_1` .. `n_100`. */
const IT: readonly string[] = [
  "primo", "secondo", "terzo", "quarto", "quinto", "sesto", "settimo", "ottavo", "nono",
  "decimo", "undicesimo", "dodicesimo", "tredicesimo", "quattordicesimo", "quindicesimo",
  "sedicesimo", "diciassettesimo", "diciottesimo", "diciannovesimo", "ventesimo", "ventunesimo",
  "ventiduesima", "ventitreesima", "ventiquattresimo", "venticinque", "ventiseisima",
  "ventisettesimo", "ventiottesimo", "ventinovesimo", "trentesimo", "trentunesimo",
  "trentiduesima", "trentitreesime", "trentiquattresimo", "trenticinquesima", "trentiseisime",
  "trentisettesime", "trentiottesima", "trentinovesima", "quarantesimo", "quarantunesima",
  "quarantiduesime", "quarantitreesimo", "quarantiquattresimo", "quaranticinquesima",
  "quarantiseisime", "quarantisettesima", "quarantiottesimo", "quarantinovesima",
  "cinquantesimo", "cinquantunesima", "cinquantiduesimo", "cinquantitreesime",
  "cinquantiquattresimo", "cinquanticinquesima", "cinquantiseisimo", "cinquantisettesime",
  "cinquantiottesime", "cinquantinovesima", "sessantesimo", "sessantunesimo", "sessantiduesima",
  "sessantitreesima", "sessantiquattresime", "sessanticinquesime", "sessantiseisimo",
  "sessantisettesima", "sessantiottesimo", "sessantinovesime", "settantesimo", "settantunesime",
  "settantiduesime", "settantitreesime", "settantiquattresima", "settanticinquesime",
  "settantiseisimo", "settantisettesima", "settantiottesime", "settantinovesime", "ottantesimo",
  "ottantunesime", "ottantiduesimo", "ottantitreesima", "ottantiquattresimo",
  "ottanticinquesime", "ottantiseisima", "ottantisettesime", "ottantiottesimo",
  "ottantinovesimo", "novantesimo", "novantunesimo", "novantiduesimo", "novantitreesima",
  "novantiquattresime", "novanticinquesima", "novantiseisima", "novantisettesimo",
  "novantiottesimo", "novantinovesime", "centesimo",
];

/** Locales with their own table; everything else falls back to `en` (Q11). */
const TABLES: Readonly<Record<string, readonly string[]>> = { en: EN, fr: FR, it: IT };

/** Lowest number the gem can spell out. */
export const ORDINALIZE_MIN = 1;
/** Highest number the gem can spell out. */
export const ORDINALIZE_MAX = 100;

/**
 * ruby: `Integer#ordinalize_in_full` for the non-`:es` branch, i.e.
 * `I18n.t("ordinalize_full.n_<n>", throw: true)`.
 *
 * @param n the number to spell out
 * @param locale defaults to the current i18n locale, exactly like Ruby
 * @throws {OrdinalizeError} for `n` outside 1..100 (ruby: `NotImplementedError`)
 */
export function ordinalizeInFull(n: number, locale: string = i18n.locale): string {
  const table = TABLES[locale] ?? EN;
  if (!Number.isInteger(n) || n < ORDINALIZE_MIN || n > ORDINALIZE_MAX) {
    throw new OrdinalizeError(locale);
  }
  return table[n - 1];
}
