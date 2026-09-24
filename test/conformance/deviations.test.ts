/**
 * The DELIBERATE deviations from 2.7.0, pinned so they cannot regress.
 *
 * Everything else in test/conformance/ asserts parity; this file asserts the
 * places where parity was rejected on purpose. Each has an entry in
 * docs/QUIRKS.md and a row in README.md's deviation table.
 */

import { calendars, CalendarRepository } from '../../src/api/calendar-repository.js';
import { serializeDay } from '../../src/api/entities.js';
import { CalDate } from '../../src/core/cal-date.js';
import { Data } from '../../src/core/data.js';
import { i18n } from '../../src/core/i18n.js';
import { request } from '../helpers/handler.js';
import type { BaselineDay } from '../helpers/fixtures.js';

function search(startDate: string, endDate: string, cal = 'us'): BaselineDay[] {
  const response = request(
    `/api/v0/en/calendars/${cal}/search?startDate=${startDate}&endDate=${endDate}`,
  );
  expect(response.status).toBe(200);
  return JSON.parse(response.body) as BaselineDay[];
}

function ids(days: readonly BaselineDay[], date: string): (string | null)[] {
  const day = days.find((d) => d.date === date);
  if (day === undefined) throw new Error(`no such day in the result: ${date}`);
  return day.celebrations.map((c) => c.id);
}

describe('deviation L4 — a multi-year request must NOT duplicate vigils', () => {
  /*
   * Ruby: `Calendar#celebrations_for` can return the Sanctorale's OWN array, and
   * `Calendar#day(vigils: true)` pushes the vigil into it, permanently mutating
   * the loaded data. A range spanning two liturgical years therefore returns
   * `["kolbe","assumption_vigil","assumption_vigil"]` for 2026-08-14 while the
   * single-year request returns it once. That is memory corruption, not
   * behaviour, so the port fixes it (docs/QUIRKS.md Q3).
   */
  const multiYear = search('2025-08-13', '2026-08-15');

  it('2026-08-14 carries the vigil exactly once', () => {
    expect(ids(multiYear, '2026-08-14')).toEqual(['kolbe', 'assumption_vigil']);
  });

  it('2025-12-24 carries the vigil exactly once', () => {
    expect(ids(multiYear, '2025-12-24')).toEqual([
      'advent_wednesday_december24',
      'nativity_vigil',
    ]);
  });

  it('the multi-year answer equals the single-year answer day for day', () => {
    const single2026 = search('2026-08-13', '2026-08-15');
    const single2025 = search('2025-12-23', '2025-12-25');
    expect(ids(multiYear, '2026-08-14')).toEqual(ids(single2026, '2026-08-14'));
    expect(ids(multiYear, '2025-12-24')).toEqual(ids(single2025, '2025-12-24'));
  });

  it('holds across four liturgical years and every vigil-bearing date', () => {
    const wide = search('2024-01-01', '2027-12-31');
    for (const day of wide) {
      const seen = new Set<string>();
      for (const cel of day.celebrations) {
        if (cel.id === null) continue;
        expect(seen.has(cel.id)).toBe(false);
        seen.add(cel.id);
      }
    }
  });
});

describe('the repository and facade never mutate src/data state', () => {
  it('the same date answers identically on the 1st, 2nd and 100th call', () => {
    const facade = calendars.get('us');
    const date = new CalDate(2026, 8, 14);
    const first = i18n.withLocale('en', () => serializeDay(facade.day(date)));
    const second = i18n.withLocale('en', () => serializeDay(facade.day(date)));
    expect(second).toEqual(first);
    for (let i = 0; i < 98; i += 1) {
      expect(i18n.withLocale('en', () => serializeDay(facade.day(date)))).toEqual(first);
    }
  });

  it('two facades built from the same cached sanctorale agree', () => {
    const a = calendars.get('us');
    const b = calendars.get('us');
    const date = new CalDate(2026, 8, 14);
    // Force `a` to compute the vigil day first; in Ruby this would poison the
    // shared Sanctorale for `b`.
    i18n.withLocale('en', () => a.day(date));
    expect(i18n.withLocale('en', () => serializeDay(b.day(date)))).toEqual(
      i18n.withLocale('en', () => serializeDay(a.day(date))),
    );
  });

  it('a cached Sanctorale keeps its own celebration arrays untouched', () => {
    const repository = new CalendarRepository({ cacheSanctorale: true });
    const before = Data['us-en'].load().at(new CalDate(2000, 8, 14)).length;
    const facade = repository.get('us');
    i18n.withLocale('en', () => facade.daysBetween(new CalDate(2025, 1, 1), new CalDate(2027, 12, 31)));
    const after = Data['us-en'].load().at(new CalDate(2000, 8, 14)).length;
    expect(after).toBe(before);
  });

  it('caching the sanctorale changes nothing observable', () => {
    const cached = new CalendarRepository({ cacheSanctorale: true });
    const uncached = new CalendarRepository({ cacheSanctorale: false });
    const range = ['2026-01-01', '2026-12-31'] as const;
    const a = i18n.withLocale('en', () =>
      cached
        .get('us')
        .daysBetween(CalDate.fromISO(range[0]), CalDate.fromISO(range[1]))
        .map(serializeDay),
    );
    const b = i18n.withLocale('en', () =>
      uncached
        .get('us')
        .daysBetween(CalDate.fromISO(range[0]), CalDate.fromISO(range[1]))
        .map(serializeDay),
    );
    expect(a).toEqual(b);
  });

  it('the broken calendars throw on every call, cache or not', () => {
    const repository = new CalendarRepository();
    for (let i = 0; i < 3; i += 1) {
      expect(() => repository.get('general-fr')).toThrow(/faustina_kowalska/);
      expect(() => repository.get('general-es')).toThrow(/faustina_kowalska/);
    }
  });
});

describe('deviations that are invisible in a response', () => {
  it('no x-powered-by header (Q17)', () => {
    for (const url of ['/', '/api/v0/en/calendars', '/swagger.yml', '/style.css']) {
      expect(request(url).headers['x-powered-by']).toBeUndefined();
    }
  });

  it('the last day of the liturgical year does not write to stdout (Q6)', () => {
    const written: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stdout.write.bind(process.stdout);
    console.log = (...args: unknown[]): void => { written.push(args.join(' ')); };
    process.stdout.write = ((chunk: string): boolean => { written.push(String(chunk)); return true; }) as typeof process.stdout.write;
    try {
      const response = request('/api/v0/en/calendars/us/2026/11/28');
      expect(response.status).toBe(200);
      const day = JSON.parse(response.body) as BaselineDay;
      expect(day.vespers?.title).toBe('1st Sunday of Advent');
    } finally {
      console.log = originalLog;
      process.stdout.write = originalWrite;
    }
    expect(written).toEqual([]);
  });
});
