// ruby: lib/calendarium-romanum/abstract_date.rb

import { CalDate } from './cal-date.js';

/** A date not bound to a particular year. */
export class AbstractDate {
  readonly month: number;
  readonly day: number;

  /** @throws {RangeError} on invalid `month`/`day` value */
  constructor(month: number, day: number) {
    AbstractDate.validate(month, day);
    this.month = month;
    this.day = day;
  }

  /** ruby: `AbstractDate.from_date` */
  static fromDate(date: CalDate): AbstractDate {
    return new AbstractDate(date.month, date.day);
  }

  /** ruby: `AbstractDate#hash` is `(month * 100 + day).hash`; this is that key. */
  get key(): number {
    return this.month * 100 + this.day;
  }

  /** ruby: `AbstractDate#<=>` */
  compare(other: AbstractDate): -1 | 0 | 1 {
    if (this.month !== other.month) {
      return this.month < other.month ? -1 : 1;
    }
    if (this.day === other.day) return 0;
    return this.day < other.day ? -1 : 1;
  }

  /** ruby: `AbstractDate#eql?` / `#==` (via Comparable) */
  equals(other: AbstractDate | null | undefined): boolean {
    if (other === null || other === undefined) return false;
    return this.month === other.month && this.day === other.day;
  }

  /** Produce a `CalDate` by providing a year. */
  concretize(year: number): CalDate {
    return new CalDate(year, this.month, this.day);
  }

  toString(): string {
    return `${this.month}/${this.day}`;
  }

  private static validate(month: number, day: number): void {
    if (!(month >= 1 && month <= 12)) {
      throw new RangeError(`Invalid month ${month}.`);
    }

    let dayLte: number;
    switch (month) {
      case 2:
        dayLte = 29;
        break;
      case 1:
      case 3:
      case 5:
      case 7:
      case 8:
      case 10:
      case 12:
        dayLte = 31;
        break;
      default:
        dayLte = 30;
    }

    if (!(day > 0 && day <= 31)) {
      throw new RangeError(`Invalid day ${day}.`);
    }
    if (!(day <= dayLte)) {
      throw new RangeError(`Invalid day ${day} for month ${month}.`);
    }
  }
}
