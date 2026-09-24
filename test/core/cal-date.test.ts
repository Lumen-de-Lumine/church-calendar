// New tests: `CalDate` replaces Ruby's stdlib `Date`, so it has no rspec counterpart.

import { CalDate, DateRange } from '../../src/core/cal-date.js';

describe('CalDate', () => {
  describe('construction', () => {
    it('rejects February 29th in a common year', () => {
      expect(() => new CalDate(2015, 2, 29)).toThrow(RangeError);
      expect(() => new CalDate(2015, 2, 29)).toThrow('invalid date');
    });

    it('accepts February 29th in a leap year', () => {
      expect(new CalDate(2016, 2, 29).toISO()).toBe('2016-02-29');
    });

    // docs/QUIRKS.md Q36: past MAX_SAFE_INTEGER days `succ()` would stop advancing
    it('rejects a date whose day number is not a safe integer', () => {
      expect(() => new CalDate(30000000000000, 1, 1)).toThrow(RangeError);
      expect(() => new CalDate(-30000000000000, 1, 1)).toThrow(RangeError);
      expect(() => CalDate.fromDayNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
      const edge = new CalDate(10000000000000, 12, 31);
      expect(edge.succ().dayNumber).toBe(edge.dayNumber + 1);
    });

    it.each([
      [2000, 13, 1],
      [2000, 0, 1],
      [2000, 1, 0],
      [2000, 1, 32],
      [2000, 4, 31],
      [2000, 1, 1.5],
    ])('rejects %p-%p-%p', (year, month, day) => {
      expect(() => new CalDate(year, month, day)).toThrow(RangeError);
    });

    it('parses an ISO string', () => {
      const d = CalDate.fromISO('2026-09-18');
      expect([d.year, d.month, d.day]).toEqual([2026, 9, 18]);
    });

    it('rejects a malformed ISO string', () => {
      expect(() => CalDate.fromISO('2026-9-18')).toThrow(RangeError);
    });
  });

  describe('day numbers', () => {
    it('counts from the epoch', () => {
      expect(new CalDate(1970, 1, 1).dayNumber).toBe(0);
      expect(new CalDate(1970, 1, 2).dayNumber).toBe(1);
      expect(new CalDate(1969, 12, 31).dayNumber).toBe(-1);
    });

    it('round-trips through fromDayNumber over a long range', () => {
      for (let n = -40000; n <= 40000; n += 97) {
        const d = CalDate.fromDayNumber(n);
        expect(d.dayNumber).toBe(n);
        expect(new CalDate(d.year, d.month, d.day).dayNumber).toBe(n);
      }
    });

    it('agrees with UTC Date arithmetic over four centuries', () => {
      for (let n = -80000; n <= 30000; n += 613) {
        const d = CalDate.fromDayNumber(n);
        const js = new Date(n * 86400000);
        expect([d.year, d.month, d.day]).toEqual([
          js.getUTCFullYear(),
          js.getUTCMonth() + 1,
          js.getUTCDate(),
        ]);
        expect(d.wday).toBe(js.getUTCDay());
      }
    });
  });

  describe('weekdays', () => {
    it('wday is 0 on Sunday', () => {
      expect(new CalDate(2018, 5, 20).wday).toBe(0);
      expect(new CalDate(2018, 5, 20).isSunday()).toBe(true);
      expect(new CalDate(2018, 5, 19).wday).toBe(6);
      expect(new CalDate(2018, 5, 19).isSaturday()).toBe(true);
      expect(new CalDate(2018, 5, 21).isMonday()).toBe(true);
    });

    it('cwday is 7 on Sunday', () => {
      expect(new CalDate(2018, 5, 20).cwday).toBe(7);
      expect(new CalDate(2018, 5, 21).cwday).toBe(1);
      expect(new CalDate(2018, 5, 19).cwday).toBe(6);
    });
  });

  describe('arithmetic and comparison', () => {
    const a = new CalDate(2014, 3, 16);
    const b = new CalDate(2014, 3, 20);

    it('addDays / succ', () => {
      expect(a.addDays(4).equals(b)).toBe(true);
      expect(a.succ().toISO()).toBe('2014-03-17');
      expect(new CalDate(2014, 2, 28).succ().toISO()).toBe('2014-03-01');
    });

    it('diffDays is this - other', () => {
      expect(b.diffDays(a)).toBe(4);
      expect(a.diffDays(b)).toBe(-4);
    });

    it('compare / equals / isBefore / isAfter', () => {
      expect(a.compare(b)).toBe(-1);
      expect(b.compare(a)).toBe(1);
      expect(a.compare(new CalDate(2014, 3, 16))).toBe(0);
      expect(a.equals(new CalDate(2014, 3, 16))).toBe(true);
      expect(a.isBefore(b)).toBe(true);
      expect(a.isAfter(b)).toBe(false);
      expect(a.isOnOrBefore(a)).toBe(true);
      expect(a.isOnOrAfter(a)).toBe(true);
    });
  });

  describe('leap years and month lengths', () => {
    it.each([
      [2000, true],
      [1900, false],
      [2016, true],
      [2015, false],
    ])('%p is leap: %p', (year, leap) => {
      expect(new CalDate(year, 1, 1).isLeapYear()).toBe(leap);
    });

    it('daysInMonth', () => {
      expect(CalDate.daysInMonth(2000, 2)).toBe(29);
      expect(CalDate.daysInMonth(1900, 2)).toBe(28);
      expect(CalDate.daysInMonth(2015, 4)).toBe(30);
      expect(CalDate.daysInMonth(2015, 12)).toBe(31);
    });
  });

  describe('formatting', () => {
    it('toISO / toString pad to YYYY-MM-DD', () => {
      expect(new CalDate(2014, 3, 6).toISO()).toBe('2014-03-06');
      expect(String(new CalDate(2014, 3, 6))).toBe('2014-03-06');
      expect(JSON.stringify(new CalDate(2014, 3, 6))).toBe('"2014-03-06"');
    });
  });

  describe('today', () => {
    it('returns the UTC calendar date', () => {
      const now = new Date();
      const today = CalDate.today();
      expect([today.year, today.month, today.day]).toEqual([
        now.getUTCFullYear(),
        now.getUTCMonth() + 1,
        now.getUTCDate(),
      ]);
    });
  });
});

describe('DateRange', () => {
  const range = new DateRange(new CalDate(2014, 1, 1), new CalDate(2014, 1, 5));

  it('includes its bounds', () => {
    expect(range.includes(new CalDate(2014, 1, 1))).toBe(true);
    expect(range.includes(new CalDate(2014, 1, 5))).toBe(true);
    expect(range.includes(new CalDate(2013, 12, 31))).toBe(false);
    expect(range.includes(new CalDate(2014, 1, 6))).toBe(false);
  });

  it('enumerates inclusively', () => {
    expect(range.count).toBe(5);
    expect(range.toArray().map((d) => d.toISO())).toEqual([
      '2014-01-01',
      '2014-01-02',
      '2014-01-03',
      '2014-01-04',
      '2014-01-05',
    ]);
    expect([...range]).toHaveLength(5);
  });
});
