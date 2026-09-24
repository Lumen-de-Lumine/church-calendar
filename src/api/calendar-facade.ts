// ruby: lib/church-calendar/services/calendar_facade.rb
//
// `CalendarFacade` is a thin wrapper over a `PerpetualCalendar`: it pins the
// `vespers: true, vigils: true` options the 2.7.0 API always uses, adds the
// day-range enumerators the routes need, and carries the calendar's YAML
// metadata so `GET /calendars/:cal` can answer without touching the repository.

import { CalDate } from '../core/cal-date.js';
import { Calendar } from '../core/calendar.js';
import { Day } from '../core/day.js';
import type { Celebration } from '../core/day.js';
import { DateEnumerator, Month, Year } from '../core/util.js';
import type { PerpetualCalendar } from '../core/perpetual-calendar.js';
import type { CalendarConfig } from './calendars-config.js';
import { ordinalizeInFull } from './ordinalize-full.js';

/**
 * ruby: `ChurchCalendar::DateRangeEnumerator` — a `Util::DateEnumerator` whose
 * `enumeration_over?` is `@stop < date`.
 *
 * Note the inherited `begin ... end until` loop: the start date is ALWAYS
 * yielded, even when it is already past `stop`. `days_between(b, a)` with
 * `a < b` therefore returns exactly one day, not an empty array.
 */
export class DateRangeEnumerator extends DateEnumerator {
  private readonly stop: CalDate;

  constructor(from: CalDate, to: CalDate) {
    super(from, null);
    this.stop = to;
  }

  override enumerationOver(date: CalDate): boolean {
    return this.stop.isBefore(date);
  }
}

/**
 * ruby: `CalendarFacade#spell_out_ordinals`.
 *
 * ```ruby
 * m = /\b(\d+)(?:th|st|nd|rd)/.match(string)
 * return string if !m
 * ordinal = m[1].to_i.ordinalize_in_full.gsub(' ', '-')
 * string.gsub(m[0], ordinal)
 * ```
 *
 * Two quirks are load-bearing and reproduced verbatim:
 *
 * 1. only the FIRST ordinal in the string is looked up (`match`, not `scan`),
 *    which is why `q=1st` matches 25 days of 2026 and `q=first` matches 27
 *    (docs/BASELINE.md defect D);
 * 2. the substitution is `String#gsub` with a STRING pattern, so every literal
 *    occurrence of that same token is replaced — `"2nd 2nd"` becomes
 *    `"second second"`, not `"second 2nd"`.
 *
 * The spaces in the gem's output are replaced by hyphens, so 33 renders as
 * `thirty-third`, which is why `q=thirty-third` is a hit and `q=thirty third`
 * is not.
 *
 * @throws {OrdinalizeError} for an ordinal above 100 (ruby: `NotImplementedError`,
 *   a 502 from the Ruby service). No packaged title reaches it — the highest is `34th`.
 */
export function spellOutOrdinals(text: string): string {
  const m = /\b(\d+)(?:th|st|nd|rd)/.exec(text);
  if (!m) return text;
  const ordinal = ordinalizeInFull(Number(m[1])).split(' ').join('-');
  return text.split(m[0]).join(ordinal);
}

/**
 * ruby: `CalendarFacade#title_includes_query?`
 *
 * Both sides are lower-cased and compared with a plain substring test — no
 * accent folding, no Unicode normalization, no apostrophe equivalence. The
 * titles use U+2019, so `q="'"` matches nothing (BASELINE defect C).
 */
export function titleIncludesQuery(title: string, query: string): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const spelled = spellOutOrdinals(lowerTitle);
  return lowerTitle.includes(lowerQuery) || spelled.includes(lowerQuery);
}

/** ruby: `CalendarFacade`. */
export class CalendarFacade {
  private readonly perpetualCalendar: PerpetualCalendar;

  /** ruby: `attr_reader :metadata` — the calendar's entry in `config/calendars.yml`. */
  readonly metadata: CalendarConfig;

  constructor(perpetualCalendar: PerpetualCalendar, metadata: CalendarConfig) {
    this.perpetualCalendar = perpetualCalendar;
    this.metadata = metadata;
  }

  /**
   * ruby: `#perpetual_calendar_day` — the ONE place `vespers`/`vigils` are
   * enabled. Every API response goes through it, which is why `vespers` appears
   * even inside `search` results.
   */
  perpetualCalendarDay(date: CalDate): Day {
    return this.perpetualCalendar.day(date.year, date.month, date.day, {
      vespers: true,
      vigils: true,
    });
  }

  /** ruby: `#day` */
  day(date: CalDate): Day {
    return this.perpetualCalendarDay(date);
  }

  /** ruby: `#days_of_month` */
  daysOfMonth(year: number, month: number): Day[] {
    return new Month(year, month).map((date) => this.perpetualCalendarDay(date));
  }

  /** ruby: `#days_of_year` */
  daysOfYear(year: number): Day[] {
    return new Year(year).map((date) => this.perpetualCalendarDay(date));
  }

  /** ruby: `#days_between` */
  daysBetween(start: CalDate, stop: CalDate): Day[] {
    return new DateRangeEnumerator(start, stop).map((date) => this.perpetualCalendarDay(date));
  }

  /** ruby: `#today` — `Date.new(Time.now.year, ...)`, i.e. the server's local day. */
  today(): CalDate {
    return CalDate.today();
  }

  /** ruby: `#days_between_today_and_365` */
  daysBetweenTodayAnd365(): Day[] {
    const start = this.today();
    return this.daysBetween(start, start.addDays(365));
  }

  /** ruby: `#spell_out_ordinals` (module-level {@link spellOutOrdinals}). */
  spellOutOrdinals(text: string): string {
    return spellOutOrdinals(text);
  }

  /** ruby: `#title_includes_query?` */
  titleIncludesQuery(title: string, query: string): boolean {
    return titleIncludesQuery(title, query);
  }

  /**
   * ruby: `#search_title(query, startDate, endDate)`
   *
   * - a missing `startDate` defaults to TODAY and a missing `endDate` to
   *   `startDate + 365`, so `GET .../search` with no parameters answers 200 with
   *   366 clock-dependent days (BASELINE defect A);
   * - `query` is only skipped when it is nil in Ruby. An EMPTY STRING is truthy
   *   there, so `?q=` runs the filter and matches every day, which is why this
   *   port tests `query == null` rather than falsiness;
   * - the rebuilt `Day` keeps the ORIGINAL day's `vespers` even when that
   *   celebration does not match the query (BASELINE defect B), and drops
   *   nothing else: `cycle*` are recomputed from the date by `Day`'s constructor.
   */
  searchTitle(
    query: string | null | undefined,
    startDate: CalDate | null | undefined,
    endDate: CalDate | null | undefined,
  ): Day[] {
    let start = startDate ?? null;
    if (start === null) start = this.today();
    let stop = endDate ?? null;
    if (stop === null) stop = start.addDays(365);

    const allResult = this.daysBetween(start, stop);
    if (query === null || query === undefined) return allResult;

    const lowerQuery = query.toLowerCase();
    const results: Day[] = [];
    for (const day of allResult) {
      const matches: Celebration[] = day.celebrations.filter((cel) =>
        titleIncludesQuery(cel.title, lowerQuery),
      );
      if (matches.length > 0) {
        results.push(
          new Day({
            date: day.date,
            season: day.season,
            seasonWeek: day.seasonWeek,
            vespers: day.vespers,
            celebrations: matches,
          }),
        );
      }
    }
    return results;
  }

  /** ruby: `#year` — `@perpetual_calendar.calendar_for_year year`. */
  year(year: number): Calendar {
    return this.perpetualCalendar.calendarForYear(year);
  }
}
