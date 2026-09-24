// ported from: calendarium-romanum/spec/day_spec.rb, celebration_spec.rb,
//              celebration_factory_spec.rb

import { AbstractDate } from '../../src/core/abstract-date.js';
import { Celebration, Day } from '../../src/core/day.js';
import { Colours, Ranks, Seasons } from '../../src/core/enums.js';
import { i18n } from '../../src/core/i18n.js';
import { PerpetualCalendar } from '../../src/core/perpetual-calendar.js';
import { Temporale } from '../../src/core/temporale.js';
import { CelebrationFactory } from '../../src/core/temporale/celebration-factory.js';
import { Dates } from '../../src/core/temporale/dates.js';
import { d, isTranslated } from './support.js';

beforeEach(() => {
  i18n.setLocale('en');
});

describe('Day', () => {
  const today = d(2018, 5, 21);
  const make = (vespers: Celebration | null = null) =>
    new Day({
      date: today,
      season: Seasons.ORDINARY,
      seasonWeek: 1,
      celebrations: [new Celebration()],
      vespers,
    });

  describe('.new', () => {
    // ruby: 'works without arguments' — no longer true in the fork, because the
    // constructor computes the lectionary cycles and dereferences `date`.
    it('requires a date', () => {
      expect(() => new Day({ date: undefined as unknown as never })).toThrow();
    });

    it('makes a shallow copy of celebrations', () => {
      const celebrations = [new Celebration()];
      const day = new Day({ date: today, celebrations });

      expect(day.celebrations).toEqual(celebrations);
      expect(day.celebrations).not.toBe(celebrations);
      expect(day.celebrations[0]).toBe(celebrations[0]);
    });
  });

  describe('#equalsStrict (ruby: #==)', () => {
    const base = () =>
      new Day({
        date: today,
        season: Seasons.ORDINARY,
        seasonWeek: 1,
        celebrations: [new Celebration()],
      });

    it('same content is equal', () => {
      expect(base().equalsStrict(base())).toBe(true);
    });

    it('different season is different', () => {
      const other = new Day({
        date: today,
        season: Seasons.LENT,
        seasonWeek: 1,
        celebrations: [new Celebration()],
      });
      expect(base().equalsStrict(other)).toBe(false);
    });

    it('different celebrations are different', () => {
      const other = new Day({
        date: today,
        season: Seasons.ORDINARY,
        seasonWeek: 1,
        celebrations: [new Celebration({ title: 'another celebration' })],
      });
      expect(base().equalsStrict(other)).toBe(false);
    });

    it('different Vespers are different', () => {
      const other = new Day({
        date: today,
        season: Seasons.ORDINARY,
        seasonWeek: 1,
        celebrations: [new Celebration()],
        vespers: CelebrationFactory.palmSunday(),
      });
      expect(base().equalsStrict(other)).toBe(false);
    });
  });

  describe('#vespersFromFollowing', () => {
    it('vespers not set', () => {
      expect(make().vespersFromFollowing()).toBe(false);
    });

    it('vespers set', () => {
      expect(make(new Celebration()).vespersFromFollowing()).toBe(true);
    });
  });

  describe('#toString', () => {
    // ruby asserts the full '#<CalendariumRomanum::Day ...>' string; the TS class
    // names differ, so only the content is checked. The Ruby spec also predates
    // the fork's `ferial_with_day` title for the days after Epiphany.
    it('lists date, season, week and celebrations', () => {
      const day = new PerpetualCalendar().at(d(2000, 1, 8));
      expect(day.toString()).toContain('@date=2000-01-08');
      expect(day.toString()).toContain('@season=#<Season christmas>');
      expect(day.toString()).toContain('@season_week=2');
      expect(day.toString()).toContain('Saturday after Epiphany: January 8');
      expect(day.toString()).toContain('vespers=nil');
    });
  });

  describe('#weekday', () => {
    const sunday = d(2018, 5, 20);
    const saturday = sunday.addDays(-1);

    it('Sunday', () => {
      expect(sunday.isSunday()).toBe(true); // make sure
      expect(new Day({ date: sunday }).weekday()).toBe(0);
    });

    it('Saturday', () => {
      expect(new Day({ date: saturday }).weekday()).toBe(6);
    });
  });

  describe('#weekdayName', () => {
    const sunday = d(2018, 5, 20);

    it('Sunday', () => {
      expect(new Day({ date: sunday }).weekdayName()).toBe(i18n.t('weekday.0'));
    });

    it('Saturday', () => {
      expect(new Day({ date: sunday.addDays(-1) }).weekdayName()).toBe(i18n.t('weekday.6'));
    });
  });

  // New: the fork added the lectionary cycles to Day.
  describe('lectionary cycles', () => {
    it('uses the liturgical year, which turns over at the first Advent Sunday', () => {
      const beforeAdvent = new Day({ date: d(2026, 11, 28) });
      const onAdvent = new Day({ date: d(2026, 11, 29) });

      expect(Dates.firstAdventSunday(2026).toISO()).toBe('2026-11-29');
      expect(beforeAdvent.cycleSunday).toBe('A'); // liturgical year 2025
      expect(beforeAdvent.cycleFerial).toBe(2);
      expect(onAdvent.cycleSunday).toBe('B'); // liturgical year 2026
      expect(onAdvent.cycleFerial).toBe(1);
    });

    it('#cycle picks the Sunday cycle on Sundays only (via cwday == 7)', () => {
      expect(new Day({ date: d(2026, 9, 18) }).cycle).toBe(2); // Friday
      expect(new Day({ date: d(2026, 9, 20) }).cycle).toBe('A'); // Sunday
    });
  });
});

describe('Celebration', () => {
  describe('#equals (ruby: #== — reproduces the fork bug)', () => {
    it('two identical celebrations are NOT equal (day.rb:240 assigns instead of comparing)', () => {
      expect(new Celebration({ title: 'title' }).equals(new Celebration({ title: 'title' }))).toBe(
        false,
      );
    });

    it('... unless the right-hand side has moveIfSunday set', () => {
      const a = new Celebration({ title: 'title', moveIfSunday: true });
      const b = new Celebration({ title: 'title', moveIfSunday: true });
      expect(a.equals(b)).toBe(true);
    });

    it('different content is different', () => {
      expect(
        new Celebration({ title: 'title' }).equals(new Celebration({ title: 'another title' })),
      ).toBe(false);
    });
  });

  describe('#equalsStrict (what the Ruby code meant)', () => {
    it('same content is equal', () => {
      expect(
        new Celebration({ title: 'title' }).equalsStrict(new Celebration({ title: 'title' })),
      ).toBe(true);
    });

    it('different content is different', () => {
      expect(
        new Celebration({ title: 'title' }).equalsStrict(
          new Celebration({ title: 'another title' }),
        ),
      ).toBe(false);
    });

    it('compares the extra flags the fork added', () => {
      expect(
        new Celebration({ title: 'x', hasVigil: true }).equalsStrict(
          new Celebration({ title: 'x' }),
        ),
      ).toBe(false);
    });
  });

  describe('#change', () => {
    const c = () => new Celebration({ title: 'title' });

    it('produces a new instance', () => {
      const original = c();
      expect(original.change({ rank: Ranks.SOLEMNITY_GENERAL })).not.toBe(original);
    });

    it('sets specified properties', () => {
      const c2 = c().change({ rank: Ranks.SOLEMNITY_GENERAL });
      expect(c2.rank).toBe(Ranks.SOLEMNITY_GENERAL);
    });

    it('copies the rest', () => {
      expect(c().change({ rank: Ranks.SOLEMNITY_GENERAL }).title).toBe(c().title);
    });

    // docs/QUIRKS.md Q2: `value || self.value`
    it('keeps the receiver value for falsy arguments', () => {
      const original = new Celebration({
        title: 'x',
        hasVigil: true,
        hasEvening: true,
        moveIfSunday: true,
      });
      const changed = original.change({
        hasVigil: false,
        hasEvening: false,
        moveIfSunday: false,
        symbol: null,
      });

      expect(changed.hasVigil).toBe(true);
      expect(changed.hasEvening).toBe(true);
      expect(changed.moveIfSunday).toBe(true);
    });

    it('does accept an empty string, which is truthy in Ruby', () => {
      expect(new Celebration({ title: 'x' }).change({ title: '' }).title).toBe('');
    });

    // ruby: `title || self.title` CALLS the Proc
    it('fixes a lazy title in the locale current when #change runs', () => {
      const lazy = CelebrationFactory.nativity();
      const changed = i18n.withLocale('la', () => lazy.change({ rank: Ranks.MEMORIAL_OPTIONAL }));
      expect(changed.title).toBe(i18n.withLocale('la', () => lazy.title));
      expect(changed.title).not.toBe(lazy.title);
    });

    it('keeps a lazy title that is passed in', () => {
      const changed = c().change({ title: () => i18n.t('temporale.solemnity.nativity') });
      expect(i18n.withLocale('la', () => changed.title)).not.toBe(changed.title);
    });
  });

  describe('#isTemporale / #isSanctorale', () => {
    it('temporale', () => {
      const tc = new Celebration().change({ cycle: 'temporale' });
      expect(tc.isTemporale()).toBe(true);
      expect(tc.isSanctorale()).toBe(false);
    });

    it('sanctorale', () => {
      const sc = new Celebration().change({ cycle: 'sanctorale' });
      expect(sc.isSanctorale()).toBe(true);
      expect(sc.isTemporale()).toBe(false);
    });
  });

  describe('defaults', () => {
    it('matches the Ruby positional defaults', () => {
      const c = new Celebration();
      expect(c.title).toBe('');
      expect(c.rank).toBe(Ranks.FERIAL);
      expect(c.colour).toBe(Colours.GREEN);
      expect(c.symbol).toBeNull();
      expect(c.date).toBeNull();
      expect(c.cycle).toBe('sanctorale');
      expect(c.hasVigil).toBe(false);
      expect(c.hasEvening).toBe(false);
      expect(c.moveIfSunday).toBe(false);
    });
  });

  describe('#toString', () => {
    // ruby's spec expects title "Saturday after Epiphany", rank 3.13 and a nil
    // symbol; the fork's `ferial_with_day` branch changed all three.
    it('lists the contents', () => {
      const celebration = new PerpetualCalendar().at(d(2000, 1, 8)).celebrations[0];
      expect(celebration.toString()).toContain('@title="Saturday after Epiphany: January 8"');
      expect(celebration.toString()).toContain('@priority=2.9');
      expect(celebration.toString()).toContain('symbol="post_epiphany_saturday_january8"');
      expect(celebration.toString()).toContain('cycle=temporale');
    });
  });
});

describe('CelebrationFactory', () => {
  describe('.firstAdventSunday', () => {
    it('returns a Celebration equal to the one returned by Temporale', () => {
      const year = 2000;
      const temporale = new Temporale(year);
      const date = Dates.firstAdventSunday(year);

      expect(CelebrationFactory.firstAdventSunday().equalsStrict(temporale.get(date))).toBe(true);
    });
  });

  describe('.each', () => {
    it('yields Celebrations', () => {
      const yielded: Celebration[] = [];
      CelebrationFactory.each((c) => yielded.push(c));
      expect(yielded.length).toBe(21);
      expect(yielded.every((c) => c instanceof Celebration)).toBe(true);
    });

    it('returns the list when called without a callback', () => {
      expect(CelebrationFactory.each()).toHaveLength(21);
    });
  });

  describe('celebration titles are properly translated', () => {
    it.each(CelebrationFactory.each().map((c) => [c.symbol ?? 'first_advent_sunday', c]))(
      '%s',
      (_symbol, celebration) => {
        expect(isTranslated(celebration.title)).toBe(true);
      },
    );
  });

  describe('fork-only flags', () => {
    it('marks the celebrations that generate vigils', () => {
      const withVigil = CelebrationFactory.each()
        .filter((c) => c.hasVigil)
        .map((c) => c.symbol);
      expect(withVigil).toEqual([
        'nativity',
        'epiphany',
        'easter_sunday',
        'ascension',
        'pentecost',
      ]);
    });

    it('marks the celebrations that generate an evening Mass', () => {
      const withEvening = CelebrationFactory.each()
        .filter((c) => c.hasEvening)
        .map((c) => c.symbol);
      expect(withEvening).toEqual(['holy_thursday']);
    });

    it('sets fixed dates where the Ruby factory does', () => {
      expect(CelebrationFactory.nativity().date?.equals(new AbstractDate(12, 25))).toBe(true);
      expect(CelebrationFactory.motherOfGod().date?.equals(new AbstractDate(1, 1))).toBe(true);
      expect(CelebrationFactory.epiphany().date).toBeNull();
    });
  });
});
