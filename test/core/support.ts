// Shared helpers for the src/core unit tests (ported from calendarium-romanum's
// spec/spec_helper.rb).

import { CalDate } from '../../src/core/cal-date.js';
import { Data } from '../../src/core/data.js';
import type { Celebration, Day } from '../../src/core/day.js';
import { i18n } from '../../src/core/i18n.js';
import type { Locale } from '../../src/core/i18n.js';
import { PerpetualCalendar } from '../../src/core/perpetual-calendar.js';
import type { Sanctorale } from '../../src/core/sanctorale.js';
import { SanctoraleFactory } from '../../src/core/sanctorale-factory.js';
import { ThanksgivingUS } from '../../src/core/temporale/extensions/index.js';

/** `Date.new(y, m, d)` */
export function d(year: number, month: number, day: number): CalDate {
  return new CalDate(year, month, day);
}

/** ruby: the `have_translation` matcher — a string that is present and translated. */
export function isTranslated(value: string | null): boolean {
  return value !== null && value !== '' && !value.includes('translation missing');
}

/** Runs `fn` with the given locale, restoring the previous one afterwards. */
export function withLocale<T>(locale: Locale, fn: () => T): T {
  return i18n.withLocale(locale, fn);
}

let generalRomanEnglish: Sanctorale | null = null;

/** `CR::Data::GENERAL_ROMAN_ENGLISH.load`, memoized (parsing is not free). */
export function generalRomanEnglishSanctorale(): Sanctorale {
  if (generalRomanEnglish === null) {
    generalRomanEnglish = Data.GENERAL_ROMAN_ENGLISH.load();
  }
  return generalRomanEnglish;
}

/** A *fresh* General Roman (English) sanctorale, for tests that mutate it. */
export function freshGeneralRomanEnglish(): Sanctorale {
  return Data.GENERAL_ROMAN_ENGLISH.load();
}

let usCalendar: PerpetualCalendar | null = null;

/**
 * The `us` calendar exactly as church-calendar-api's CalendarRepository builds it
 * from config/calendars.yml: universal-en + us-en, ThanksgivingUS, and Epiphany /
 * Ascension / Corpus Christi transferred to Sunday.
 */
export function usPerpetualCalendar(): PerpetualCalendar {
  if (usCalendar === null) {
    const sanctorale = SanctoraleFactory.createLayered(
      Data['universal-en'].load(),
      Data['us-en'].load(),
    );
    usCalendar = new PerpetualCalendar({
      sanctorale,
      temporaleOptions: {
        extensions: [ThanksgivingUS],
        transferToSunday: ['epiphany', 'ascension', 'corpus_christi'],
      },
    });
  }
  return usCalendar;
}

/** How the api layer asks for a day: `vespers: true, vigils: true`. */
export function usDay(year: number, month: number, day: number): Day {
  return usPerpetualCalendar().day(d(year, month, day), { vespers: true, vigils: true });
}

/** A compact, comparable description of a celebration. */
export function describeCelebration(c: Celebration): {
  title: string;
  colour: string;
  rank: string | null;
  rank_num: number;
  id: string | null;
} {
  return {
    title: c.title,
    colour: c.colour.symbol,
    rank: c.rank.shortDesc() ?? c.rank.desc(),
    rank_num: c.rank.priority,
    id: c.symbol,
  };
}
