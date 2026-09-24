// Pins the "Core API" contract from docs/ARCHITECTURE.md. src/api and src/http
// are written against these names; members may be added, never renamed.

import * as core from '../../src/core/index.js';

describe('src/core public API', () => {
  it('exports every name the contract lists', () => {
    const expected = [
      // dates
      'CalDate',
      'AbstractDate',
      // enums
      'Colour',
      'Colours',
      'Season',
      'Seasons',
      'Rank',
      'Ranks',
      'LECTIONARY_CYCLES',
      // celebrations and days
      'Celebration',
      'Day',
      // temporale
      'Dates',
      'Extensions',
      'Temporale',
      'CelebrationFactory',
      // sanctorale
      'Sanctorale',
      'SanctoraleLoader',
      'SanctoraleFactory',
      'Data',
      // calendar
      'Transfers',
      'Calendar',
      'PerpetualCalendar',
      // i18n
      'i18n',
      'Ordinalizer',
      'InvalidDataError',
      // util
      'Util',
    ];

    for (const name of expected) {
      expect(core).toHaveProperty(name);
    }
  });

  it('CalDate has the contract members', () => {
    const d = new core.CalDate(2026, 9, 18);
    for (const member of [
      'year',
      'month',
      'day',
      'wday',
      'cwday',
      'dayNumber',
      'addDays',
      'succ',
      'diffDays',
      'compare',
      'equals',
      'isBefore',
      'isAfter',
      'isOnOrBefore',
      'isOnOrAfter',
      'isSunday',
      'isSaturday',
      'isMonday',
      'isLeapYear',
      'toISO',
      'toString',
    ]) {
      expect(d[member as keyof core.CalDate]).toBeDefined();
    }
    expect(typeof core.CalDate.fromISO).toBe('function');
    expect(typeof core.CalDate.fromDayNumber).toBe('function');
    expect(typeof core.CalDate.today).toBe('function');
    expect(typeof core.CalDate.daysInMonth).toBe('function');
  });

  it('Ranks exposes every rank at the documented priority', () => {
    expect([
      core.Ranks.TRIDUUM.priority,
      core.Ranks.PRIMARY.priority,
      core.Ranks.SOLEMNITY_GENERAL.priority,
      core.Ranks.SOLEMNITY_PROPER.priority,
      core.Ranks.FEAST_LORD_GENERAL.priority,
      core.Ranks.SUNDAY_UNPRIVILEGED.priority,
      core.Ranks.FEAST_GENERAL.priority,
      core.Ranks.FEAST_PROPER.priority,
      core.Ranks.FERIAL_PRIVILEGED.priority,
      core.Ranks.MEMORIAL_GENERAL.priority,
      core.Ranks.MEMORIAL_PROPER.priority,
      core.Ranks.MEMORIAL_OPTIONAL.priority,
      core.Ranks.FERIAL.priority,
      core.Ranks.COMMEMORATION.priority,
    ]).toEqual([1.1, 1.2, 1.3, 1.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.11, 3.12, 3.13, 4.0]);

    expect(core.Ranks.all).toHaveLength(14);
    expect(typeof core.Ranks.byPriority).toBe('function');
  });

  it('Colours and Seasons expose all, bySymbol and the constants', () => {
    expect(core.Colours.all.map((c) => c.symbol)).toEqual(['green', 'violet', 'white', 'red']);
    expect(core.Seasons.all.map((s) => s.symbol)).toEqual([
      'advent',
      'christmas',
      'lent',
      'easter',
      'ordinary',
    ]);
    expect(core.Colours.bySymbol('red')).toBe(core.Colours.RED);
    expect(core.Seasons.bySymbol('lent')).toBe(core.Seasons.LENT);
  });

  it('Extensions is keyed by the Ruby constant names config/calendars.yml uses', () => {
    expect(Object.keys(core.Extensions).sort()).toEqual(['ChristEternalPriest', 'ThanksgivingUS']);
  });

  it('Data is indexable by siglum', () => {
    expect(core.Data['universal-en'].siglum).toBe('universal-en');
    expect(typeof core.Data['universal-en'].load).toBe('function');
    expect(typeof core.Data['universal-en'].text).toBe('string');
  });

  it('i18n exposes locale, setLocale, withLocale, t and availableLocales', () => {
    expect(core.i18n.availableLocales).toEqual(['cs', 'en', 'es', 'fr', 'it', 'la']);
    expect(typeof core.i18n.t).toBe('function');
    expect(typeof core.i18n.setLocale).toBe('function');
    expect(typeof core.i18n.withLocale).toBe('function');
    expect(typeof core.i18n.locale).toBe('string');
  });

  it('Util exposes the three enumerator classes church-calendar-api uses', () => {
    expect(typeof core.Util.DateEnumerator).toBe('function');
    expect(typeof core.Util.Year).toBe('function');
    expect(typeof core.Util.Month).toBe('function');
  });

  it('LECTIONARY_CYCLES is A, B, C', () => {
    expect(core.LECTIONARY_CYCLES).toEqual(['A', 'B', 'C']);
  });

  it('the api layer can build a Day the way CalendarFacade does', () => {
    const sanctorale = core.SanctoraleFactory.createLayered(
      core.Data['universal-en'].load(),
      core.Data['us-en'].load(),
    );
    const pc = new core.PerpetualCalendar({
      sanctorale,
      temporaleOptions: {
        extensions: [core.Extensions.ThanksgivingUS],
        transferToSunday: ['epiphany', 'ascension', 'corpus_christi'],
      },
    });

    const date = new core.CalDate(2026, 9, 18);
    const day = pc.day(date.year, date.month, date.day, { vespers: true, vigils: true });

    // every field the api's Day entity exposes
    expect(day.date.toISO()).toBe('2026-09-18');
    expect(day.season!.symbol).toBe('ordinary');
    expect(day.seasonWeek).toBe(24);
    expect(day.cycle).toBe(2);
    expect(day.cycleSunday).toBe('A');
    expect(day.cycleFerial).toBe(2);
    expect(day.weekday()).toBe(5);
    expect(day.vespers).toBeNull();

    // every field the api's Celebration entity exposes
    const c = day.celebrations[0];
    expect(typeof c.title).toBe('string');
    expect(c.colour.symbol).toBe('green');
    expect(c.rank.shortDesc() ?? c.rank.desc()).toBe('ferial');
    expect(c.rank.priority).toBe(3.13);
    expect(c.symbol).toBeNull();

    // and the /:year route
    const calendar = pc.calendarForYear(2026);
    expect(calendar.lectionary()).toBe('B');
    expect(calendar.ferialLectionary()).toBe(1);
  });
});
