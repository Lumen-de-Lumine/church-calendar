// ruby: lib/calendarium-romanum/util.rb
//
// `Util::DateParser` is *not* ported: it is only used by the gem's CLI
// (lib/calendarium-romanum/cli.rb), which this package does not reproduce.
// The api layer has its own date parsing (src/api/dates.ts).

import { CalDate } from './cal-date.js';

/**
 * Abstract superclass for date enumerators.
 *
 * ruby: `Util::DateEnumerator` — note the `begin ... end until` loop: the start
 * date is **always** yielded, even when `enumerationOver(start)` is already true.
 */
export class DateEnumerator implements Iterable<CalDate> {
  protected readonly startDate: CalDate;
  protected readonly prop: 'year' | 'month' | null;

  constructor(startDate: CalDate, prop: 'year' | 'month' | null = null) {
    this.startDate = startDate;
    this.prop = prop;
  }

  /** ruby: `DateEnumerator#enumeration_over?` */
  enumerationOver(date: CalDate): boolean {
    if (this.prop === 'year') return this.startDate.year !== date.year;
    if (this.prop === 'month') return this.startDate.month !== date.month;
    throw new Error('DateEnumerator subclasses must set `prop` or override enumerationOver()');
  }

  /** ruby: `DateEnumerator#each` / `#each_day` */
  each(fn: (date: CalDate) => void): void {
    let d = this.startDate;
    do {
      fn(d);
      d = d.succ();
    } while (!this.enumerationOver(d));
  }

  /** ruby: `each_day` is an alias of `each` */
  eachDay(fn: (date: CalDate) => void): void {
    this.each(fn);
  }

  /** ruby: `Enumerable#collect` */
  map<T>(fn: (date: CalDate) => T): T[] {
    const result: T[] = [];
    this.each((date) => result.push(fn(date)));
    return result;
  }

  /** ruby: `Enumerable#to_a` */
  toArray(): CalDate[] {
    return this.map((date) => date);
  }

  [Symbol.iterator](): Iterator<CalDate> {
    return this.toArray()[Symbol.iterator]();
  }
}

/** Enumerates days of a year. ruby: `Util::Year` */
export class Year extends DateEnumerator {
  constructor(year: number) {
    super(new CalDate(year, 1, 1), 'year');
  }
}

/** Enumerates days of a month. ruby: `Util::Month` */
export class Month extends DateEnumerator {
  constructor(year: number, month: number) {
    super(new CalDate(year, month, 1), 'month');
  }
}

export const Util = { DateEnumerator, Year, Month };
