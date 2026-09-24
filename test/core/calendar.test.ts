// ported from: calendarium-romanum/spec/calendar_spec.rb

import { CalDate, DateRange } from '../../src/core/cal-date.js';
import { Calendar } from '../../src/core/calendar.js';
import { Celebration, Day } from '../../src/core/day.js';
import { Colours, Ranks, Seasons } from '../../src/core/enums.js';
import { ArgumentError } from '../../src/core/errors.js';
import { i18n } from '../../src/core/i18n.js';
import { Sanctorale } from '../../src/core/sanctorale.js';
import { Temporale } from '../../src/core/temporale.js';
import { CelebrationFactory } from '../../src/core/temporale/celebration-factory.js';
import { Dates } from '../../src/core/temporale/dates.js';
import { d, freshGeneralRomanEnglish, generalRomanEnglishSanctorale } from './support.js';

const celfactory = CelebrationFactory;

beforeEach(() => {
  i18n.setLocale('en');
});

describe('Calendar', () => {
  const c = () => new Calendar(2013);

  describe('.new', () => {
    it('throws RangeError on invalid year', () => {
      expect(() => new Calendar(1968)).toThrow(RangeError);
      expect(() => new Calendar(1968)).toThrow(/in use only since 1st January 1970/);
    });

    it('throws ArgumentError when the Temporale year does not match', () => {
      const temporale = new Temporale(2000);
      expect(() => new Calendar(2001, null, temporale)).toThrow(ArgumentError);
    });

    describe('valid argument combinations', () => {
      it('year only', () => {
        expect(new Calendar(2000).year).toBe(2000);
      });

      it('year and Sanctorale', () => {
        expect(() => new Calendar(2000, new Sanctorale())).not.toThrow();
      });

      it('year, Sanctorale and Temporale', () => {
        expect(() => new Calendar(2000, new Sanctorale(), new Temporale(2000))).not.toThrow();
      });

      it('Temporale only', () => {
        const temporale = new Temporale(2000);
        const cal = new Calendar(temporale);
        expect(cal.year).toBe(2000);
        expect(cal.temporale).toBe(temporale);
      });

      it('Temporale and Sanctorale', () => {
        const sanctorale = new Sanctorale();
        const temporale = new Temporale(2000);

        const cal = new Calendar(temporale, sanctorale);
        expect(cal.year).toBe(2000);
        expect(cal.temporale).toBe(temporale);
        expect(cal.sanctorale).toBe(sanctorale);
      });
    });
  });

  describe('.forDay', () => {
    it("continues the previous year's calendar in summer", () => {
      expect(Calendar.forDay(d(2014, 6, 9)).equals(new Calendar(2013))).toBe(true);
    });

    it("provides the current year's calendar in December", () => {
      expect(Calendar.forDay(d(2014, 12, 20)).equals(new Calendar(2014))).toBe(true);
    });
  });

  describe('.mkDate', () => {
    it('with a CalDate returns the CalDate', () => {
      const date = d(2014, 3, 16);
      expect(Calendar.mkDate(date)).toBe(date);
    });

    it('with three integers builds a CalDate', () => {
      expect(Calendar.mkDate(2001, 2, 3).toISO()).toBe('2001-02-03');
    });

    it('with only two arguments throws TypeError', () => {
      expect(() => Calendar.mkDate(1, 2)).toThrow(TypeError);
    });
  });

  describe('#each', () => {
    it('yields a Day for every day of the liturgical year', () => {
      const cal = c();
      const dayCount = cal.temporale.dateRange().count;
      const days: Day[] = [];
      cal.each((day) => days.push(day));

      expect(days).toHaveLength(dayCount);
      expect(days.every((day) => day instanceof Day)).toBe(true);
      expect(days[0].date.toISO()).toBe('2013-12-01');
      expect(days[dayCount - 1].date.toISO()).toBe('2014-11-29');
    });
  });

  describe('#equals', () => {
    const year = 2014;

    describe('year', () => {
      it('same', () => {
        expect(new Calendar(year).equals(new Calendar(year))).toBe(true);
      });

      it('different', () => {
        expect(new Calendar(year).equals(new Calendar(year + 1))).toBe(false);
      });
    });

    describe('sanctorale', () => {
      it('same', () => {
        const sanctorale = generalRomanEnglishSanctorale();
        expect(new Calendar(year, sanctorale).equals(new Calendar(year, sanctorale))).toBe(true);
      });

      it('different', () => {
        const sanctorale = generalRomanEnglishSanctorale();
        expect(new Calendar(year, sanctorale).equals(new Calendar(year))).toBe(false);
      });
    });

    describe('temporale', () => {
      const temporale = () => new Temporale(year, { transferToSunday: ['epiphany'] });

      it('same', () => {
        const t = temporale();
        expect(new Calendar(year, null, t).equals(new Calendar(year, null, t))).toBe(true);
      });

      it('different', () => {
        expect(new Calendar(year, null, temporale()).equals(new Calendar(year))).toBe(false);
      });
    });

    describe('vespers', () => {
      it('same', () => {
        expect(
          new Calendar(year, null, null, { vespers: true }).equals(
            new Calendar(year, null, null, { vespers: true }),
          ),
        ).toBe(true);
      });

      it('different', () => {
        expect(new Calendar(year, null, null, { vespers: true }).equals(new Calendar(year))).toBe(
          false,
        );
      });
    });
  });

  describe('#lectionary', () => {
    it.each([
      [2014, 'B'],
      [2013, 'A'],
      [2012, 'C'],
    ])('%p -> %s', (year, cycle) => {
      expect(new Calendar(year).lectionary()).toBe(cycle);
    });
  });

  describe('#ferialLectionary', () => {
    it.each([
      [2014, 1],
      [2013, 2],
    ])('%p -> %p', (year, cycle) => {
      expect(new Calendar(year).ferialLectionary()).toBe(cycle);
    });
  });

  describe('#at (ruby: #[])', () => {
    it('with a date returns a Day', () => {
      expect(c().at(d(2013, 12, 10))).toBeInstanceOf(Day);
    });

    it('with a range returns an array of Days', () => {
      const array = c().at(new DateRange(d(2013, 12, 10), d(2014, 4, 10)));
      expect(Array.isArray(array)).toBe(true);
      expect(array.every((day) => day instanceof Day)).toBe(true);
    });
  });

  describe('#day', () => {
    describe('received arguments', () => {
      it('CalDate returns a Day', () => {
        expect(c().day(d(2013, 12, 10))).toBeInstanceOf(Day);
      });

      it('three integers returns a Day', () => {
        expect(c().day(2013, 12, 10)).toBeInstanceOf(Day);
      });

      describe('two integers', () => {
        it('supplies the year in autumn', () => {
          const day = c().day(12, 10);
          expect(day.date.toISO()).toBe('2013-12-10');
        });

        it('supplies the year in spring', () => {
          const day = c().day(4, 10);
          expect(day.date.toISO()).toBe('2014-04-10');
        });

        describe('invalid', () => {
          // ruby raises ArgumentError('invalid date'); the CalDate contract
          // specifies RangeError, with the same message
          it('absolutely', () => {
            expect(() => c().day(0, 34)).toThrow(RangeError);
            expect(() => c().day(0, 34)).toThrow('invalid date');
          });

          it('for the given year', () => {
            expect(() => c().day(2, 29)).toThrow('invalid date');
          });
        });
      });
    });

    describe("date not included in the calendar's year", () => {
      it('throws RangeError', () => {
        expect(() => c().day(2000, 1, 1)).toThrow(RangeError);
      });
    });

    describe('date before system effectiveness', () => {
      it('throws RangeError', () => {
        const cal = new Calendar(1969);
        expect(() => cal.day(1969, 12, 20)).toThrow(RangeError);
      });
    });

    describe('temporale features', () => {
      it('detects Advent correctly', () => {
        expect(c().day(2013, 12, 10).season).toBe(Seasons.ADVENT);
      });

      describe('week of the season', () => {
        it('Advent', () => {
          expect(c().day(2013, 12, 10).seasonWeek).toBe(2);
          expect(c().day(2013, 12, 15).seasonWeek).toBe(3);
        });

        it('Christmas: days before the first Sunday are week 0', () => {
          expect(c().day(2013, 12, 25).seasonWeek).toBe(0);
        });

        it('Christmas: the first Sunday starts week 1', () => {
          expect(c().day(2013, 12, 29).seasonWeek).toBe(1);
        });

        it('Lent: Ash Wednesday is week 0', () => {
          expect(c().day(2014, 3, 5).seasonWeek).toBe(0);
        });

        it('Easter: Easter Sunday opens week 1', () => {
          expect(c().day(2014, 4, 20).seasonWeek).toBe(1);
        });

        it('Ordinary time: Monday after the Baptism of the Lord is week 1', () => {
          expect(c().day(2014, 1, 13).seasonWeek).toBe(1);
        });

        describe('after Pentecost', () => {
          it.each([
            [2013, 2014, 6, 9, 10],
            [2014, 2015, 5, 25, 8],
            [2015, 2016, 5, 16, 7],
            [2016, 2017, 6, 5, 9],
          ])('%p', (year, y, m, day, week) => {
            expect(new Calendar(year).day(y, m, day).seasonWeek).toBe(week);
          });

          it('works correctly for the whole first week', () => {
            for (let day = 9; day <= 14; day += 1) {
              expect(c().day(2014, 6, day).seasonWeek).toBe(10);
            }
          });

          it('works correctly for the whole second week', () => {
            for (let day = 15; day <= 21; day += 1) {
              expect(c().day(2014, 6, day).seasonWeek).toBe(11);
            }
          });

          it('works correctly for the whole second-last week', () => {
            for (let day = 16; day <= 22; day += 1) {
              expect(c().day(2014, 11, day).seasonWeek).toBe(33);
            }
          });

          it('works correctly for the whole last week', () => {
            for (let day = 23; day <= 29; day += 1) {
              expect(c().day(2014, 11, day).seasonWeek).toBe(34);
            }
          });
        });
      });
    });

    describe('Temporale x Sanctorale resolution', () => {
      const cal = () => new Calendar(2013, generalRomanEnglishSanctorale());

      it('"empty" day results in a ferial', () => {
        const day = cal().day(7, 2);
        expect(day.celebrations).toHaveLength(1);
        expect(day.celebrations[0].rank).toBe(Ranks.FERIAL);
      });

      it('sanctorale feast', () => {
        const day = cal().day(7, 3);
        expect(day.celebrations).toHaveLength(1);
        expect(day.celebrations[0].rank).toBe(Ranks.FEAST_GENERAL);
        expect(day.celebrations[0].title).toContain('Thomas');
      });

      it('optional memorial does not suppress ferial', () => {
        const day = cal().day(7, 14);
        expect(day.celebrations).toHaveLength(2);
        expect(day.celebrations[0].rank).toBe(Ranks.FERIAL);
        expect(day.celebrations[1].rank).toBe(Ranks.MEMORIAL_OPTIONAL);
        expect(day.celebrations[1].title).toContain('Lellis');
      });

      it('obligatory memorial does suppress ferial', () => {
        const day = cal().day(1, 17);
        expect(day.celebrations).toHaveLength(1);
        expect(day.celebrations[0].rank).toBe(Ranks.MEMORIAL_GENERAL);
      });

      it('memorial in Lent becomes a mere commemoration', () => {
        const day = cal().day(4, 2);
        expect(day.celebrations).toHaveLength(2);

        const comm = day.celebrations[1];
        expect(comm.rank).toBe(Ranks.COMMEMORATION);
        expect(comm.title).toBe('Saint Francis of Paola, Hermit');
        // the commemoration takes the ferial's colour
        expect(comm.colour).toBe(day.celebrations[0].colour);
      });

      it('Sunday suppresses feast', () => {
        const san = new Sanctorale();
        const date = d(2015, 6, 28);
        expect(date.isSunday()).toBe(true);
        san.add(
          date.month,
          date.day,
          new Celebration({ title: 'St. None, programmer', rank: Ranks.FEAST_GENERAL }),
        );

        const celebs = new Calendar(2014, san).day(date).celebrations;
        expect(celebs).toHaveLength(1);
        expect(celebs[0].rank).toBe(Ranks.SUNDAY_UNPRIVILEGED);
      });

      it('suppressed fictive solemnity is transferred', () => {
        const san = new Sanctorale();
        const goodFriday = new Temporale(2014).goodFriday();
        const stNone = new Celebration({
          title: 'St. None, abbot, founder of the Order of Programmers (OProg)',
          rank: Ranks.SOLEMNITY_PROPER,
        });
        san.add(goodFriday.month, goodFriday.day, stNone);

        const cal2014 = new Calendar(2014, san);

        // Good Friday suppresses the solemnity
        let celebs = cal2014.day(goodFriday).celebrations;
        expect(celebs).toHaveLength(1);
        expect(celebs[0].equalsStrict(celfactory.goodFriday())).toBe(true);

        // it is transferred to the day after the Easter octave
        const target = cal2014.temporale.easterSunday().addDays(8);
        celebs = cal2014.day(target).celebrations;
        expect(celebs).toHaveLength(1);
        expect(celebs[0]).toBe(stNone);
      });

      it('transfer of suppressed Annunciation (real world example)', () => {
        const cal2015 = new Calendar(2015, generalRomanEnglishSanctorale());

        // Good Friday suppresses the solemnity
        let celebs = cal2015.day(d(2016, 3, 25)).celebrations;
        expect(celebs).toHaveLength(1);
        expect(celebs[0].equalsStrict(celfactory.goodFriday())).toBe(true);

        // it is transferred to the day after the Easter octave
        const target = cal2015.temporale.easterSunday().addDays(8);
        celebs = cal2015.day(target).celebrations;
        expect(celebs).toHaveLength(1);
        expect(celebs[0].title).toBe('The Annunciation of the Lord');
      });

      describe('collision of Immaculate Heart with another obligatory memorial', () => {
        it('makes both memorials optional', () => {
          const cal2002 = new Calendar(2002, generalRomanEnglishSanctorale());
          const date = d(2003, 6, 28);

          expect(cal2002.sanctorale.get(date)[0].rank).toBe(Ranks.MEMORIAL_GENERAL);
          expect(cal2002.temporale.get(date).rank).toBe(Ranks.MEMORIAL_GENERAL);

          const celebrations = cal2002.day(date).celebrations;
          expect(celebrations).toHaveLength(3);
          expect(celebrations[0].rank).toBe(Ranks.FERIAL);
          expect(celebrations.slice(1).map((x) => x.rank)).toEqual([
            Ranks.MEMORIAL_OPTIONAL,
            Ranks.MEMORIAL_OPTIONAL,
          ]);
          expect(celebrations[1].symbol).toBe('immaculate_heart');
        });
      });

      describe('collision of Mary, Mother of the Church with another obligatory memorial', () => {
        it('the Marian memorial takes precedence', () => {
          const cal2019 = new Calendar(2019, generalRomanEnglishSanctorale());
          const date = d(2020, 6, 1);

          expect(cal2019.sanctorale.get(date)[0].rank).toBe(Ranks.MEMORIAL_GENERAL);
          expect(cal2019.temporale.get(date).rank).toBe(Ranks.MEMORIAL_GENERAL);

          const celebrations = cal2019.day(date).celebrations;
          expect(celebrations).toHaveLength(1);
          expect(celebrations[0].symbol).toBe('mother_of_church');
        });
      });
    });

    describe('Saturday memorial', () => {
      // ruby uses an rspec double; here a tiny stub Sanctorale is built instead
      const stubSanctorale = (celebrations: Celebration[]): Sanctorale => {
        const s = new Sanctorale();
        s.at = () => celebrations;
        s.get = (() => celebrations) as Sanctorale['get'];
        return s;
      };

      const celebrationsOn = (date: CalDate, stub: Sanctorale) =>
        new Calendar(2013, stub).day(date).celebrations;

      const hasBvm = (celebrations: Celebration[]) =>
        celebrations.some((x) => x.symbol === 'saturday_memorial_bvm');

      it('offers the Saturday memorial on a free Saturday in Ordinary Time', () => {
        expect(hasBvm(celebrationsOn(d(2014, 8, 16), stubSanctorale([])))).toBe(true);
      });

      it('offers it on a Saturday in Ordinary Time with optional memorial(s)', () => {
        const memorial = new Celebration({ title: '', rank: Ranks.MEMORIAL_OPTIONAL });
        expect(hasBvm(celebrationsOn(d(2014, 8, 23), stubSanctorale([memorial])))).toBe(true);
      });

      it('does not offer it on a non-free Saturday in Ordinary Time', () => {
        const memorial = new Celebration({ title: '', rank: Ranks.MEMORIAL_GENERAL });
        expect(hasBvm(celebrationsOn(d(2014, 9, 13), stubSanctorale([memorial])))).toBe(false);
      });

      it('does not offer it on a free Saturday in another season', () => {
        expect(hasBvm(celebrationsOn(d(2013, 12, 14), stubSanctorale([])))).toBe(false);
      });
    });

    describe('Vespers', () => {
      const saturday = d(2014, 1, 4);
      const year = 2013;

      describe('not opted in', () => {
        it('does not fill Vespers', () => {
          expect(new Calendar(year).day(saturday).vespers).toBeNull();
        });
      });

      describe('opted in by constructor argument', () => {
        const calendar = () => new Calendar(year, null, null, { vespers: true });

        it('fills Vespers', () => {
          expect(calendar().day(saturday)).toBeInstanceOf(Day);
          expect(calendar().day(saturday).vespers).toBeInstanceOf(Celebration);
        });

        it('does not fill Vespers when the day has none from the following day', () => {
          expect(calendar().day(saturday.addDays(-1)).vespers).toBeNull();
        });
      });

      describe('opted in by argument', () => {
        it('fills Vespers', () => {
          expect(new Calendar(year).day(saturday, { vespers: true }).vespers).toBeInstanceOf(
            Celebration,
          );
        });
      });

      describe('first Vespers of', () => {
        const build = (sanctorale = freshGeneralRomanEnglish(), y = year) =>
          new Calendar(y, sanctorale, null, { vespers: true });

        it('a Sunday has first Vespers', () => {
          expect(build().day(saturday).vespers?.rank).toBe(Ranks.SUNDAY_UNPRIVILEGED);
        });

        it('a solemnity has first Vespers', () => {
          expect(build().day(d(2014, 11, 1).addDays(-1)).vespers?.rank).toBe(
            Ranks.SOLEMNITY_GENERAL,
          );
        });

        it('a solemnity wins over a Sunday', () => {
          const sanctorale = freshGeneralRomanEnglish();
          const testingSolemnity = new Celebration({
            title: 'Testing solemnity',
            rank: Ranks.SOLEMNITY_GENERAL,
            colour: Colours.WHITE,
            symbol: 'test',
          });
          const sunday = d(2014, 8, 17);
          expect(sunday.isSunday()).toBe(true);
          sanctorale.replace(8, 17, [testingSolemnity]);

          expect(build(sanctorale).day(sunday.addDays(-1)).vespers?.symbol).toBe('test');
        });

        it("the day's Vespers win over a clash with another solemnity", () => {
          const sanctorale = freshGeneralRomanEnglish();
          const testingSolemnity = new Celebration({
            title: 'Testing solemnity',
            rank: Ranks.SOLEMNITY_GENERAL,
            colour: Colours.WHITE,
            symbol: 'test',
          });
          const assumption = d(2014, 8, 15);
          sanctorale.replace(8, 16, [testingSolemnity]);

          const calendar = build(sanctorale);
          const day = calendar.day(assumption);
          expect(day.celebrations[0].rank).toBe(Ranks.SOLEMNITY_GENERAL);
          expect(day.vespers).toBeNull();

          const nextDay = calendar.day(assumption.addDays(1));
          expect(nextDay.celebrations[0]).toBe(testingSolemnity);
        });

        describe('feast of the Lord', () => {
          it('does not have first Vespers when not falling on a Sunday', () => {
            const calendar = build(freshGeneralRomanEnglish(), 2015);
            const presentation = d(2016, 2, 2);
            expect(presentation.isSunday()).toBe(false);
            expect(calendar.day(presentation.addDays(-1)).vespers).toBeNull();
          });

          it('has first Vespers when falling on a Sunday', () => {
            const presentation = d(2014, 2, 2);
            expect(presentation.isSunday()).toBe(true);
            expect(build().day(presentation.addDays(-1)).vespers?.rank).toBe(
              Ranks.FEAST_LORD_GENERAL,
            );
          });
        });

        describe('primary liturgical days', () => {
          it('Ash Wednesday does not have first Vespers', () => {
            const aw = Dates.ashWednesday(year);
            expect(build().day(aw.addDays(-1)).vespers).toBeNull();
          });

          it('Nativity has first Vespers', () => {
            const vespers = build().day(d(2013, 12, 24)).vespers;
            expect(vespers?.equalsStrict(celfactory.nativity())).toBe(true);
          });

          it('Epiphany has first Vespers', () => {
            const vespers = build().day(d(2014, 1, 5)).vespers;
            expect(vespers?.rank).toBe(Ranks.PRIMARY);
            expect(vespers?.symbol).toBe('epiphany');
          });

          it('Palm Sunday has first Vespers', () => {
            const ps = Dates.palmSunday(year);
            expect(build().day(ps.addDays(-1)).vespers?.equalsStrict(celfactory.palmSunday())).toBe(
              true,
            );
          });

          it('a day in Holy Week does not have first Vespers', () => {
            const tuesday = Dates.palmSunday(year).addDays(2);
            expect(build().day(tuesday.addDays(-1)).vespers).toBeNull();
          });

          it('Good Friday does not have first Vespers', () => {
            const gf = Dates.goodFriday(year);
            expect(build().day(gf.addDays(-1)).vespers).toBeNull();
          });

          it('Easter has first Vespers', () => {
            const es = Dates.easterSunday(year);
            expect(
              build().day(es.addDays(-1)).vespers?.equalsStrict(celfactory.easterSunday()),
            ).toBe(true);
          });

          it('a day in the Easter octave does not have first Vespers', () => {
            const tuesday = Dates.easterSunday(year).addDays(2);
            expect(build().day(tuesday.addDays(-1)).vespers).toBeNull();
          });
        });

        describe('edge cases', () => {
          it('the First Sunday of Advent has first Vespers (and causes no exception)', () => {
            const sunday = Dates.firstAdventSunday(year + 1);
            const vespers = build().day(sunday.addDays(-1)).vespers;
            expect(vespers?.equalsStrict(celfactory.firstAdventSunday())).toBe(true);
          });
        });
      });
    });
  });

  describe('required sanctorale interface', () => {
    // ruby: only `#solemnities` and `#[]` are used
    it('comprises only two methods', () => {
      const hardcodedEmpty = {
        solemnities: new Map(),
        at: () => [],
        get: () => [],
      } as unknown as Sanctorale;

      expect(() => new Calendar(2000, hardcodedEmpty).at(d(2000, 12, 20))).not.toThrow();
    });
  });
});
