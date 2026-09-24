// ruby: lib/calendarium-romanum/temporale/dates.rb

import { CalDate } from '../cal-date.js';

/** ruby: `Temporale::WEEK` */
export const WEEK = 7;

/** Ruby's `Integer#/` floors; JavaScript's `/` does not. */
function idiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Ruby's `Integer#%` is a floored modulo and never returns a negative value. */
function imod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** @param weekday 0 = Sunday .. 6 = Saturday */
function weekdayBefore(weekday: number, date: CalDate): CalDate {
  if (date.wday === weekday) return date.addDays(-WEEK);
  if (weekday < date.wday) return date.addDays(-(date.wday - weekday));
  return date.addDays(-(date.wday + WEEK - weekday));
}

/** @param weekday 0 = Sunday .. 6 = Saturday */
function weekdayAfter(weekday: number, date: CalDate): CalDate {
  if (date.wday === weekday) return date.addDays(WEEK);
  if (weekday > date.wday) return date.addDays(weekday - date.wday);
  return date.addDays(WEEK - date.wday + weekday);
}

export interface SundayOption {
  sunday?: boolean;
}

/**
 * Computes dates of movable feasts and provides utilities for common
 * computations of relative dates.
 *
 * Every `year` argument is the civil year in which the **liturgical** year begins.
 */
export const Dates = {
  weekdayBefore,
  weekdayAfter,

  /** ruby: `Dates.octave_of` */
  octaveOf(date: CalDate): CalDate {
    return date.addDays(WEEK);
  },

  sundayBefore: (date: CalDate): CalDate => weekdayBefore(0, date),
  mondayBefore: (date: CalDate): CalDate => weekdayBefore(1, date),
  tuesdayBefore: (date: CalDate): CalDate => weekdayBefore(2, date),
  wednesdayBefore: (date: CalDate): CalDate => weekdayBefore(3, date),
  thursdayBefore: (date: CalDate): CalDate => weekdayBefore(4, date),
  fridayBefore: (date: CalDate): CalDate => weekdayBefore(5, date),
  saturdayBefore: (date: CalDate): CalDate => weekdayBefore(6, date),

  sundayAfter: (date: CalDate): CalDate => weekdayAfter(0, date),
  mondayAfter: (date: CalDate): CalDate => weekdayAfter(1, date),
  tuesdayAfter: (date: CalDate): CalDate => weekdayAfter(2, date),
  wednesdayAfter: (date: CalDate): CalDate => weekdayAfter(3, date),
  thursdayAfter: (date: CalDate): CalDate => weekdayAfter(4, date),
  fridayAfter: (date: CalDate): CalDate => weekdayAfter(5, date),
  saturdayAfter: (date: CalDate): CalDate => weekdayAfter(6, date),

  firstAdventSunday(year: number): CalDate {
    return Dates.sundayBefore(Dates.nativity(year)).addDays(-3 * WEEK);
  },

  nativity(year: number): CalDate {
    return new CalDate(year, 12, 25);
  },

  holyFamily(year: number): CalDate {
    const xmas = Dates.nativity(year);
    if (xmas.isSunday()) {
      return new CalDate(year, 12, 30);
    }
    return Dates.sundayAfter(xmas);
  },

  motherOfGod(year: number): CalDate {
    return Dates.octaveOf(Dates.nativity(year));
  },

  /** @param opts `sunday: true` transfers Epiphany to a Sunday (GNLYC 7 a). */
  epiphany(year: number, opts: SundayOption = {}): CalDate {
    if (opts.sunday) {
      return Dates.sundayAfter(new CalDate(year + 1, 1, 1));
    }
    return new CalDate(year + 1, 1, 6);
  },

  /** GNLYC 38 — note the `e.mday > 6` test. */
  baptismOfLord(year: number, opts: { epiphanyOnSunday?: boolean } = {}): CalDate {
    const e = Dates.epiphany(year, { sunday: opts.epiphanyOnSunday ?? false });
    if (e.day > 6) {
      return e.addDays(1);
    }
    return Dates.sundayAfter(e);
  },

  ashWednesday(year: number): CalDate {
    return Dates.easterSunday(year).addDays(-(6 * WEEK + 4));
  },

  /**
   * Algorithm taken verbatim from the `easter` gem
   * (https://github.com/jrobertson/easter) via calendarium-romanum.
   * Ruby's floored integer division and floored modulo are preserved.
   */
  easterSunday(liturgicalYear: number): CalDate {
    const year = liturgicalYear + 1;

    const goldenNumber = imod(year, 19) + 1;
    let dominicalNumber = imod(year + idiv(year, 4) - idiv(year, 100) + idiv(year, 400), 7);
    const solarCorrection = idiv(year - 1600, 100) - idiv(year - 1600, 400);
    const lunarCorrection = idiv(idiv(year - 1400, 100) * 8, 25);
    let paschalFullMoon = imod(3 - 11 * goldenNumber + solarCorrection - lunarCorrection, 30);

    while (dominicalNumber <= 0) dominicalNumber += 7;
    while (paschalFullMoon <= 0) paschalFullMoon += 30;
    if (paschalFullMoon === 29 || (paschalFullMoon === 28 && goldenNumber > 11)) {
      paschalFullMoon -= 1;
    }

    let difference = imod(4 - paschalFullMoon - dominicalNumber, 7);
    if (difference < 0) difference += 7; // ruby: dead code, `%` already floors
    const dayEaster = paschalFullMoon + difference + 1;

    if (dayEaster < 11) {
      return new CalDate(year, 3, dayEaster + 21); // Easter occurs in March
    }
    return new CalDate(year, 4, dayEaster - 10); // Easter occurs in April
  },

  palmSunday(year: number): CalDate {
    return Dates.easterSunday(year).addDays(-7);
  },

  holyThursday(year: number): CalDate {
    return Dates.easterSunday(year).addDays(-3);
  },

  goodFriday(year: number): CalDate {
    return Dates.easterSunday(year).addDays(-2);
  },

  holySaturday(year: number): CalDate {
    return Dates.easterSunday(year).addDays(-1);
  },

  /** @param opts `sunday: true` transfers the Ascension to a Sunday (GNLYC 7 b). */
  ascension(year: number, opts: SundayOption = {}): CalDate {
    if (opts.sunday) {
      return Dates.easterSunday(year).addDays(6 * WEEK);
    }
    return Dates.pentecost(year).addDays(-10);
  },

  pentecost(year: number): CalDate {
    return Dates.easterSunday(year).addDays(7 * WEEK);
  },

  holyTrinity(year: number): CalDate {
    return Dates.octaveOf(Dates.pentecost(year));
  },

  /** @param opts `sunday: true` transfers Corpus Christi to a Sunday (GNLYC 7 c). */
  corpusChristi(year: number, opts: SundayOption = {}): CalDate {
    if (opts.sunday) {
      return Dates.holyTrinity(year).addDays(WEEK);
    }
    return Dates.holyTrinity(year).addDays(4);
  },

  sacredHeart(year: number): CalDate {
    return Dates.corpusChristi(year).addDays(8);
  },

  motherOfChurch(year: number): CalDate {
    return Dates.pentecost(year).addDays(1);
  },

  immaculateHeart(year: number): CalDate {
    return Dates.pentecost(year).addDays(20);
  },

  christKing(year: number): CalDate {
    return Dates.firstAdventSunday(year + 1).addDays(-7);
  },
};
