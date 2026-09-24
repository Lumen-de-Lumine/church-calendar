// ported from: calendarium-romanum/spec/dates_spec.rb

import { Dates } from '../../src/core/temporale/dates.js';
import { d } from './support.js';

describe('Temporale.Dates', () => {
  const today = d(2014, 3, 16); // a Sunday

  describe('#weekdayBefore', () => {
    it.each([
      [0, '2014-03-09'],
      [1, '2014-03-10'],
      [2, '2014-03-11'],
      [3, '2014-03-12'],
      [4, '2014-03-13'],
      [5, '2014-03-14'],
      [6, '2014-03-15'],
    ])('works well for weekday %p', (dayNum, expected) => {
      expect(Dates.weekdayBefore(dayNum, today).toISO()).toBe(expected);
    });
  });

  describe('#weekdayAfter aliases', () => {
    it.each([
      ['mondayAfter', '2014-03-17'],
      ['tuesdayAfter', '2014-03-18'],
      ['wednesdayAfter', '2014-03-19'],
      ['thursdayAfter', '2014-03-20'],
      ['fridayAfter', '2014-03-21'],
      ['saturdayAfter', '2014-03-22'],
      ['sundayAfter', '2014-03-23'],
    ] as const)('works well for %s', (method, expected) => {
      expect(Dates[method](today).toISO()).toBe(expected);
    });
  });

  describe('#sundayBefore aliases', () => {
    it('steps back a full week from the same weekday', () => {
      expect(Dates.sundayBefore(today).toISO()).toBe('2014-03-09');
      expect(Dates.saturdayBefore(today).toISO()).toBe('2014-03-15');
    });
  });

  describe('transferable solemnities', () => {
    // a year has been chosen when none of them falls on a Sunday
    const year = 2013;

    it.each(['epiphany', 'ascension', 'corpusChristi'] as const)('%s', (solemnity) => {
      const transferred = Dates[solemnity](year, { sunday: true });
      const notTransferred = Dates[solemnity](year);

      expect(transferred.equals(notTransferred)).toBe(false);
      expect(transferred.isSunday()).toBe(true);
    });

    it('Baptism of the Lord', () => {
      const transferred = Dates.baptismOfLord(year, { epiphanyOnSunday: true });
      const notTransferred = Dates.baptismOfLord(year);

      expect(notTransferred.isSunday()).toBe(true);
      // ruby's spec asserts `be_monday` here, but for liturgical year 2013 the
      // transferred Epiphany is 2014-01-05, whose `mday` is NOT > 6, so
      // `baptism_of_lord` takes the `sunday_after` branch. The Monday case needs
      // a year where the transferred Epiphany lands on Jan 7th or 8th.
      expect(transferred.toISO()).toBe('2014-01-12');
      expect(transferred.isSunday()).toBe(true);

      expect(Dates.epiphany(2016, { sunday: true }).toISO()).toBe('2017-01-08');
      expect(Dates.baptismOfLord(2016, { epiphanyOnSunday: true }).isMonday()).toBe(true);
    });
  });

  describe('.easterSunday', () => {
    // ported from the table in spec/temporale_spec.rb (#easter_sunday), extended
    it.each([
      [2003, '2004-04-11'],
      [2004, '2005-03-27'],
      [2005, '2006-04-16'],
      [2006, '2007-04-08'],
      [2014, '2015-04-05'],
      [2021, '2022-04-17'],
      [2023, '2024-03-31'],
      [2025, '2026-04-05'],
      [2037, '2038-04-25'], // latest possible Easter
    ])('liturgical year %p -> %p', (year, expected) => {
      expect(Dates.easterSunday(year).toISO()).toBe(expected);
    });

    it('always lands on a Sunday, for 300 consecutive years', () => {
      for (let year = 1969; year < 2269; year += 1) {
        const easter = Dates.easterSunday(year);
        expect(easter.isSunday()).toBe(true);
        expect(easter.month === 3 || easter.month === 4).toBe(true);
      }
    });

    // docs/QUIRKS.md Q13: the `easter` gem's algorithm is not the true Gregorian
    // computus. It diverges in 32 years between 1583 and 2500; the first
    // divergence after 1900 is Easter 2209 (April 23 instead of March 26).
    it('reproduces the `easter` gem, including its post-2208 divergence', () => {
      expect(Dates.easterSunday(2208).toISO()).toBe('2209-04-23'); // true Easter: 2209-03-26
      expect(Dates.easterSunday(2227).toISO()).toBe('2228-04-27'); // true Easter: 2228-03-23
    });

    it('is correct for every year the service can realistically be asked about', () => {
      // Meeus/Jones/Butcher anonymous Gregorian algorithm, as an independent check
      const meeus = (year: number): string => {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const dd = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - dd - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
      };

      for (let year = 1900; year <= 2208; year += 1) {
        expect(Dates.easterSunday(year - 1).toISO()).toBe(meeus(year));
      }
    });
  });

  describe('.firstAdventSunday', () => {
    it.each([
      [2004, '2004-11-28'],
      [2010, '2010-11-28'],
      [2011, '2011-11-27'],
      [2012, '2012-12-02'],
      [2013, '2013-12-01'],
      [2026, '2026-11-29'],
    ])('%p -> %p', (year, expected) => {
      expect(Dates.firstAdventSunday(year).toISO()).toBe(expected);
    });
  });

  describe('.holyFamily', () => {
    it('is December 30th when Christmas is a Sunday', () => {
      expect(Dates.nativity(2016).isSunday()).toBe(true);
      expect(Dates.holyFamily(2016).toISO()).toBe('2016-12-30');
    });

    it('is the Sunday after Christmas otherwise', () => {
      expect(Dates.holyFamily(2013).toISO()).toBe('2013-12-29');
    });
  });

  describe('.baptismOfLord', () => {
    it('is the day after Epiphany when Epiphany was moved past January 6th', () => {
      // `e.mday > 6`
      expect(Dates.epiphany(2016, { sunday: true }).toISO()).toBe('2017-01-08');
      expect(Dates.baptismOfLord(2016, { epiphanyOnSunday: true }).toISO()).toBe('2017-01-09');
    });

    it('is the Sunday after Epiphany otherwise', () => {
      expect(Dates.baptismOfLord(2016).toISO()).toBe('2017-01-08');
    });
  });

  describe('derived dates', () => {
    const year = 2013;

    it.each([
      ['nativity', '2013-12-25'],
      ['motherOfGod', '2014-01-01'],
      ['ashWednesday', '2014-03-05'],
      ['palmSunday', '2014-04-13'],
      ['holyThursday', '2014-04-17'],
      ['goodFriday', '2014-04-18'],
      ['holySaturday', '2014-04-19'],
      ['easterSunday', '2014-04-20'],
      ['ascension', '2014-05-29'],
      ['pentecost', '2014-06-08'],
      ['holyTrinity', '2014-06-15'],
      ['corpusChristi', '2014-06-19'],
      ['sacredHeart', '2014-06-27'],
      ['motherOfChurch', '2014-06-09'],
      ['immaculateHeart', '2014-06-28'],
      ['christKing', '2014-11-23'],
    ] as const)('%s -> %p', (method, expected) => {
      expect(Dates[method](year).toISO()).toBe(expected);
    });
  });

  describe('.octaveOf', () => {
    it('adds a week', () => {
      expect(Dates.octaveOf(d(2013, 12, 25)).toISO()).toBe('2014-01-01');
    });
  });
});
