// ported from: calendarium-romanum/spec/year_spec.rb
// (`Util::DateParser` is not ported — it is CLI-only.)

import { CalDate } from '../../src/core/cal-date.js';
import { DateEnumerator, Month, Year } from '../../src/core/util.js';

describe('Util.Year', () => {
  const y = () => new Year(2000);
  const dayCount = 366;

  describe('#each', () => {
    it('yields for each iteration', () => {
      const yielded: CalDate[] = [];
      y().each((date) => yielded.push(date));
      expect(yielded.length).toBeGreaterThan(0);
    });

    it('yields the expected number of times', () => {
      let count = 0;
      y().each(() => (count += 1));
      expect(count).toBe(dayCount);
    });

    it('yields CalDate instances', () => {
      const dates = y().toArray();
      expect(dates).toHaveLength(dayCount);
      expect(dates.every((date) => date instanceof CalDate)).toBe(true);
      expect(dates[0].toISO()).toBe('2000-01-01');
      expect(dates[dayCount - 1].toISO()).toBe('2000-12-31');
    });

    // ruby returns an Enumerator when called without a block; the TS port is
    // iterable instead.
    it('is iterable', () => {
      expect([...y()]).toHaveLength(dayCount);
    });
  });
});

describe('Util.Month', () => {
  it('enumerates exactly one month', () => {
    const dates = new Month(2014, 2).toArray();
    expect(dates).toHaveLength(28);
    expect(dates[0].toISO()).toBe('2014-02-01');
    expect(dates[27].toISO()).toBe('2014-02-28');
  });

  it('handles February in a leap year', () => {
    expect(new Month(2016, 2).toArray()).toHaveLength(29);
  });

  it('maps like Enumerable#collect', () => {
    expect(new Month(2014, 1).map((d) => d.day)).toHaveLength(31);
  });
});

describe('Util.DateEnumerator', () => {
  // The Ruby loop is `begin ... end until`, so it always yields the start date.
  class ReversedRange extends DateEnumerator {
    private readonly stop: CalDate;

    constructor(from: CalDate, to: CalDate) {
      super(from);
      this.stop = to;
    }

    override enumerationOver(date: CalDate): boolean {
      return this.stop.isBefore(date);
    }
  }

  it('always yields the start date, even for an empty range', () => {
    const dates = new ReversedRange(new CalDate(2014, 3, 16), new CalDate(2014, 3, 1)).toArray();
    expect(dates.map((d) => d.toISO())).toEqual(['2014-03-16']);
  });

  it('is subclassable the way church-calendar-api subclasses it', () => {
    const dates = new ReversedRange(new CalDate(2014, 3, 16), new CalDate(2014, 3, 18)).toArray();
    expect(dates.map((d) => d.toISO())).toEqual(['2014-03-16', '2014-03-17', '2014-03-18']);
  });

  it('throws when a subclass provides neither `prop` nor an override', () => {
    const broken = new DateEnumerator(new CalDate(2014, 1, 1));
    expect(() => broken.toArray()).toThrow(/must set `prop`/);
  });
});
