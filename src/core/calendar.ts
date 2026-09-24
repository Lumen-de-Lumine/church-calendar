// ruby: lib/calendarium-romanum/calendar.rb

import { CalDate, DateRange } from './cal-date.js';
import { Celebration, Day } from './day.js';
import {
  lectionaryCycleFerial,
  lectionaryCycleSunday,
  lectionaryCyclesForDate,
} from './day.js';
import type { LectionaryCycles } from './day.js';
import type { FerialLectionaryCycle, LectionaryCycle, Season } from './enums.js';
import { Ranks, Seasons } from './enums.js';
import { ArgumentError } from './errors.js';
import { i18n } from './i18n.js';
import { Sanctorale } from './sanctorale.js';
import { Temporale } from './temporale.js';
import { CelebrationFactory } from './temporale/celebration-factory.js';
import { Transfers } from './transfers.js';

export interface CalendarOptions {
  /** Populate {@link Day.vespers}. */
  vespers?: boolean;
  /** Append vigil / evening celebrations to {@link Day.celebrations}. */
  vigils?: boolean;
}

/** Day when the implemented calendar system became effective. */
export const EFFECTIVE_FROM = new CalDate(1970, 1, 1);

function systemNotEffective(): RangeError {
  return new RangeError(
    'Year out of range. Implemented calendar system has been in use only since 1st January 1970.',
  );
}

/**
 * Provides complete information concerning a liturgical year, its days and the
 * celebrations occurring on them.
 *
 * The business logic is mostly about correctly combining information from
 * {@link Temporale} and {@link Sanctorale}.
 */
export class Calendar {
  readonly year: number;
  readonly sanctorale: Sanctorale;
  readonly temporale: Temporale;

  private readonly populateVespers: boolean;
  private readonly populateVigils: boolean;
  private readonly transferred: Transfers;

  /**
   * @throws {RangeError} for a year the implemented calendar system was not in force
   * @throws {ArgumentError} when `temporale.year` does not match `year`
   */
  constructor(
    year: number | Temporale,
    sanctorale?: Sanctorale | null,
    temporale?: Temporale | null,
    opts: CalendarOptions = {},
  ) {
    let resolvedYear: number;
    let resolvedTemporale: Temporale | null = temporale ?? null;

    if (!(typeof year === 'number')) {
      resolvedTemporale = year;
      resolvedYear = year.year;
    } else {
      resolvedYear = year;
    }

    if (resolvedYear < EFFECTIVE_FROM.year - 1) {
      throw systemNotEffective();
    }

    if (resolvedTemporale !== null && resolvedTemporale.year !== resolvedYear) {
      throw new ArgumentError('Temporale year must be the same as year.');
    }

    this.year = resolvedYear;
    this.sanctorale = sanctorale ?? new Sanctorale();
    this.temporale = resolvedTemporale ?? new Temporale(resolvedYear);
    this.populateVespers = opts.vespers ?? false;
    this.populateVigils = opts.vigils ?? false;
    this.transferred = new Transfers(this.temporale, this.sanctorale);
  }

  /** ruby: `Calendar.mk_date` */
  static mkDate(...args: (CalDate | number)[]): CalDate {
    const typeError = new TypeError('Date, DateTime or three Integers expected');

    if (args.length === 3) {
      for (const a of args) {
        if (typeof a !== 'number' || !Number.isInteger(a)) throw typeError;
      }
      return new CalDate(args[0] as number, args[1] as number, args[2] as number);
    }

    if (args.length === 1) {
      const a = args[0];
      if (!(a instanceof CalDate)) throw typeError;
      return a;
    }

    throw typeError;
  }

  /** Creates a new instance for the liturgical year which includes the given date. */
  static forDay(
    date: CalDate,
    sanctorale?: Sanctorale | null,
    temporale?: Temporale | null,
    opts: CalendarOptions = {},
  ): Calendar {
    return new Calendar(Temporale.liturgicalYear(date), sanctorale, temporale, opts);
  }

  static lectionaryCycleSunday(year: number): LectionaryCycle {
    return lectionaryCycleSunday(year);
  }

  static lectionaryCycleFerial(year: number): FerialLectionaryCycle {
    return lectionaryCycleFerial(year);
  }

  static lectionaryCyclesForDate(date: CalDate): LectionaryCycles {
    return lectionaryCyclesForDate(date);
  }

  /** ruby: delegated to `Temporale#range_check` */
  rangeCheck(date: CalDate): void {
    this.temporale.rangeCheck(date);
  }

  /** ruby: delegated to `Temporale#season` */
  season(date: CalDate): Season {
    return this.temporale.season(date);
  }

  populatesVespers(): boolean {
    return this.populateVespers;
  }

  populatesVigils(): boolean {
    return this.populateVigils;
  }

  /** Sunday lectionary cycle. */
  lectionary(): LectionaryCycle {
    return lectionaryCycleSunday(this.year);
  }

  /** Ferial lectionary cycle. */
  ferialLectionary(): FerialLectionaryCycle {
    return lectionaryCycleFerial(this.year);
  }

  /** ruby: `Calendar#[]` */
  at(dateOrRange: CalDate): Day;
  at(dateOrRange: DateRange): Day[];
  at(dateOrRange: CalDate | DateRange): Day | Day[] {
    if (dateOrRange instanceof DateRange) {
      return dateOrRange.map((date) => this.day(date));
    }
    return this.day(dateOrRange);
  }

  /**
   * Retrieve liturgical calendar information for the specified day.
   *
   * @throws {RangeError} for a date outside this liturgical year, or before the
   *   implemented calendar system became effective
   */
  day(date: CalDate, opts?: CalendarOptions): Day;
  day(month: number, day: number, opts?: CalendarOptions): Day;
  day(year: number, month: number, day: number, opts?: CalendarOptions): Day;
  day(...args: unknown[]): Day {
    let opts: CalendarOptions = {};
    const positional = args.slice();
    while (positional.length > 0 && positional[positional.length - 1] === undefined) {
      positional.pop();
    }
    const last = positional[positional.length - 1];
    if (last !== null && typeof last === 'object' && !(last instanceof CalDate)) {
      opts = last as CalendarOptions;
      positional.pop();
    }

    let date: CalDate;
    if (positional.length === 2) {
      const [month, dayOfMonth] = positional as [number, number];
      date = new CalDate(this.year, month, dayOfMonth);
      if (!this.temporale.dateRange().includes(date)) {
        date = new CalDate(this.year + 1, month, dayOfMonth);
      }
    } else {
      date = Calendar.mkDate(...(positional as (CalDate | number)[]));
      this.rangeCheck(date);
    }

    if (date.isBefore(EFFECTIVE_FROM)) {
      throw systemNotEffective();
    }

    const celebrations = this.celebrationsFor(date);
    let vespersCelebration: Celebration | null = null;

    if (this.populateVespers || opts.vespers) {
      try {
        vespersCelebration = this.firstVespersOn(date, celebrations);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        // There is exactly one possible case when range_check(date) passes and
        // range_check(date + 1) fails: the last day of the liturgical year.
        vespersCelebration = CelebrationFactory.firstAdventSunday();
      }
    }

    if (this.populateVigils || opts.vigils) {
      try {
        const vigil = this.vigilOn(date);
        if (vigil !== null) celebrations.push(vigil);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        // ruby: prints "ERROR: range error when generating vigils for date: ..."
        // to stdout; this port swallows it silently.
      }

      try {
        const evening = this.eveningOn(celebrations);
        if (evening !== null) celebrations.push(evening);
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
        // ruby: likewise printed to stdout
      }
    }

    const s = this.temporale.season(date);
    return new Day({
      date,
      season: s,
      seasonWeek: this.temporale.seasonWeek(s, date),
      celebrations,
      vespers: vespersCelebration,
    });
  }

  /** Iterate over the whole liturgical year, day by day. */
  each(fn: (day: Day) => void): void {
    this.temporale.dateRange().each((date) => fn(this.day(date)));
  }

  /** ruby: `Calendar#==` — equal settings mean equal data for equal input. */
  equals(other: unknown): boolean {
    if (!(other instanceof Calendar)) return false;
    return (
      this.year === other.year &&
      this.populatesVespers() === other.populatesVespers() &&
      this.populatesVigils() === other.populatesVigils() &&
      this.temporale.equals(other.temporale) &&
      this.sanctorale.equals(other.sanctorale)
    );
  }

  // --------------------------------------------------------------- internals

  /**
   * ruby: the private `Calendar#celebrations_for`.
   *
   * The branch order is load-bearing; see docs/QUIRKS.md (Q4). The one
   * deliberate deviation: where Ruby returns `@sanctorale[date]` itself, this
   * port returns a copy, so `Calendar#day`'s `celebrations.push(vigil)` cannot
   * corrupt the stored sanctorale data.
   */
  private celebrationsFor(date: CalDate): Celebration[] {
    const tr = this.transferred.get(date);
    if (tr !== undefined) return [tr];

    let t = this.temporale.get(date);
    let st: Celebration[] = this.sanctorale.at(date);

    if (
      date.isSaturday() &&
      this.temporale.season(date) === Seasons.ORDINARY &&
      (st.length === 0 || st[0].rank.equals(Ranks.MEMORIAL_OPTIONAL)) &&
      t.rank.lte(Ranks.MEMORIAL_OPTIONAL)
    ) {
      st = [...st, CelebrationFactory.saturdayMemorialBvm()];
    } else if (date.isSunday()) {
      st = st.filter((celebration) => !celebration.moveIfSunday);
    } else if (date.isMonday()) {
      const yesterdaySt = this.sanctorale.at(date.addDays(-1));
      for (const celebration of yesterdaySt) {
        if (celebration.moveIfSunday) {
          st = [...st, celebration];
        }
      }
    }

    if (t.rank.equals(Ranks.MEMORIAL_OPTIONAL)) {
      st = [...st, t];
      t = this.temporale.ferial(date);
    }

    if (st.length > 0) {
      if (st[0].rank.gt(t.rank)) {
        if (st[0].rank.equals(Ranks.MEMORIAL_OPTIONAL)) {
          return [t, ...st];
        }
        return st.slice();
      } else if (t.rank.equals(Ranks.FERIAL_PRIVILEGED) && st[0].rank.isMemorial()) {
        const commemorations = st.map((c) =>
          c.change({ rank: Ranks.COMMEMORATION, colour: t.colour }),
        );
        return [t, ...commemorations];
      } else if (
        t.symbol === 'immaculate_heart' &&
        (st[0].rank.equals(Ranks.MEMORIAL_GENERAL) || st[0].rank.equals(Ranks.MEMORIAL_PROPER))
      ) {
        const optionalMemorials = [t, ...st].map((c) =>
          c.change({ rank: Ranks.MEMORIAL_OPTIONAL }),
        );
        const ferial = this.temporale.ferial(date); // ugly and evil
        return [ferial, ...optionalMemorials];
      }
    }

    return [t];
  }

  /** ruby: the private `Calendar#first_vespers_on`. */
  private firstVespersOn(date: CalDate, celebrations: Celebration[]): Celebration | null {
    const tomorrow = date.addDays(1);
    const tomorrowCelebrations = this.celebrationsFor(tomorrow);

    const c = tomorrowCelebrations[0];
    if (
      c.rank.gte(Ranks.SOLEMNITY_PROPER) ||
      c.rank.equals(Ranks.SUNDAY_UNPRIVILEGED) ||
      (c.rank.equals(Ranks.FEAST_LORD_GENERAL) && tomorrow.isSunday())
    ) {
      if (c.symbol === 'ash_wednesday' || c.symbol === 'good_friday') {
        return null;
      }

      if (c.rank.gt(celebrations[0].rank) || c.symbol === 'easter_sunday') {
        return c;
      }
    }

    return null;
  }

  /** ruby: the private `Calendar#vigil_on`. */
  private vigilOn(date: CalDate): Celebration | null {
    const tomorrow = date.addDays(1);
    const tomorrowCelebrations = this.celebrationsFor(tomorrow);

    const c = tomorrowCelebrations.find((e) => e !== null && e !== undefined && e.hasVigil);
    if (c === undefined) return null;

    const symbol = `${c.symbol}_vigil`;
    return c.change({
      title: () => i18nTitle(c.cycle, symbol),
      symbol,
    });
  }

  /** ruby: the private `Calendar#evening_on`. */
  private eveningOn(celebrations: Celebration[]): Celebration | null {
    const c = celebrations.find((e) => e !== null && e !== undefined && e.hasEvening);
    if (c === undefined) return null;

    const symbol = `${c.symbol}_evening`;
    return c.change({
      title: () => i18nTitle(c.cycle, symbol),
      symbol,
    });
  }
}

/** ruby: `I18n.t("#{c.cycle.to_s}.solemnity.#{symbol}")` */
function i18nTitle(cycle: string, symbol: string): string {
  return i18n.t(`${cycle}.solemnity.${symbol}`);
}
