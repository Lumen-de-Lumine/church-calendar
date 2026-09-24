/**
 * Golden tests over the `lang/`, `month/`, `day/` and `year/` fixture groups.
 *
 *   lang/   cs, en, fr, it, la x (us, general-la) x 2026 — the localized titles,
 *           including the English fallbacks (`weekday` is never localized, Q19)
 *   month/  us 2026, all twelve months          (`GET /:year/:month`)
 *   day/    59 hand-picked dates x us, us-ascension (`GET /:year/:month/:day`)
 *   year/   us 1970-2100                        (`GET /:year`)
 */

import { diffDay, diffDays, formatDiffs, request } from '../helpers/handler.js';
import {
  listDayFixtures,
  listLangFixtures,
  listMonthFixtures,
  listYearFixtures,
  loadDay,
  loadJson,
  loadMonth,
  loadYear,
} from '../helpers/fixtures.js';
import type { BaselineDay, BaselineLectionaryYear } from '../helpers/fixtures.js';

describe('conformance: lang/', () => {
  const fixtures = listLangFixtures();

  it('has fixtures to check', () => {
    expect(fixtures.length).toBe(10);
  });

  for (const fixture of fixtures) {
    it(`${fixture.lang} ${fixture.cal} ${fixture.year}`, () => {
      const expected = loadJson<BaselineDay[]>(fixture.path);
      const response = request(
        `/api/v0/${fixture.lang}/calendars/${fixture.cal}/search` +
          `?startDate=${fixture.year}-01-01&endDate=${fixture.year}-12-31`,
      );
      expect(response.status).toBe(200);
      const diffs = diffDays(expected, JSON.parse(response.body) as BaselineDay[]);
      if (diffs.length > 0) {
        throw new Error(formatDiffs(`${fixture.lang}/${fixture.cal}-${fixture.year}`, diffs));
      }
    });
  }
});

describe('conformance: month/', () => {
  const fixtures = listMonthFixtures();

  it('has fixtures to check', () => {
    expect(fixtures.length).toBe(12);
  });

  for (const fixture of fixtures) {
    it(`${fixture.cal} ${fixture.year}-${String(fixture.month).padStart(2, '0')}`, () => {
      const expected = loadMonth(fixture.cal, fixture.year, fixture.month);
      const response = request(
        `/api/v0/en/calendars/${fixture.cal}/${fixture.year}/${fixture.month}`,
      );
      expect(response.status).toBe(200);
      const diffs = diffDays(expected, JSON.parse(response.body) as BaselineDay[]);
      if (diffs.length > 0) {
        throw new Error(formatDiffs(fixture.path, diffs));
      }
    });
  }
});

describe('conformance: day/', () => {
  const fixtures = listDayFixtures();

  it('has fixtures to check', () => {
    expect(fixtures.length).toBeGreaterThan(100);
  });

  for (const fixture of fixtures) {
    it(`${fixture.cal} ${fixture.date}`, () => {
      const expected = loadDay(fixture.cal, fixture.date);
      const [y, m, d] = fixture.date.split('-').map(Number);
      const response = request(`/api/v0/en/calendars/${fixture.cal}/${y}/${m}/${d}`);
      expect(response.status).toBe(200);
      const diffs = diffDay(expected, JSON.parse(response.body) as BaselineDay);
      if (diffs.length > 0) {
        throw new Error(formatDiffs(fixture.path, diffs));
      }
    });
  }
});

describe('conformance: year/', () => {
  const fixtures = listYearFixtures();

  it('has fixtures to check', () => {
    expect(fixtures.length).toBeGreaterThan(100);
  });

  for (const fixture of fixtures) {
    it(`${fixture.cal} ${fixture.year}`, () => {
      const expected = loadYear(fixture.cal, fixture.year);
      const response = request(`/api/v0/en/calendars/${fixture.cal}/${fixture.year}`);
      expect(response.status).toBe(200);
      expect(JSON.parse(response.body) as BaselineLectionaryYear).toEqual(expected);
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    });
  }
});
