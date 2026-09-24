// ported from: calendarium-romanum/spec/abstract_date_spec.rb

import { AbstractDate } from '../../src/core/abstract-date.js';
import { Year } from '../../src/core/util.js';
import { d } from './support.js';

describe('AbstractDate', () => {
  describe('.new', () => {
    describe('fails on invalid', () => {
      it('month', () => {
        expect(() => new AbstractDate(13, 1)).toThrow(/Invalid month/);
      });

      it('day', () => {
        expect(() => new AbstractDate(1, 32)).toThrow(/Invalid day/);
      });

      it('day of month', () => {
        expect(() => new AbstractDate(2, 30)).toThrow(/Invalid day/);
      });
    });
  });

  // test the constructor through .fromDate on a complete leap year
  describe('.fromDate', () => {
    const YEAR = 2000;

    it('the test year is leap', () => {
      expect(d(YEAR, 1, 1).isLeapYear()).toBe(true);
    });

    it('accepts every day of the leap year', () => {
      const dates = new Year(YEAR).toArray();
      expect(dates).toHaveLength(366);
      for (const date of dates) {
        expect(() => AbstractDate.fromDate(date)).not.toThrow();
      }
    });
  });

  describe('#compare (ruby: #<)', () => {
    it('days of the same month', () => {
      expect(new AbstractDate(1, 1).compare(new AbstractDate(1, 2))).toBe(-1);
    });

    it('the same day, different months', () => {
      expect(new AbstractDate(1, 1).compare(new AbstractDate(2, 1))).toBe(-1);
    });

    it('same', () => {
      expect(new AbstractDate(1, 1).compare(new AbstractDate(1, 1))).toBe(0);
    });
  });

  describe('#equals (ruby: #==)', () => {
    it('equal', () => {
      expect(new AbstractDate(1, 1).equals(new AbstractDate(1, 1))).toBe(true);
    });

    it('different', () => {
      expect(new AbstractDate(1, 1).equals(new AbstractDate(1, 2))).toBe(false);
    });

    it('null', () => {
      expect(new AbstractDate(1, 1).equals(null)).toBe(false);
    });
  });

  describe('as a Map key (ruby: as a Hash key)', () => {
    it('different objects with the same values produce the same key', () => {
      const map = new Map([[new AbstractDate(1, 1).key, 1]]);
      expect(map.has(new AbstractDate(1, 1).key)).toBe(true);
      expect(new AbstractDate(1, 1).key).toBe(101);
      expect(new AbstractDate(12, 25).key).toBe(1225);
    });
  });

  describe('#concretize', () => {
    it('produces a CalDate', () => {
      expect(new AbstractDate(12, 25).concretize(2013).toISO()).toBe('2013-12-25');
    });

    it('throws for February 29th in a common year', () => {
      expect(() => new AbstractDate(2, 29).concretize(2015)).toThrow(RangeError);
    });
  });
});
