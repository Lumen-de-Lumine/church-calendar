/**
 * `CalendarFacade#searchTitle` — the defaults, the empty-string query, the
 * vespers carry-over and the day rebuild.
 */

import { calendars } from '../../src/api/calendar-repository.js';
import { serializeDays } from '../../src/api/entities.js';
import { CalDate } from '../../src/core/cal-date.js';
import { i18n } from '../../src/core/i18n.js';

const us = calendars.get('us');
const jan1 = new CalDate(2026, 1, 1);
const dec31 = new CalDate(2026, 12, 31);

function search(q: string | null, from = jan1, to = dec31) {
  return i18n.withLocale('en', () => serializeDays(us.searchTitle(q, from, to)));
}

describe('searchTitle', () => {
  it('null query returns every day of the range untouched', () => {
    const days = search(null, jan1, new CalDate(2026, 1, 3));
    expect(days.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('an EMPTY STRING query is not nil in Ruby, so it runs the filter and matches all', () => {
    expect(search('').length).toBe(365);
  });

  it('a query that matches nothing returns []', () => {
    expect(search('zzzzz')).toEqual([]);
  });

  it('filters the celebrations of a matching day, keeping only the matches', () => {
    const days = search('Hildegard');
    expect(days.length).toBe(1);
    expect(days[0].date).toBe('2026-09-17');
    expect(days[0].celebrations.map((c) => c.id)).toEqual(['hildegard']);
  });

  it('keeps the original vespers even when it does NOT match (BASELINE defect B)', () => {
    // 2026-11-28 is the Saturday before the 1st Sunday of Advent: its vespers
    // are of Advent, which cannot match a query for the BVM memorial.
    const days = search('Blessed Virgin Mary on Saturday', new CalDate(2026, 11, 28), new CalDate(2026, 11, 28));
    expect(days.length).toBe(1);
    expect(days[0].celebrations.map((c) => c.id)).toEqual(['saturday_memorial_bvm']);
    expect(days[0].vespers?.title).toBe('1st Sunday of Advent');
  });

  it('the rebuilt Day keeps date/season/season_week and recomputes the cycles', () => {
    const days = search('33rd');
    const sunday = days.find((d) => d.date === '2026-11-15');
    expect(sunday).toBeDefined();
    expect(sunday?.season).toBe('ordinary');
    expect(sunday?.season_week).toBe(33);
    expect(sunday?.cycle).toBe('A');
    expect(sunday?.cycle_ferial).toBe(2);
    expect(sunday?.weekday).toBe('sunday');
  });

  it('defaults startDate to today and endDate to start + 365 (defect A)', () => {
    const days = i18n.withLocale('en', () => serializeDays(us.searchTitle(null, null, null)));
    expect(days.length).toBe(366);
    expect(days[0].date).toBe(CalDate.today().toISO());
    expect(days[days.length - 1].date).toBe(CalDate.today().addDays(365).toISO());
  });

  it('defaults only endDate when startDate is given', () => {
    const days = i18n.withLocale('en', () => serializeDays(us.searchTitle(null, jan1, null)));
    expect(days.length).toBe(366);
    expect(days[0].date).toBe('2026-01-01');
    expect(days[365].date).toBe('2027-01-01');
  });

  it('spelled-out ordinals match, but only for the FIRST ordinal in a title', () => {
    expect(search('1st').length).toBe(25);
    expect(search('first').length).toBe(27);
    expect(search('33rd').map((d) => d.date)).toEqual(search('thirty-third').map((d) => d.date));
  });

  it('is case-insensitive', () => {
    expect(search('ADVENT').map((d) => d.date)).toEqual(search('advent').map((d) => d.date));
  });
});

describe('daysBetween', () => {
  it('always yields the start date, even when it is already past the stop', () => {
    // ruby: `begin ... end until` — `Util::DateEnumerator` yields before testing.
    const days = i18n.withLocale('en', () =>
      serializeDays(us.daysBetween(new CalDate(2026, 5, 5), new CalDate(2026, 5, 1))),
    );
    expect(days.map((d) => d.date)).toEqual(['2026-05-05']);
  });

  it('is inclusive at both ends', () => {
    const days = i18n.withLocale('en', () =>
      serializeDays(us.daysBetween(new CalDate(2026, 5, 1), new CalDate(2026, 5, 3))),
    );
    expect(days.map((d) => d.date)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
  });
});

describe('daysOfMonth / daysOfYear', () => {
  it('daysOfMonth covers exactly the month', () => {
    const days = i18n.withLocale('en', () => serializeDays(us.daysOfMonth(2026, 2)));
    expect(days.length).toBe(28);
    expect(days[0].date).toBe('2026-02-01');
    expect(days[27].date).toBe('2026-02-28');
  });

  it('daysOfYear covers exactly the civil year', () => {
    const days = i18n.withLocale('en', () => serializeDays(us.daysOfYear(2024)));
    expect(days.length).toBe(366);
    expect(days[0].date).toBe('2024-01-01');
    expect(days[365].date).toBe('2024-12-31');
  });
});
