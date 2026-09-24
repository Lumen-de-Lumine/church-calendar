// ruby: lib/calendarium-romanum/perpetual_calendar.rb

import { Calendar } from './calendar.js';
import type { CalendarOptions } from './calendar.js';
import { CalDate, DateRange } from './cal-date.js';
import type { Day } from './day.js';
import { ArgumentError } from './errors.js';
import type { Sanctorale } from './sanctorale.js';
import { Temporale } from './temporale.js';
import type { TemporaleOptions } from './temporale.js';

export interface PerpetualCalendarOptions {
  sanctorale?: Sanctorale | null;
  /** Mutually exclusive with `temporaleOptions`. */
  temporaleFactory?: ((year: number) => Temporale) | null;
  /** Mutually exclusive with `temporaleFactory`. */
  temporaleOptions?: TemporaleOptions | null;
  /** Internal cache of {@link Calendar} instances; anything Map-like will do. */
  cache?: Map<number, Calendar>;
}

/**
 * Has mostly the same public interface as {@link Calendar}, but represents a
 * "perpetual" calendar, letting client code query any day without bothering
 * about liturgical-year boundaries.
 */
export class PerpetualCalendar {
  private readonly sanctorale: Sanctorale | null;
  private readonly temporaleFactory: (year: number) => Temporale;
  private readonly cache: Map<number, Calendar>;

  /** @throws {ArgumentError} when both `temporaleFactory` and `temporaleOptions` are given */
  constructor(opts: PerpetualCalendarOptions = {}) {
    if (opts.temporaleFactory && opts.temporaleOptions) {
      throw new ArgumentError('Specify either temporale_factory or temporale_options, not both');
    }

    this.sanctorale = opts.sanctorale ?? null;
    const temporaleOptions = opts.temporaleOptions ?? {};
    this.temporaleFactory =
      opts.temporaleFactory ?? ((year: number) => new Temporale(year, temporaleOptions));

    this.cache = opts.cache ?? new Map<number, Calendar>();
  }

  /** ruby: `PerpetualCalendar#day` */
  day(date: CalDate, opts?: CalendarOptions): Day;
  day(year: number, month: number, day: number, opts?: CalendarOptions): Day;
  day(...args: unknown[]): Day {
    const positional = args.slice();
    while (positional.length > 0 && positional[positional.length - 1] === undefined) {
      positional.pop();
    }
    const last = positional[positional.length - 1];
    let opts: CalendarOptions = {};
    if (last !== null && typeof last === 'object' && !(last instanceof CalDate)) {
      opts = last as CalendarOptions;
      positional.pop();
    }

    const date = Calendar.mkDate(...(positional as (CalDate | number)[]));
    return this.calendarFor(date).day(date, opts);
  }

  /** ruby: `PerpetualCalendar#[]` */
  at(date: CalDate): Day;
  at(range: DateRange): Day[];
  at(arg: CalDate | DateRange): Day | Day[] {
    if (arg instanceof DateRange) {
      return arg.map((date) => this.calendarFor(date).day(date));
    }
    return this.day(arg);
  }

  /** Returns a {@link Calendar} for the liturgical year containing the given day. */
  calendarFor(date: CalDate): Calendar {
    return this.calendarInstance(Temporale.liturgicalYear(date));
  }

  /** Returns a {@link Calendar} for the specified liturgical year. */
  calendarForYear(year: number): Calendar {
    return this.calendarInstance(year);
  }

  private calendarInstance(year: number): Calendar {
    const cached = this.cache.get(year);
    if (cached !== undefined) return cached;

    const calendar = new Calendar(year, this.sanctorale, this.temporaleFactory(year));
    this.cache.set(year, calendar);
    return calendar;
  }
}
