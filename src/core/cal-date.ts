// ruby: (replacement for Ruby stdlib `Date`, which calendarium-romanum uses throughout)
//
// The Ruby library computes with `Date` objects: `date + 1`, `date.succ`,
// `date.wday`, `date.sunday?`, `(d1 - d2).numerator`, `Date.new(y, m, d)`.
// `CalDate` is the immutable, time-zone-free, pure-integer equivalent.
// Nothing in src/core may use the JS `Date` object except `CalDate.today()`.

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Days from 1970-01-01 to 0000-03-01 in Howard Hinnant's `days_from_civil`. */
const EPOCH_SHIFT = 719468;

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Proleptic Gregorian civil date -> days since 1970-01-01 (Howard Hinnant). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = floorDiv(y, 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = floorDiv(153 * (month + (month > 2 ? -3 : 9)) + 2, 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy; // [0, 146096]
  return era * 146097 + doe - EPOCH_SHIFT;
}

/** Days since 1970-01-01 -> proleptic Gregorian civil date (Howard Hinnant). */
function civilFromDays(dayNumber: number): [number, number, number] {
  const z = dayNumber + EPOCH_SHIFT;
  const era = floorDiv(z, 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100)); // [0, 365]
  const mp = floorDiv(5 * doy + 2, 153); // [0, 11]
  const d = doy - floorDiv(153 * mp + 2, 5) + 1; // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return [y + (m <= 2 ? 1 : 0), m, d];
}

function pad(n: number, width: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(n)).padStart(width, '0');
}

/**
 * Immutable proleptic Gregorian calendar date without a time or a time zone.
 *
 * Mirrors the subset of Ruby's `Date` that calendarium-romanum relies on.
 */
export class CalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  private readonly _dayNumber: number;

  /** @throws {RangeError} `invalid date`, for any non-existent calendar date. */
  constructor(year: number, month: number, day: number) {
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > CalDate.daysInMonth(year, month)
    ) {
      // ruby: Date.new raises Date::Error (an ArgumentError) with this message.
      // The core API contract specifies RangeError here.
      throw new RangeError('invalid date');
    }

    const dayNumber = daysFromCivil(year, month, day);
    // Past Number.MAX_SAFE_INTEGER days (about year 24 660 000 000 000) the arithmetic
    // is no longer exact: `succ()` stops advancing and date loops never end. Ruby's
    // bignum `Date` has no such limit (docs/QUIRKS.md Q36).
    if (!Number.isSafeInteger(dayNumber)) throw new RangeError('invalid date');

    this.year = year;
    this.month = month;
    this.day = day;
    this._dayNumber = dayNumber;
  }

  /** Number of days in the given month of the given year. */
  static daysInMonth(year: number, month: number): number {
    if (month < 1 || month > 12) return 0;
    if (month === 2 && isLeap(year)) return 29;
    return DAYS_IN_MONTH[month - 1];
  }

  /** Parses a strict `YYYY-MM-DD` string. */
  static fromISO(s: string): CalDate {
    const m = /^(-?\d{4,})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) throw new RangeError('invalid date');
    return new CalDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  /** Builds a date from the number of days since 1970-01-01. */
  static fromDayNumber(n: number): CalDate {
    if (!Number.isSafeInteger(n)) throw new RangeError('invalid date');
    const [y, m, d] = civilFromDays(n);
    return new CalDate(y, m, d);
  }

  /**
   * Today's date in UTC — the Ruby image runs with `TZ` unset and `/etc/localtime`
   * pointing at `Etc/UTC`, so `Time.now` there yields the UTC calendar date.
   */
  static today(): CalDate {
    const now = new Date();
    return new CalDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  }

  /** Days since 1970-01-01 (negative before it). */
  get dayNumber(): number {
    return this._dayNumber;
  }

  /** ruby: `Date#wday` — 0 = Sunday .. 6 = Saturday. */
  get wday(): number {
    return (((this._dayNumber + 4) % 7) + 7) % 7;
  }

  /** ruby: `Date#cwday` — 1 = Monday .. 7 = Sunday. */
  get cwday(): number {
    const w = this.wday;
    return w === 0 ? 7 : w;
  }

  addDays(n: number): CalDate {
    return CalDate.fromDayNumber(this._dayNumber + n);
  }

  /** ruby: `Date#succ` */
  succ(): CalDate {
    return this.addDays(1);
  }

  /** ruby: `(self - other).numerator` — signed difference in days. */
  diffDays(other: CalDate): number {
    return this._dayNumber - other._dayNumber;
  }

  compare(other: CalDate): -1 | 0 | 1 {
    if (this._dayNumber < other._dayNumber) return -1;
    if (this._dayNumber > other._dayNumber) return 1;
    return 0;
  }

  equals(other: CalDate): boolean {
    return this._dayNumber === other._dayNumber;
  }

  isBefore(other: CalDate): boolean {
    return this._dayNumber < other._dayNumber;
  }

  isAfter(other: CalDate): boolean {
    return this._dayNumber > other._dayNumber;
  }

  isOnOrBefore(other: CalDate): boolean {
    return this._dayNumber <= other._dayNumber;
  }

  isOnOrAfter(other: CalDate): boolean {
    return this._dayNumber >= other._dayNumber;
  }

  isSunday(): boolean {
    return this.wday === 0;
  }

  isMonday(): boolean {
    return this.wday === 1;
  }

  isSaturday(): boolean {
    return this.wday === 6;
  }

  isLeapYear(): boolean {
    return isLeap(this.year);
  }

  toISO(): string {
    return `${pad(this.year, 4)}-${pad(this.month, 2)}-${pad(this.day, 2)}`;
  }

  toString(): string {
    return this.toISO();
  }

  toJSON(): string {
    return this.toISO();
  }
}

/**
 * ruby: `Range<Date>` — the inclusive range returned by `Temporale#date_range`
 * and accepted by `Calendar#[]` / `PerpetualCalendar#[]`.
 */
export class DateRange implements Iterable<CalDate> {
  readonly start: CalDate;
  readonly end: CalDate;

  constructor(start: CalDate, end: CalDate) {
    this.start = start;
    this.end = end;
  }

  /** ruby: `range.include?(date)` */
  includes(date: CalDate): boolean {
    return date.isOnOrAfter(this.start) && date.isOnOrBefore(this.end);
  }

  /** ruby: `range.count` */
  get count(): number {
    return Math.max(0, this.end.diffDays(this.start) + 1);
  }

  each(fn: (date: CalDate) => void): void {
    for (let n = this.start.dayNumber; n <= this.end.dayNumber; n += 1) {
      fn(CalDate.fromDayNumber(n));
    }
  }

  map<T>(fn: (date: CalDate) => T): T[] {
    const result: T[] = [];
    this.each((date) => result.push(fn(date)));
    return result;
  }

  toArray(): CalDate[] {
    return this.map((date) => date);
  }

  [Symbol.iterator](): Iterator<CalDate> {
    return this.toArray()[Symbol.iterator]();
  }
}
