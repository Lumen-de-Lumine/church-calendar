/**
 * `ordinalize_full` 1.5.0 port — the hyphenated forms `spell_out_ordinals`
 * actually produces (`n.ordinalize_in_full.gsub(' ', '-')`).
 *
 * The expected values below were dumped out of the gem inside
 * `sourceandsummit/church-calendar-api:2.7.0` on 2026-09-18:
 *
 *     docker run --rm sourceandsummit/church-calendar-api:2.7.0 \
 *       bash -lc 'cat $(gem contents ordinalize_full | grep -v spec)'
 */

import { spellOutOrdinals, titleIncludesQuery } from '../../src/api/calendar-facade.js';
import { ORDINALIZE_MAX, ORDINALIZE_MIN, ordinalizeInFull } from '../../src/api/ordinalize-full.js';
import { OrdinalizeError } from '../../src/api/errors.js';
import { i18n } from '../../src/core/i18n.js';

/** `n.ordinalize_in_full.gsub(' ', '-')` for n = 1..100, locale :en. */
const EN_HYPHENATED: readonly string[] = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth",
  "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth",
  "seventeenth", "eighteenth", "nineteenth", "twentieth", "twenty-first", "twenty-second",
  "twenty-third", "twenty-fourth", "twenty-fifth", "twenty-sixth", "twenty-seventh",
  "twenty-eighth", "twenty-ninth", "thirtieth", "thirty-first", "thirty-second",
  "thirty-third", "thirty-fourth", "thirty-fifth", "thirty-sixth", "thirty-seventh",
  "thirty-eighth", "thirty-ninth", "fortieth", "forty-first", "forty-second", "forty-third",
  "forty-fourth", "forty-fifth", "forty-sixth", "forty-seventh", "forty-eighth", "forty-ninth",
  "fiftieth", "fifty-first", "fifty-second", "fifty-third", "fifty-fourth", "fifty-fifth",
  "fifty-sixth", "fifty-seventh", "fifty-eighth", "fifty-ninth", "sixtieth", "sixty-first",
  "sixty-second", "sixty-third", "sixty-fourth", "sixty-fifth", "sixty-sixth", "sixty-seventh",
  "sixty-eighth", "sixty-ninth", "seventieth", "seventy-first", "seventy-second",
  "seventy-third", "seventy-fourth", "seventy-fifth", "seventy-sixth", "seventy-seventh",
  "seventy-eighth", "seventy-ninth", "eightieth", "eighty-first", "eighty-second",
  "eighty-third", "eighty-fourth", "eighty-fifth", "eighty-sixth", "eighty-seventh",
  "eighty-eighth", "eighty-ninth", "ninetieth", "ninety-first", "ninety-second",
  "ninety-third", "ninety-fourth", "ninety-fifth", "ninety-sixth", "ninety-seventh",
  "ninety-eighth", "ninety-ninth", "one-hundredth",
];

const FR_HYPHENATED: readonly string[] = [
  "premier", "deuxième", "troisième", "quatrième", "cinquième", "sixième", "septième",
  "huitième", "neuvième", "dixième", "onzième", "douzième", "treizième", "quatorzième",
  "quinzième", "seizième", "dix-septième", "dix-huitième", "dix-neuvième", "vingtième",
  "vingt-et-unième", "vingt-deuxième", "vingt-troisième", "vingt-quatrième", "vingt-cinquième",
  "vingt-sixième", "vingt-septième", "vingt-huitième", "vingt-neuvième", "trentième",
  "trente-et-unième", "trente-deuxième", "trente-troisième", "trente-quatrième",
  "trente-cinquième", "trente-sixième", "trente-septième", "trente-huitième",
  "trente-neuvième", "quarantième", "quarante-et-unième", "quarante-deuxième",
  "quarante-troisième", "quarante-quatrième", "quarante-cinquième", "quarante-sixième",
  "quarante-septième", "quarante-huitième", "quarante-neuvième", "cinquantième",
  "cinquante-et-unième", "cinquante-deuxième", "cinquante-troisième", "cinquante-quatrième",
  "cinquante-cinquième", "cinquante-sixième", "cinquante-septième", "cinquante-huitième",
  "cinquante-neuvième", "soixantième", "soixante-et-unième", "soixante-deuxième",
  "soixante-troisième", "soixante-quatrième", "soixante-cinquième", "soixante-sixième",
  "soixante-septième", "soixante-huitième", "soixante-neuvième", "soixante-dixième",
  "soixante-et-onzième", "soixante-douzième", "soixante-treizième", "soixante-quatorzième",
  "soixante-quinzième", "soixante-seizième", "soixante-dix-septième", "soixante-dix-huitième",
  "soixante-dix-neuvième", "quatre-vingtième", "quatre-vingt-unième", "quatre-vingt-deuxième",
  "quatre-vingt-troisième", "quatre-vingt-quatrième", "quatre-vingt-cinquième",
  "quatre-vingt-sixième", "quatre-vingt-septième", "quatre-vingt-huitième",
  "quatre-vingt-neuvième", "quatre-vingt-dixième", "quatre-vingt-onzième",
  "quatre-vingt-douzième", "quatre-vingt-treizième", "quatre-vingt-quatorzième",
  "quatre-vingt-quinzième", "quatre-vingt-seizième", "quatre-vingt-dix-septième",
  "quatre-vingt-dix-huitième", "quatre-vingt-dix-neuvième", "centième",
];

const IT_HYPHENATED: readonly string[] = [
  "primo", "secondo", "terzo", "quarto", "quinto", "sesto", "settimo", "ottavo", "nono",
  "decimo", "undicesimo", "dodicesimo", "tredicesimo", "quattordicesimo", "quindicesimo",
  "sedicesimo", "diciassettesimo", "diciottesimo", "diciannovesimo", "ventesimo",
  "ventunesimo", "ventiduesima", "ventitreesima", "ventiquattresimo", "venticinque",
  "ventiseisima", "ventisettesimo", "ventiottesimo", "ventinovesimo", "trentesimo",
  "trentunesimo", "trentiduesima", "trentitreesime", "trentiquattresimo", "trenticinquesima",
  "trentiseisime", "trentisettesime", "trentiottesima", "trentinovesima", "quarantesimo",
  "quarantunesima", "quarantiduesime", "quarantitreesimo", "quarantiquattresimo",
  "quaranticinquesima", "quarantiseisime", "quarantisettesima", "quarantiottesimo",
  "quarantinovesima", "cinquantesimo", "cinquantunesima", "cinquantiduesimo",
  "cinquantitreesime", "cinquantiquattresimo", "cinquanticinquesima", "cinquantiseisimo",
  "cinquantisettesime", "cinquantiottesime", "cinquantinovesima", "sessantesimo",
  "sessantunesimo", "sessantiduesima", "sessantitreesima", "sessantiquattresime",
  "sessanticinquesime", "sessantiseisimo", "sessantisettesima", "sessantiottesimo",
  "sessantinovesime", "settantesimo", "settantunesime", "settantiduesime", "settantitreesime",
  "settantiquattresima", "settanticinquesime", "settantiseisimo", "settantisettesima",
  "settantiottesime", "settantinovesime", "ottantesimo", "ottantunesime", "ottantiduesimo",
  "ottantitreesima", "ottantiquattresimo", "ottanticinquesime", "ottantiseisima",
  "ottantisettesime", "ottantiottesimo", "ottantinovesimo", "novantesimo", "novantunesimo",
  "novantiduesimo", "novantitreesima", "novantiquattresime", "novanticinquesima",
  "novantiseisima", "novantisettesimo", "novantiottesimo", "novantinovesime", "centesimo",
];

describe('ordinalizeInFull', () => {
  it('covers 1..100 in English, hyphenated exactly like the gem', () => {
    const got = Array.from({ length: 100 }, (_, i) =>
      ordinalizeInFull(i + 1, 'en').split(' ').join('-'),
    );
    expect(got).toEqual(EN_HYPHENATED);
  });

  it('the examples the spec calls out', () => {
    expect(ordinalizeInFull(33, 'en').split(' ').join('-')).toBe('thirty-third');
    expect(ordinalizeInFull(21, 'en').split(' ').join('-')).toBe('twenty-first');
    expect(ordinalizeInFull(1, 'en')).toBe('first');
    expect(ordinalizeInFull(100, 'en').split(' ').join('-')).toBe('one-hundredth');
  });

  it('French and Italian tables, verbatim (including the gem typos)', () => {
    expect(Array.from({ length: 100 }, (_, i) => ordinalizeInFull(i + 1, 'fr').split(' ').join('-')))
      .toEqual(FR_HYPHENATED);
    expect(Array.from({ length: 100 }, (_, i) => ordinalizeInFull(i + 1, 'it').split(' ').join('-')))
      .toEqual(IT_HYPHENATED);
    // The Italian file really does say this.
    expect(ordinalizeInFull(25, 'it')).toBe('venticinque');
    expect(ordinalizeInFull(22, 'it')).toBe('ventiduesima');
  });

  it('cs and la have no table and fall back to English (I18n::Backend::Fallbacks)', () => {
    expect(ordinalizeInFull(24, 'la')).toBe('twenty fourth');
    expect(ordinalizeInFull(24, 'cs')).toBe('twenty fourth');
  });

  it('follows the ambient i18n locale, like Ruby', () => {
    expect(i18n.withLocale('fr', () => ordinalizeInFull(1))).toBe('premier');
    expect(i18n.withLocale('it', () => ordinalizeInFull(1))).toBe('primo');
    expect(i18n.withLocale('en', () => ordinalizeInFull(1))).toBe('first');
  });

  it('RAISES outside 1..100, exactly as the gem does', () => {
    // 101.ordinalize_in_full -> NotImplementedError: Unknown locale en.
    // There is NO "one-hundred-and-first" in ordinalize_full 1.5.0.
    expect(ORDINALIZE_MIN).toBe(1);
    expect(ORDINALIZE_MAX).toBe(100);
    for (const n of [0, -1, 101, 110, 199, 1000]) {
      expect(() => ordinalizeInFull(n, 'en')).toThrow(OrdinalizeError);
    }
    expect(() => ordinalizeInFull(101, 'en')).toThrow('Unknown locale en');
  });
});

describe('spellOutOrdinals', () => {
  it('rewrites only the FIRST ordinal in the string (BASELINE defect D)', () => {
    expect(spellOutOrdinals('the 2nd sunday, 3rd day')).toBe('the second sunday, 3rd day');
  });

  it('but `gsub` with a String replaces every literal occurrence of that token', () => {
    expect(spellOutOrdinals('2nd 2nd')).toBe('second second');
  });

  it('leaves a string with no ordinal alone', () => {
    expect(spellOutOrdinals('no ordinals here')).toBe('no ordinals here');
    expect(spellOutOrdinals('')).toBe('');
  });

  it('honours the word boundary', () => {
    expect(spellOutOrdinals('x2nd')).toBe('x2nd');
  });

  it('the real titles', () => {
    expect(spellOutOrdinals('24th week in ordinary time')).toBe('twenty-fourth week in ordinary time');
    expect(spellOutOrdinals('1st sunday of advent')).toBe('first sunday of advent');
    expect(spellOutOrdinals('33rd week')).toBe('thirty-third week');
    expect(spellOutOrdinals('11th')).toBe('eleventh');
  });

  it('propagates the gem failure for an ordinal above 100', () => {
    expect(() => spellOutOrdinals('112th day')).toThrow(OrdinalizeError);
    expect(() => spellOutOrdinals('a 101st thing')).toThrow(OrdinalizeError);
  });
});

describe('titleIncludesQuery', () => {
  it('matches the raw title and the spelled-out one', () => {
    expect(titleIncludesQuery('33rd Sunday in Ordinary Time', '33rd')).toBe(true);
    expect(titleIncludesQuery('33rd Sunday in Ordinary Time', 'thirty-third')).toBe(true);
    expect(titleIncludesQuery('33rd Sunday in Ordinary Time', 'thirty third')).toBe(false);
  });

  it('is case-insensitive on both sides', () => {
    expect(titleIncludesQuery('1st Sunday of Advent', 'ADVENT')).toBe(true);
    expect(titleIncludesQuery('1st Sunday of Advent', 'advent')).toBe(true);
  });

  it('is Unicode-naive: U+2019 is not U+0027 (BASELINE defect C)', () => {
    expect(titleIncludesQuery('Thursday of the Lord\u2019s Supper', "'")).toBe(false);
    expect(titleIncludesQuery('Thursday of the Lord\u2019s Supper', '\u2019')).toBe(true);
  });

  it('an empty query matches everything', () => {
    expect(titleIncludesQuery('anything at all', '')).toBe(true);
  });
});
