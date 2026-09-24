// New: the Lumen-de-Lumine fork's own features — vigil and evening Masses,
// `move_if_sunday`, and how the api layer's `vespers: true, vigils: true` call
// combines them. No rspec counterpart exists upstream.

import { Calendar } from '../../src/core/calendar.js';
import { Data } from '../../src/core/data.js';
import { Ranks } from '../../src/core/enums.js';
import { i18n } from '../../src/core/i18n.js';
import { SanctoraleFactory } from '../../src/core/sanctorale-factory.js';
import { d, usDay, usPerpetualCalendar } from './support.js';

beforeEach(() => {
  i18n.setLocale('en');
});

const generalEnglish = (year: number) =>
  new Calendar(year, Data.GENERAL_ROMAN_ENGLISH.load(), null, { vespers: true, vigils: true });

describe('vigil Masses', () => {
  describe('temporale vigils', () => {
    it("appends the Nativity vigil to Christmas Eve's celebrations", () => {
      const day = generalEnglish(2013).day(d(2013, 12, 24));
      const symbols = day.celebrations.map((c) => c.symbol);

      expect(symbols).toContain('nativity_vigil');
      const vigil = day.celebrations.find((c) => c.symbol === 'nativity_vigil')!;
      expect(vigil.title).toBe('The Nativity of the Lord [CHRISTMAS]: At the Vigil Mass');
      expect(vigil.rank).toBe(Ranks.PRIMARY);
      expect(vigil.cycle).toBe('temporale');
      // the vigil is appended AFTER the day's own celebrations
      expect(symbols[symbols.length - 1]).toBe('nativity_vigil');
    });

    it('appends the Easter vigil on Holy Saturday', () => {
      const day = generalEnglish(2013).day(d(2014, 4, 19));
      const vigil = day.celebrations.find((c) => c.symbol === 'easter_sunday_vigil');
      expect(vigil?.title).toBe(
        'Easter Sunday of the Resurrection of the Lord: The Easter Vigil in the Holy Night',
      );
    });

    it('appends the Pentecost vigil the day before Pentecost', () => {
      const day = generalEnglish(2013).day(d(2014, 6, 7));
      expect(day.celebrations.map((c) => c.symbol)).toContain('pentecost_vigil');
    });

    it('appends the Epiphany vigil the day before Epiphany', () => {
      const day = generalEnglish(2013).day(d(2014, 1, 5));
      expect(day.celebrations.map((c) => c.symbol)).toContain('epiphany_vigil');
    });

    it('appends the Ascension vigil the day before the Ascension', () => {
      const day = generalEnglish(2013).day(d(2014, 5, 28));
      expect(day.celebrations.map((c) => c.symbol)).toContain('ascension_vigil');
    });

    it('does not append anything when tomorrow has no vigil', () => {
      const day = generalEnglish(2013).day(d(2014, 7, 2));
      expect(day.celebrations.map((c) => c.symbol)).toEqual([null]);
    });

    it('is not produced at all when vigils are not opted in', () => {
      const plain = new Calendar(2013, Data.GENERAL_ROMAN_ENGLISH.load());
      expect(plain.day(d(2013, 12, 24)).celebrations.map((c) => c.symbol)).not.toContain(
        'nativity_vigil',
      );
    });
  });

  describe('sanctorale vigils', () => {
    // The `vigil` token in the data files; the title key lives under
    // `sanctorale.solemnity.*`, keyed by the celebration's cycle.
    it('uses the sanctorale i18n scope', () => {
      const day = generalEnglish(2013).day(d(2014, 8, 14));
      const vigil = day.celebrations.find((c) => c.symbol === 'assumption_vigil');
      expect(vigil).toBeDefined();
      expect(vigil!.cycle).toBe('sanctorale');
      expect(vigil!.title).toBe(
        'The Assumption of the Blessed Virgin Mary: At the Vigil Mass',
      );
    });

    it('produces the Nativity of John the Baptist vigil', () => {
      const day = generalEnglish(2013).day(d(2014, 6, 23));
      const vigil = day.celebrations.find((c) => c.symbol === 'baptist_birth_vigil');
      expect(vigil?.title).toBe(
        'The Nativity of Saint John the Baptist: At the Vigil Mass',
      );
    });

    it('produces the Saints Peter and Paul vigil', () => {
      const day = generalEnglish(2013).day(d(2014, 6, 28));
      const vigil = day.celebrations.find((c) => c.symbol === 'peter_paul_vigil');
      expect(vigil?.title).toBe('Saints Peter and Paul, Apostles: At the Vigil Mass');
    });

    it('falls back to :en for a locale with no sanctorale titles', () => {
      const day = generalEnglish(2013).day(d(2014, 8, 14));
      const vigil = day.celebrations.find((c) => c.symbol === 'assumption_vigil')!;
      i18n.withLocale('la', () => {
        // la.yml has no sanctorale scope at all -> I18n::Backend::Fallbacks
        expect(vigil.title).toBe('The Assumption of the Blessed Virgin Mary: At the Vigil Mass');
      });
    });

    it('keeps the parent celebration rank and colour', () => {
      const day = generalEnglish(2013).day(d(2014, 8, 14));
      const vigil = day.celebrations.find((c) => c.symbol === 'assumption_vigil')!;
      expect(vigil.rank).toBe(Ranks.SOLEMNITY_GENERAL);
      expect(vigil.hasVigil).toBe(true); // #change cannot switch the flag off
    });
  });

  describe('evening Masses', () => {
    it('appends the Holy Thursday evening Mass to Holy Thursday itself', () => {
      const day = generalEnglish(2013).day(d(2014, 4, 17));
      const symbols = day.celebrations.map((c) => c.symbol);

      expect(symbols).toEqual(['holy_thursday', 'holy_thursday_evening']);
      const evening = day.celebrations[1];
      expect(evening.title).toBe('Thursday of the Lord’s Supper: At the Evening Mass');
      expect(evening.rank).toBe(Ranks.TRIDUUM);
      expect(evening.cycle).toBe('temporale');
    });

    it('is the only evening Mass in the calendar', () => {
      const cal = generalEnglish(2013);
      const found: string[] = [];
      cal.temporale.dateRange().each((date) => {
        for (const c of cal.day(date).celebrations) {
          if (c.symbol?.endsWith('_evening')) found.push(`${date.toISO()} ${c.symbol}`);
        }
      });
      expect(found).toEqual(['2014-04-17 holy_thursday_evening']);
    });
  });

  describe('range errors around the year boundary are swallowed', () => {
    it('produces a Day for the last day of the liturgical year', () => {
      const cal = generalEnglish(2013);
      const lastDay = cal.temporale.endDate();
      expect(lastDay.toISO()).toBe('2014-11-29');

      const day = cal.day(lastDay);
      // vespers falls back to the first Advent Sunday...
      expect(day.vespers?.title).toBe('1st Sunday of Advent');
      // ...and the vigil lookup, which also reaches into the next year, is silent
      expect(day.celebrations.map((c) => c.symbol)).not.toContain(undefined);
    });

    it('works for every day of the liturgical year with vespers and vigils on', () => {
      const cal = generalEnglish(2013);
      expect(() => {
        cal.temporale.dateRange().each((date) => cal.day(date));
      }).not.toThrow();
    });
  });
});

describe('move_if_sunday (+1sunday)', () => {
  // us-en.txt: `1/22+1sunday unborn_children`
  const usCalendarFor = (year: number) => usPerpetualCalendar().calendarForYear(year);

  it('keeps the celebration on its own date when it is not a Sunday', () => {
    expect(d(2026, 1, 22).isSunday()).toBe(false);
    const day = usDay(2026, 1, 22);
    expect(day.celebrations.map((c) => c.symbol)).toContain('unborn_children');
  });

  it('drops it from the Sunday and moves it to the Monday', () => {
    const sunday = d(2023, 1, 22);
    expect(sunday.isSunday()).toBe(true);

    const sundayDay = usDay(2023, 1, 22);
    expect(sundayDay.celebrations.map((c) => c.symbol)).not.toContain('unborn_children');

    const mondayDay = usDay(2023, 1, 23);
    expect(mondayDay.celebrations.map((c) => c.symbol)).toContain('unborn_children');
  });

  it('adds the moved celebration after the Monday own sanctorale entries', () => {
    const symbols = usDay(2023, 1, 23).celebrations.map((c) => c.symbol);
    expect(symbols[symbols.length - 1]).toBe('unborn_children');
  });

  it('never moves anything in the General Roman calendar (no +1sunday records)', () => {
    const cal = usCalendarFor(2022);
    expect(cal.sanctorale.get(1, 22)[0].moveIfSunday).toBe(true);

    const general = SanctoraleFactory.createLayered(Data['universal-en'].load());
    for (const [, celebrations] of general.eachDay()) {
      for (const c of celebrations) {
        expect(c.moveIfSunday).toBe(false);
      }
    }
  });
});

describe('Thanksgiving (US extension)', () => {
  it('shows up as an optional memorial alongside the ferial', () => {
    const day = usDay(2026, 11, 26);
    const symbols = day.celebrations.map((c) => c.symbol);

    expect(symbols).toContain('thanksgiving');
    expect(symbols[0]).toBeNull(); // the ferial comes first
    const thanksgiving = day.celebrations.find((c) => c.symbol === 'thanksgiving')!;
    expect(thanksgiving.rank).toBe(Ranks.MEMORIAL_OPTIONAL);
    expect(thanksgiving.title).toBe('Thanksgiving Day');
  });

  it('is absent from the General Roman calendar', () => {
    const day = generalEnglish(2025).day(d(2026, 11, 26));
    expect(day.celebrations.map((c) => c.symbol)).not.toContain('thanksgiving');
  });
});
