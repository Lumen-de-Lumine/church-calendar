/**
 * Golden test over `test/fixtures/baseline/days/**` — every calendar/year the
 * capture recorded, replayed through the HTTP handler with the very same URL the
 * capture used (`search?startDate=<y>-01-01&endDate=<y>-12-31`, lang `en`).
 *
 * 581 loadable year files (us, us-ascension, general-en, general-la 1970-2100 plus
 * all 25 calendars for 2025-2027) and 6 recorded 502s.
 */

import { diffDays, formatDiffs, request } from '../helpers/handler.js';
import { isErrorFixture, listDaysFixtures, loadJson } from '../helpers/fixtures.js';
import type { BaselineDay, BaselineErrorFixture } from '../helpers/fixtures.js';

const fixtures = listDaysFixtures();

function url(cal: string, year: number): string {
  return `/api/v0/en/calendars/${cal}/search?startDate=${year}-01-01&endDate=${year}-12-31`;
}

describe('conformance: days/', () => {
  it('has fixtures to check', () => {
    expect(fixtures.length).toBeGreaterThan(500);
  });

  const byCalendar = new Map<string, typeof fixtures>();
  for (const fixture of fixtures) {
    const list = byCalendar.get(fixture.cal) ?? [];
    list.push(fixture);
    byCalendar.set(fixture.cal, list);
  }

  for (const [cal, list] of [...byCalendar].sort(([a], [b]) => a.localeCompare(b))) {
    describe(cal, () => {
      for (const fixture of list.sort((a, b) => a.year - b.year)) {
        it(`${cal} ${fixture.year}`, () => {
          const expected = loadJson<BaselineDay[] | BaselineErrorFixture>(fixture.path);
          const response = request(url(cal, fixture.year));

          if (isErrorFixture(expected)) {
            // The two calendars whose gem data duplicates `faustina_kowalska`
            // cannot be loaded at all (QUIRKS Q10). Status parity only: the
            // Ruby body is Passenger's HTML error page.
            expect(response.status).toBe(expected.status);
            expect(response.body.length).toBeGreaterThan(0);
            return;
          }

          expect(response.status).toBe(200);
          const actual = JSON.parse(response.body) as BaselineDay[];
          const diffs = diffDays(expected, actual);
          if (diffs.length > 0) {
            throw new Error(formatDiffs(`${cal} ${fixture.year}`, diffs));
          }
        });
      }
    });
  }
});
