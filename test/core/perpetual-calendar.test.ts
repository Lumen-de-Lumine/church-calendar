// ported from: calendarium-romanum/spec/perpetual_calendar_spec.rb

import { CalDate, DateRange } from '../../src/core/cal-date.js';
import { Calendar } from '../../src/core/calendar.js';
import { Day } from '../../src/core/day.js';
import { ArgumentError } from '../../src/core/errors.js';
import { PerpetualCalendar } from '../../src/core/perpetual-calendar.js';
import { Temporale } from '../../src/core/temporale.js';
import { CelebrationFactory } from '../../src/core/temporale/celebration-factory.js';
import { Dates } from '../../src/core/temporale/dates.js';
import { d, generalRomanEnglishSanctorale } from './support.js';

describe('PerpetualCalendar', () => {
  const pcal = () => new PerpetualCalendar();
  const date = d(2000, 1, 1);
  const year = 2000;

  describe('.new', () => {
    describe('with sanctorale', () => {
      it('uses the sanctorale', () => {
        const sanctorale = generalRomanEnglishSanctorale();
        const pc = new PerpetualCalendar({ sanctorale });
        expect(pc.calendarForYear(year).sanctorale).toBe(sanctorale);
      });
    });

    describe('with temporale options', () => {
      it('applies the options', () => {
        const pc = new PerpetualCalendar({ temporaleOptions: { transferToSunday: ['epiphany'] } });

        const y = 2016;
        const epiphanyDate = Dates.epiphany(y, { sunday: true });

        expect(
          pc
            .calendarForYear(y)
            .day(epiphanyDate)
            .celebrations[0].equalsStrict(CelebrationFactory.epiphany()),
        ).toBe(true);
      });
    });

    describe('with temporale factory', () => {
      it('uses the factory', () => {
        class TemporaleSubclass extends Temporale {}
        const pc = new PerpetualCalendar({
          temporaleFactory: (y: number) => new TemporaleSubclass(y),
        });
        expect(pc.calendarForYear(year).temporale).toBeInstanceOf(TemporaleSubclass);
      });
    });

    describe('with both temporale factory and options', () => {
      it('fails', () => {
        expect(
          () =>
            new PerpetualCalendar({
              temporaleOptions: { transferToSunday: ['epiphany'] },
              temporaleFactory: (y: number) => new Temporale(y),
            }),
        ).toThrow(ArgumentError);
      });
    });

    describe('with cache', () => {
      it('uses the supplied object as the Calendar instance cache', () => {
        const cache = new Map<number, Calendar>();
        const pc = new PerpetualCalendar({ cache });
        const calendar = pc.calendarForYear(year);
        expect(cache.get(2000)).toBe(calendar);
      });
    });
  });

  describe('#day', () => {
    it('returns a Day', () => {
      expect(pcal().day(CalDate.today())).toBeInstanceOf(Day);
    });

    it('accepts three integers, the way CalendarFacade calls it', () => {
      const day = pcal().day(2026, 9, 18);
      expect(day.date.toISO()).toBe('2026-09-18');
    });

    it('passes vespers/vigils through to the Calendar', () => {
      const day = pcal().day(d(2013, 12, 24), { vespers: true, vigils: true });
      expect(day.vespers).not.toBeNull();
    });
  });

  describe('#at (ruby: #[])', () => {
    it('with a single CalDate returns a Day', () => {
      expect(pcal().at(CalDate.today())).toBeInstanceOf(Day);
    });

    describe('with a range of dates', () => {
      it('of the same liturgical year returns an Array of Days', () => {
        const result = pcal().at(new DateRange(d(2010, 1, 1), d(2010, 1, 5)));
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(5);
        expect(result[0]).toBeInstanceOf(Day);
      });

      it('across the boundaries of the liturgical year returns an Array of Days', () => {
        const firstAdvent = Dates.firstAdventSunday(2010);
        const result = pcal().at(new DateRange(firstAdvent.addDays(-1), firstAdvent.addDays(1)));
        expect(result).toHaveLength(3);
        expect(result.every((day) => day instanceof Day)).toBe(true);
      });
    });
  });

  describe('#calendarFor', () => {
    it('returns a Calendar', () => {
      expect(pcal().calendarFor(date)).toBeInstanceOf(Calendar);
    });

    it('picks the liturgical year containing the date', () => {
      expect(pcal().calendarFor(d(2014, 6, 9)).year).toBe(2013);
      expect(pcal().calendarFor(d(2014, 12, 20)).year).toBe(2014);
    });
  });

  describe('#calendarForYear', () => {
    it('returns a Calendar', () => {
      expect(pcal().calendarForYear(year)).toBeInstanceOf(Calendar);
    });
  });

  describe('caching', () => {
    it('caches Calendar instances', () => {
      const pc = pcal();
      expect(pc.calendarForYear(year)).toBe(pc.calendarForYear(year));
    });
  });
});
