// ported from: calendarium-romanum/spec/temporale_spec.rb

import { Celebration } from '../../src/core/day.js';
import { Colours, Ranks, Seasons } from '../../src/core/enums.js';
import { i18n } from '../../src/core/i18n.js';
import { Temporale } from '../../src/core/temporale.js';
import { CelebrationFactory } from '../../src/core/temporale/celebration-factory.js';
import { Dates } from '../../src/core/temporale/dates.js';
import { ChristEternalPriest, ThanksgivingUS } from '../../src/core/temporale/extensions/index.js';
import { d, isTranslated, withLocale } from './support.js';

beforeEach(() => {
  i18n.setLocale('en');
});

const t13 = () => new Temporale(2013);
const factory = CelebrationFactory;

describe('Temporale', () => {
  describe('.liturgicalYear', () => {
    it.each([
      [d(2014, 11, 1), 2013],
      [d(2014, 12, 1), 2014],
    ])('%s -> %p', (date, year) => {
      expect(Temporale.liturgicalYear(date)).toBe(year);
    });
  });

  describe('.forDay', () => {
    it("continues the previous year's calendar in summer", () => {
      expect(Temporale.forDay(d(2014, 6, 9)).equals(new Temporale(2013))).toBe(true);
    });

    it("provides the current year's calendar in December", () => {
      expect(Temporale.forDay(d(2014, 12, 20)).equals(new Temporale(2014))).toBe(true);
    });
  });

  describe('#equals', () => {
    const year = 2012;

    describe('year', () => {
      it('same', () => {
        expect(new Temporale(year).equals(new Temporale(year))).toBe(true);
      });

      it('different', () => {
        expect(new Temporale(year).equals(new Temporale(year + 1))).toBe(false);
      });
    });

    describe('transfers', () => {
      const transfers = ['epiphany', 'ascension'];

      it('same (order does not matter)', () => {
        const a = new Temporale(year, { transferToSunday: transfers });
        const b = new Temporale(year, { transferToSunday: [...transfers].reverse() });
        expect(a.equals(b)).toBe(true);
      });

      it('different', () => {
        const a = new Temporale(year, { transferToSunday: transfers });
        expect(a.equals(new Temporale(year))).toBe(false);
      });
    });

    describe('extensions', () => {
      const emptyExtension = { eachCelebration: () => [] };
      const extensions = [ChristEternalPriest, emptyExtension];

      it('same (order does not matter)', () => {
        const a = new Temporale(year, { extensions });
        const b = new Temporale(year, { extensions: [...extensions].reverse() });
        expect(a.equals(b)).toBe(true);
      });

      it('different', () => {
        expect(new Temporale(year, { extensions }).equals(new Temporale(year))).toBe(false);
      });
    });
  });

  describe('#firstAdventSunday determines the first Sunday of Advent', () => {
    it.each([
      [2004, '2004-11-28'],
      [2010, '2010-11-28'],
      [2011, '2011-11-27'],
      [2012, '2012-12-02'],
      [2013, '2013-12-01'],
    ])('%p', (year, expected) => {
      expect(new Temporale(year).firstAdventSunday().toISO()).toBe(expected);
    });
  });

  describe('#easterSunday determines Easter Sunday', () => {
    it.each([
      [2003, '2004-04-11'],
      [2004, '2005-03-27'],
      [2005, '2006-04-16'],
      [2006, '2007-04-08'],
      [2014, '2015-04-05'],
    ])('%p', (year, expected) => {
      expect(new Temporale(year).easterSunday().toISO()).toBe(expected);
    });
  });

  describe('#dateRange', () => {
    it('includes days of the year', () => {
      const range = new Temporale(2012).dateRange();
      expect(range.includes(d(2012, 12, 3))).toBe(true);
      expect(range.includes(d(2013, 11, 5))).toBe(true);
    });
  });

  describe('#season', () => {
    const cases: [string, typeof Seasons.ADVENT, string, string, boolean, boolean][] = [
      ['Advent', Seasons.ADVENT, '2013-12-01', '2013-12-24', true, false],
      ['Christmas', Seasons.CHRISTMAS, '2013-12-25', '2014-01-12', false, false],
      ['Ordinary Time #1', Seasons.ORDINARY, '2014-01-13', '2014-03-04', false, false],
      ['Lent', Seasons.LENT, '2014-03-05', '2014-04-19', false, false],
      ['Easter time', Seasons.EASTER, '2014-04-20', '2014-06-08', false, false],
      ['Ordinary Time #2', Seasons.ORDINARY, '2014-06-09', '2014-11-29', false, true],
    ];

    describe.each(cases)('%s', (_name, season, beginning, end, yearBeginning, yearEnd) => {
      const dateBeginning = () =>
        d(
          Number(beginning.slice(0, 4)),
          Number(beginning.slice(5, 7)),
          Number(beginning.slice(8, 10)),
        );
      const dateEnd = () =>
        d(Number(end.slice(0, 4)), Number(end.slice(5, 7)), Number(end.slice(8, 10)));

      it('the day before', () => {
        if (yearBeginning) {
          expect(() => t13().season(dateBeginning().addDays(-1))).toThrow(RangeError);
        } else {
          expect(t13().season(dateBeginning().addDays(-1))).not.toBe(season);
        }
      });

      it('the first day', () => {
        expect(t13().season(dateBeginning())).toBe(season);
      });

      it('the last day', () => {
        expect(t13().season(dateEnd())).toBe(season);
      });

      it('the day after', () => {
        if (yearEnd) {
          expect(() => t13().season(dateEnd().addDays(1))).toThrow(RangeError);
        } else {
          expect(t13().season(dateEnd().addDays(1))).not.toBe(season);
        }
      });
    });
  });

  describe('#seasonBeginning', () => {
    const year = 2016;

    describe('unsupported season', () => {
      it('fails', () => {
        // ruby builds `CR::Season.new(:strawberry_season, ...)`
        const strawberrySeason = { symbol: 'strawberry' } as unknown as typeof Seasons.ADVENT;
        expect(() => new Temporale(year).seasonBeginning(strawberrySeason)).toThrow(
          /unsupported season/,
        );
      });
    });

    describe('Ordinary Time', () => {
      it('Epiphany not transferred', () => {
        expect(new Temporale(year).seasonBeginning(Seasons.ORDINARY).toISO()).toBe('2017-01-09');
      });

      it('Epiphany transferred', () => {
        const t = new Temporale(year, { transferToSunday: ['epiphany'] });
        expect(t.seasonBeginning(Seasons.ORDINARY).toISO()).toBe('2017-01-10');
      });
    });

    it('returns each season start', () => {
      const t = new Temporale(2013);
      expect(t.seasonBeginning(Seasons.ADVENT).toISO()).toBe('2013-12-01');
      expect(t.seasonBeginning(Seasons.CHRISTMAS).toISO()).toBe('2013-12-25');
      expect(t.seasonBeginning(Seasons.LENT).toISO()).toBe('2014-03-05');
      expect(t.seasonBeginning(Seasons.EASTER).toISO()).toBe('2014-04-20');
    });
  });

  describe('#get', () => {
    it('returns a Celebration', () => {
      expect(t13().get(8, 12)).toBeInstanceOf(Celebration);
    });

    describe('for ferial', () => {
      it.each([
        ['in Ordinary Time', 8, 12, Ranks.FERIAL, Colours.GREEN],
        ['in Advent', 12, 12, Ranks.FERIAL, Colours.VIOLET],
        ['in the last week of Advent', 12, 23, Ranks.FERIAL_PRIVILEGED, Colours.VIOLET],
        // ruby's spec expects FERIAL here; the fork's `ferial_with_day` branch
        // made the days after Epiphany FERIAL_PRIVILEGED
        ['in Christmas time', 1, 3, Ranks.FERIAL_PRIVILEGED, Colours.WHITE],
        ['in Lent', 3, 18, Ranks.FERIAL_PRIVILEGED, Colours.VIOLET],
        ['in Easter Time', 5, 5, Ranks.FERIAL, Colours.WHITE],
      ])('%s', (_name, month, day, rank, colour) => {
        const c = t13().get(month, day);
        expect(c.rank).toBe(rank);
        expect(c.color).toBe(colour);
      });
    });

    describe('for Sunday', () => {
      it.each([
        ['in Ordinary Time', 8, 10, Ranks.SUNDAY_UNPRIVILEGED, Colours.GREEN],
        ['in Advent', 12, 15, Ranks.PRIMARY, Colours.VIOLET],
        ['in Christmas time', 1, 5, Ranks.SUNDAY_UNPRIVILEGED, Colours.WHITE],
        ['in Lent', 3, 23, Ranks.PRIMARY, Colours.VIOLET],
        ['in Easter Time', 5, 11, Ranks.PRIMARY, Colours.WHITE],
      ])('%s', (_name, month, day, rank, colour) => {
        const c = t13().get(month, day);
        expect(c.rank).toBe(rank);
        expect(c.color).toBe(colour);
      });
    });

    describe('solemnities and their cycles', () => {
      it('end of Advent time', () => {
        const c = t13().get(12, 17);
        expect(c.rank).toBe(Ranks.FERIAL_PRIVILEGED);
        expect(c.colour).toBe(Colours.VIOLET);
      });

      it('Nativity', () => {
        const c = t13().get(12, 25);
        expect(c.rank).toBe(Ranks.PRIMARY);
        expect(isTranslated(c.title)).toBe(true);
        expect(c.title).toContain('Nativity');
        expect(c.colour).toBe(Colours.WHITE);
        expect(c.symbol).toBe('nativity');
        expect(c.date?.month).toBe(12);
        expect(c.date?.day).toBe(25);
      });

      it('day in the octave of Nativity', () => {
        const c = t13().get(12, 27);
        expect(c.rank).toBe(Ranks.FERIAL_PRIVILEGED);
        expect(c.colour).toBe(Colours.WHITE);
      });

      it('Holy Family', () => {
        const c = t13().get(12, 29);
        expect(c.rank).toBe(Ranks.FEAST_LORD_GENERAL);
        expect(c.title).toContain('Holy Family');
        expect(c.colour).toBe(Colours.WHITE);
      });

      it('is Holy Family on Friday Dec 30 when no Sunday falls between Dec 25 and Jan 1', () => {
        expect(new Temporale(2016).get(12, 30).title).toContain('Holy Family');
      });

      it.each([
        ['Epiphany', 1, 6, Ranks.PRIMARY, 'Epiphany', Colours.WHITE],
        ['Baptism of the Lord', 1, 12, Ranks.FEAST_LORD_GENERAL, 'Baptism', Colours.WHITE],
        ['Ash Wednesday', 3, 5, Ranks.PRIMARY, 'Ash Wednesday', Colours.VIOLET],
        ['Palm Sunday', 4, 13, Ranks.PRIMARY, 'Palm Sunday', Colours.RED],
        ['Good Friday', 4, 18, Ranks.TRIDUUM, 'Good Friday', Colours.RED],
        ['Holy Saturday', 4, 19, Ranks.TRIDUUM, 'Holy Saturday', Colours.VIOLET],
        ['Resurrection', 4, 20, Ranks.TRIDUUM, 'Easter Sunday', Colours.WHITE],
        ['Ascension', 5, 29, Ranks.PRIMARY, 'Ascension', Colours.WHITE],
        ['Pentecost', 6, 8, Ranks.PRIMARY, 'Pentecost', Colours.RED],
        ['Trinity', 6, 15, Ranks.SOLEMNITY_GENERAL, 'Trinity', Colours.WHITE],
        ['Body of Christ', 6, 19, Ranks.SOLEMNITY_GENERAL, 'Body and Blood', Colours.WHITE],
        ['Sacred Heart', 6, 27, Ranks.SOLEMNITY_GENERAL, 'Sacred Heart', Colours.WHITE],
        ['Christ the King', 11, 23, Ranks.SOLEMNITY_GENERAL, 'King of the Universe', Colours.WHITE],
      ])('%s', (_name, month, day, rank, titleFragment, colour) => {
        const c = t13().get(month, day);
        expect(c.rank).toBe(rank);
        expect(c.title).toContain(titleFragment);
        expect(c.colour).toBe(colour);
      });

      it('sets the symbol on Resurrection and Pentecost', () => {
        expect(t13().get(4, 20).symbol).toBe('easter_sunday');
        expect(t13().get(6, 8).symbol).toBe('pentecost');
      });

      describe('other locales', () => {
        it('Latin', () => {
          withLocale('la', () => {
            expect(t13().get(11, 23).title).toBe('Domini nostri Iesu Christi universorum regis');
          });
        });

        it('Czech', () => {
          withLocale('cs', () => {
            expect(t13().get(11, 23).title).toBe('Ježíše Krista krále');
          });
        });

        it('Italian', () => {
          withLocale('it', () => {
            expect(t13().get(11, 23).title).toBe("Nostro Signore Gesù Cristo Re dell'universo");
          });
        });
      });
    });

    describe('movable sanctorale feasts', () => {
      it('Immaculate Heart', () => {
        const c = t13().get(6, 28);
        expect(c.title).toContain('Immaculate Heart');
        expect(c.rank).toBe(Ranks.MEMORIAL_GENERAL);
      });

      it('Mary, Mother of the Church', () => {
        const c = new Temporale(2017).get(5, 21);
        expect(c.title).toContain('Mother of the Church');
        expect(c.rank).toBe(Ranks.MEMORIAL_GENERAL);
      });
    });
  });

  describe('titles of Sundays and ferials', () => {
    const titleFor = (month: number, day: number) => t13().get(month, day).title;

    describe('Ordinary time', () => {
      it('Sunday', () => {
        expect(titleFor(1, 19)).toBe('2nd Sunday in Ordinary Time');
      });

      it('ferial', () => {
        expect(titleFor(1, 13)).toBe('Monday of the 1st Week in Ordinary Time');
      });
    });

    describe('Advent', () => {
      it('Sunday', () => {
        expect(titleFor(12, 1)).toBe('1st Sunday of Advent');
      });

      it('ferial', () => {
        expect(titleFor(12, 2)).toBe('Monday of the 1st Week of Advent');
      });

      it('ferial before Christmas', () => {
        expect(titleFor(12, 17)).toBe('December 17th');
      });
    });

    describe('Christmas time', () => {
      it('Octave of Christmas ferial', () => {
        const day = t13().get(12, 30);
        expect(day.rank).toBe(Ranks.FERIAL_PRIVILEGED);
        expect(day.title).toBe(
          '6th Day within the Octave of the Nativity of the Lord [Christmas]',
        );
      });

      it('after Octave of Christmas ferial', () => {
        expect(titleFor(1, 2)).toBe('Thursday of Christmas Time: January 2');
      });

      it('after Octave of Christmas Sunday', () => {
        expect(titleFor(1, 5)).toBe('2nd Sunday after the Nativity [Christmas]');
      });

      it('after Epiphany ferial', () => {
        expect(titleFor(1, 7)).toBe('Tuesday after Epiphany: January 7');
      });
    });

    describe('Lent', () => {
      it('before the first Sunday', () => {
        expect(titleFor(3, 6)).toBe('Thursday after Ash Wednesday');
      });

      it('Sunday', () => {
        expect(titleFor(3, 9)).toBe('1st Sunday of Lent');
      });

      it('ferial', () => {
        expect(titleFor(3, 10)).toBe('Monday of the 1st Week of Lent');
      });

      it('Holy Week ferial', () => {
        const day = t13().get(4, 14);
        expect(day.rank).toBe(Ranks.PRIMARY);
        expect(day.title).toBe('Monday of Holy Week');
      });
    });

    describe('Easter', () => {
      it('Easter Octave ferial', () => {
        const c = t13().get(4, 22);
        expect(c.rank).toBe(Ranks.PRIMARY);
        expect(c.title).toBe('Tuesday Within the Octave of Easter');
      });

      it('Easter Octave Sunday (the octave day)', () => {
        const c = t13().get(4, 27);
        expect(c.rank).toBe(Ranks.PRIMARY);
        expect(c.title).toBe('2nd Sunday of Easter');
      });

      it('Sunday', () => {
        expect(titleFor(5, 4)).toBe('3rd Sunday of Easter');
      });

      it('ferial', () => {
        expect(titleFor(5, 5)).toBe('Monday of the 3rd week of Easter');
      });
    });

    describe('other locales', () => {
      it('Latin', () => {
        withLocale('la', () => {
          expect(titleFor(5, 5)).toBe('Feria secunda, hebdomada III temporis paschalis');
        });
      });

      it('Czech', () => {
        withLocale('cs', () => {
          expect(titleFor(5, 5)).toBe('Pondělí po 3. neděli velikonoční');
        });
      });

      it('French', () => {
        withLocale('fr', () => {
          expect(titleFor(5, 5)).toBe('Lundi, 3ème semaine de Pâques');
        });
      });

      it('Italian', () => {
        withLocale('it', () => {
          expect(titleFor(5, 5)).toBe('Lunedì, III di Pasqua');
        });
      });
    });
  });

  // New: the fork added machine-readable ids to some ferials.
  describe('ferial ids', () => {
    it.each([
      [2013, 12, 17, 'advent_tuesday_december17'],
      [2013, 12, 23, 'advent_monday_december23'],
      [2013, 12, 27, 'christmas_octave_3'],
      [2013, 12, 30, 'christmas_octave_6'],
      [2014, 1, 2, 'pre_epiphany_thursday_january2'],
      [2014, 1, 3, 'pre_epiphany_friday_january3'],
      [2014, 1, 7, 'post_epiphany_tuesday_january7'],
      [2014, 4, 14, 'lent_holy_monday'],
      [2014, 4, 16, 'lent_holy_wednesday'],
    ])('%p-%p-%p -> %s', (year, month, day, id) => {
      expect(new Temporale(2013).get(d(year, month, day)).symbol).toBe(id);
    });

    it.each([
      [2014, 1, 13], // Ordinary Time ferial
      [2014, 3, 6], // after Ash Wednesday
      [2014, 3, 10], // Lent ferial
      [2014, 4, 22], // Easter octave ferial
      [2014, 5, 5], // Easter ferial
      [2013, 12, 2], // plain Advent ferial
    ])('%p-%p-%p has no id', (year, month, day) => {
      expect(new Temporale(2013).get(d(year, month, day)).symbol).toBeNull();
    });

    it('does not generate post_epiphany ids when Epiphany is transferred', () => {
      const transferred = new Temporale(2013, { transferToSunday: ['epiphany'] });
      // 2014-01-05 is the transferred Epiphany, so Jan 7 is after it
      expect(transferred.epiphany().toISO()).toBe('2014-01-05');
      const c = transferred.get(d(2014, 1, 7));
      expect(c.symbol).toBeNull();
      expect(c.rank).toBe(Ranks.FERIAL);
      expect(c.title).toBe('Tuesday after Epiphany');
    });

    it('generates the ids in English regardless of the current locale', () => {
      withLocale('cs', () => {
        const c = new Temporale(2013).get(d(2014, 4, 14));
        expect(c.symbol).toBe('lent_holy_monday');
        expect(c.title).not.toBe('Monday of Holy Week'); // localized title
      });
    });
  });

  describe('#seasonWeek', () => {
    it('counts Ordinary Time from the day after the Baptism of the Lord', () => {
      const t = new Temporale(2013);
      expect(t.seasonWeek(Seasons.ORDINARY, d(2014, 1, 13))).toBe(1);
      expect(t.seasonWeek(Seasons.ORDINARY, d(2014, 1, 19))).toBe(2);
    });

    it('counts weeks after Pentecost backwards from Advent', () => {
      const t = new Temporale(2013);
      expect(t.seasonWeek(Seasons.ORDINARY, d(2014, 6, 9))).toBe(10);
      expect(t.seasonWeek(Seasons.ORDINARY, d(2014, 11, 23))).toBe(34); // Sunday: +1
      expect(t.seasonWeek(Seasons.ORDINARY, d(2014, 11, 29))).toBe(34);
    });

    it('puts Christmas Day and Ash Wednesday in week 0 (floored division)', () => {
      const t = new Temporale(2013);
      expect(t.seasonWeek(Seasons.CHRISTMAS, d(2013, 12, 25))).toBe(0);
      expect(t.seasonWeek(Seasons.LENT, d(2014, 3, 5))).toBe(0);
    });
  });

  describe('packaged extensions', () => {
    describe('ChristEternalPriest', () => {
      it('adds the feast', () => {
        const t = new Temporale(2016, { extensions: [ChristEternalPriest] });
        withLocale('cs', () => {
          const c = t.get(6, 8);
          expect(c.title).toBe('Ježíše Krista, nejvyššího a věčného kněze');
          expect(c.rank).toBe(Ranks.FEAST_PROPER);
          expect(c.colour).toBe(Colours.WHITE);
        });
      });

      // docs/QUIRKS.md Q12
      it('leaves the celebration in the sanctorale cycle (Ruby passes no `cycle`)', () => {
        const t = new Temporale(2016, { extensions: [ChristEternalPriest] });
        expect(t.get(6, 8).cycle).toBe('sanctorale');
      });
    });

    describe('ThanksgivingUS', () => {
      it('is the fourth Thursday of November of the year AFTER the liturgical year', () => {
        expect(ThanksgivingUS.thanksgiving(2025).toISO()).toBe('2026-11-26');
        expect(ThanksgivingUS.thanksgiving(2024).toISO()).toBe('2025-11-27');
        expect(ThanksgivingUS.thanksgiving(2022).toISO()).toBe('2023-11-23');
        // when Nov 21 is itself a Thursday, `thursday_after` skips to Nov 28
        expect(ThanksgivingUS.thanksgiving(2023).toISO()).toBe('2024-11-28');
      });

      it('adds an optional memorial', () => {
        const t = new Temporale(2025, { extensions: [ThanksgivingUS] });
        const c = t.get(d(2026, 11, 26));
        expect(c.symbol).toBe('thanksgiving');
        expect(c.rank).toBe(Ranks.MEMORIAL_OPTIONAL);
        expect(c.title).toBe('Thanksgiving Day');
        expect(c.cycle).toBe('sanctorale'); // docs/QUIRKS.md Q12
      });
    });
  });

  describe('Solemnities transferred to a Sunday', () => {
    const transferred = ['epiphany', 'ascension', 'corpus_christi'];
    const t = () => new Temporale(2016, { transferToSunday: transferred });
    const tNoTransfer = () => new Temporale(2016);

    it('Epiphany', () => {
      const date = d(2017, 1, 8);
      expect(date.isSunday()).toBe(true);
      expect(t().epiphany().equals(date)).toBe(true);
      expect(t().get(date).equalsStrict(factory.epiphany())).toBe(true);
    });

    it('Baptism of the Lord after transferred Epiphany', () => {
      const date = d(2017, 1, 9);
      expect(date.isMonday()).toBe(true);
      expect(t().baptismOfLord().equals(date)).toBe(true);
      expect(t().get(date).equalsStrict(factory.baptismOfLord())).toBe(true);
    });

    describe('Ordinary Time numbering after transferred Epiphany', () => {
      it('ferials correct', () => {
        const firstOtTuesday = d(2017, 1, 10);
        expect(t().get(firstOtTuesday).equalsStrict(tNoTransfer().get(firstOtTuesday))).toBe(true);
      });

      it('Sundays correct', () => {
        const secondOtSunday = d(2017, 1, 15);
        expect(t().get(secondOtSunday).equalsStrict(tNoTransfer().get(secondOtSunday))).toBe(true);
      });
    });

    it('Ascension', () => {
      const date = d(2017, 5, 28);
      expect(date.isSunday()).toBe(true);
      expect(t().ascension().equals(date)).toBe(true);
      expect(t().get(date).equalsStrict(factory.ascension())).toBe(true);
    });

    it('Corpus Christi', () => {
      const date = d(2017, 6, 18);
      expect(date.isSunday()).toBe(true);
      expect(t().corpusChristi().equals(date)).toBe(true);
      expect(t().get(date).equalsStrict(factory.corpusChristi())).toBe(true);
    });

    it('fails on an unsupported solemnity', () => {
      expect(() => new Temporale(2016, { transferToSunday: ['sacred_heart'] })).toThrow(
        /not supported/,
      );
    });
  });

  describe('properly setting cycle', () => {
    it('every day of the year is temporale', () => {
      const t = new Temporale(2013);
      t.dateRange().each((date) => {
        expect(t.get(date).cycle).toBe('temporale');
      });
    });
  });

  describe('#rangeCheck', () => {
    it('accepts dates inside the liturgical year', () => {
      expect(() => t13().rangeCheck(d(2013, 12, 1))).not.toThrow();
      expect(() => t13().rangeCheck(d(2014, 11, 29))).not.toThrow();
    });

    it('rejects dates outside it', () => {
      expect(() => t13().rangeCheck(d(2013, 11, 30))).toThrow(/Date out of range/);
      expect(() => t13().rangeCheck(d(2014, 11, 30))).toThrow(/Date out of range/);
    });
  });

  describe('#transferredToSunday', () => {
    it('reports the configured transfers', () => {
      const t = new Temporale(2016, { transferToSunday: ['epiphany'] });
      expect(t.transferredToSunday('epiphany')).toBe(true);
      expect(t.transferredToSunday('ascension')).toBe(false);
    });
  });

  describe('.createCelebration', () => {
    it('defaults to the temporale cycle', () => {
      const c = Temporale.createCelebration('x', Ranks.FERIAL, Colours.GREEN);
      expect(c.cycle).toBe('temporale');
      expect(c.symbol).toBeNull();
      expect(c.hasVigil).toBe(false);
    });
  });
});
