/**
 * Validates the baseline fixture set itself — NOT the TypeScript port.
 *
 * If this test fails, the fixtures are wrong (bad capture, truncated file, tampered manifest) and
 * every other conformance test built on them is meaningless. It must stay green before, during and
 * after the port.
 *
 * Deliberately assertion-light per item: each test accumulates problems into an array and asserts
 * once, so a single bad day does not produce 200 000 jest assertions.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  BASELINE_ROOT,
  BROKEN_CALENDARS,
  CELEBRATION_KEYS,
  COLOURS,
  DAY_KEYS,
  SEASONS,
  WEEKDAYS,
  addDays,
  daysInMonth,
  daysInYear,
  fixturePath,
  isErrorFixture,
  listDayFixtures,
  listDaysFixtures,
  listFixtureFiles,
  listLangFixtures,
  listMonthFixtures,
  listYearFixtures,
  loadJson,
  loadManifest,
  readFixture,
  weekdayOf,
  type BaselineCelebration,
  type BaselineDay,
} from '../helpers/fixtures.js';

/** Cap on how many problems a single test reports, so failures stay readable. */
const MAX_REPORTED = 20;

function assertNoProblems(problems: string[]): void {
  if (problems.length === 0) return;
  const shown = problems.slice(0, MAX_REPORTED).join('\n  ');
  const more = problems.length > MAX_REPORTED ? `\n  ... and ${problems.length - MAX_REPORTED} more` : '';
  throw new Error(`${problems.length} problem(s):\n  ${shown}${more}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate one serialized celebration; push any problems onto `problems`. */
function checkCelebration(c: unknown, where: string, problems: string[]): void {
  if (typeof c !== 'object' || c === null || Array.isArray(c)) {
    problems.push(`${where}: celebration is not an object`);
    return;
  }
  const keys = Object.keys(c);
  if (keys.length !== CELEBRATION_KEYS.length || keys.some((k, i) => k !== CELEBRATION_KEYS[i])) {
    problems.push(`${where}: celebration keys ${JSON.stringify(keys)} != ${JSON.stringify(CELEBRATION_KEYS)}`);
    return;
  }
  const cel = c as BaselineCelebration;
  if (typeof cel.title !== 'string' || cel.title.length === 0) problems.push(`${where}: empty title`);
  if (!COLOURS.includes(cel.colour)) problems.push(`${where}: unknown colour ${JSON.stringify(cel.colour)}`);
  if (typeof cel.rank !== 'string' || cel.rank.length === 0) problems.push(`${where}: empty rank`);
  if (typeof cel.rank_num !== 'number' || !Number.isFinite(cel.rank_num)) {
    problems.push(`${where}: rank_num is not a number (${JSON.stringify(cel.rank_num)})`);
  }
  if (cel.id !== null && typeof cel.id !== 'string') {
    problems.push(`${where}: id is neither string nor null (${JSON.stringify(cel.id)})`);
  }
}

/** Validate one serialized day; push any problems onto `problems`. */
function checkDay(day: unknown, where: string, problems: string[]): void {
  if (typeof day !== 'object' || day === null || Array.isArray(day)) {
    problems.push(`${where}: day is not an object`);
    return;
  }
  const keys = Object.keys(day);
  if (keys.length !== DAY_KEYS.length || keys.some((k, i) => k !== DAY_KEYS[i])) {
    problems.push(`${where}: day keys ${JSON.stringify(keys)} != ${JSON.stringify(DAY_KEYS)}`);
    return;
  }
  const d = day as BaselineDay;

  if (!ISO_DATE.test(d.date)) problems.push(`${where}: date ${JSON.stringify(d.date)} is not YYYY-MM-DD`);
  if (!SEASONS.includes(d.season)) problems.push(`${where}: unknown season ${JSON.stringify(d.season)}`);
  if (!Number.isInteger(d.season_week) || d.season_week < 0) {
    problems.push(`${where}: season_week ${JSON.stringify(d.season_week)} is not a non-negative integer`);
  }
  if (!['A', 'B', 'C'].includes(d.cycle_sunday)) {
    problems.push(`${where}: cycle_sunday ${JSON.stringify(d.cycle_sunday)}`);
  }
  if (d.cycle_ferial !== 1 && d.cycle_ferial !== 2) {
    problems.push(`${where}: cycle_ferial ${JSON.stringify(d.cycle_ferial)}`);
  }
  if (!WEEKDAYS.includes(d.weekday)) problems.push(`${where}: unknown weekday ${JSON.stringify(d.weekday)}`);
  else if (ISO_DATE.test(d.date) && d.weekday !== weekdayOf(d.date)) {
    problems.push(`${where}: weekday ${d.weekday} != ${weekdayOf(d.date)} for ${d.date}`);
  }

  // Day#cycle is cycle_sunday on Sundays, cycle_ferial otherwise.
  const expectedCycle = d.weekday === 'sunday' ? d.cycle_sunday : d.cycle_ferial;
  if (d.cycle !== expectedCycle) {
    problems.push(`${where}: cycle ${JSON.stringify(d.cycle)} != ${JSON.stringify(expectedCycle)}`);
  }

  if (!Array.isArray(d.celebrations) || d.celebrations.length === 0) {
    problems.push(`${where}: celebrations is not a non-empty array`);
  } else {
    for (let i = 0; i < d.celebrations.length; i += 1) {
      checkCelebration(d.celebrations[i], `${where} celebrations[${i}]`, problems);
    }
  }

  if (d.vespers !== null) checkCelebration(d.vespers, `${where} vespers`, problems);
}

/** Validate a contiguous run of days covering [from, to] inclusive. */
function checkDateRun(days: BaselineDay[], from: string, to: string, file: string, problems: string[]): void {
  let expected = from;
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    const where = `${file}[${i}]`;
    checkDay(day, where, problems);
    if (day && typeof day === 'object' && (day as BaselineDay).date !== expected) {
      problems.push(`${where}: date ${JSON.stringify((day as BaselineDay).date)} != expected ${expected}`);
      // resync so one gap does not cascade
      expected = (day as BaselineDay).date;
    }
    expected = addDays(expected, 1);
    if (problems.length > 200) return; // bail out early on a systematically broken file
  }
  const lastExpected = addDays(to, 1);
  if (expected !== lastExpected) {
    problems.push(`${file}: run ends at ${expected}, expected ${lastExpected}`);
  }
}

// ---------------------------------------------------------------------------

describe('baseline fixtures', () => {
  it('has a manifest that describes a non-trivial capture', () => {
    const manifest = loadManifest();
    expect(manifest.service_version).toBe('2.7.0');
    expect(manifest.base_url).toMatch(/^https?:\/\//);
    expect(Date.parse(manifest.capture_started_at)).not.toBeNaN();
    expect(Date.parse(manifest.capture_finished_at)).not.toBeNaN();
    expect(manifest.total_requests).toBeGreaterThan(0);
    expect(manifest.files.length).toBeGreaterThan(500);
    expect(manifest.file_count).toBe(manifest.files.length);
  });

  it('manifest hashes match the files on disk, with nothing missing or extra', () => {
    const manifest = loadManifest();
    const problems: string[] = [];

    const onDisk = new Set(listFixtureFiles());
    const inManifest = new Set(manifest.files.map((f) => f.path));

    for (const p of onDisk) if (!inManifest.has(p)) problems.push(`${p}: on disk but not in manifest`);
    for (const p of inManifest) if (!onDisk.has(p)) problems.push(`${p}: in manifest but not on disk`);

    for (const entry of manifest.files) {
      if (!onDisk.has(entry.path)) continue;
      const buf = readFileSync(fixturePath(entry.path));
      if (buf.length !== entry.bytes) {
        problems.push(`${entry.path}: ${buf.length} bytes on disk, manifest says ${entry.bytes}`);
        continue;
      }
      const digest = createHash('sha256').update(buf).digest('hex');
      if (digest !== entry.sha256) {
        problems.push(`${entry.path}: sha256 ${digest} != manifest ${entry.sha256}`);
      }
    }

    assertNoProblems(problems);
  });

  it('every fixture file parses (gzipped ones gunzip cleanly)', () => {
    const problems: string[] = [];
    for (const rel of listFixtureFiles()) {
      if (rel.endsWith('.txt')) {
        try {
          readFixture(rel);
        } catch (err) {
          problems.push(`${rel}: ${(err as Error).message}`);
        }
        continue;
      }
      try {
        loadJson(rel);
      } catch (err) {
        problems.push(`${rel}: ${(err as Error).message}`);
      }
    }
    assertNoProblems(problems);
  });

  it('covers the calendars and years the capture promises', () => {
    const refs = listDaysFixtures();
    expect(refs.length).toBeGreaterThan(500);
    for (const cal of ['us', 'us-ascension', 'general-en', 'general-la']) {
      const years = refs.filter((r) => r.cal === cal).map((r) => r.year).sort((a, b) => a - b);
      expect(years[0]).toBe(1970);
      expect(years[years.length - 1]).toBe(2100);
      expect(new Set(years).size).toBe(years.length);
    }
    // all 25 calendars present for 2026
    const cals2026 = new Set(refs.filter((r) => r.year === 2026).map((r) => r.cal));
    expect(cals2026.size).toBe(25);
    // the two known-broken calendars are recorded as errors, not day arrays
    for (const cal of BROKEN_CALENDARS) {
      for (const ref of refs.filter((r) => r.cal === cal)) expect(ref.isError).toBe(true);
    }
  });

  it('days/**: every file is a full year in date order with well-formed days', () => {
    const problems: string[] = [];
    for (const ref of listDaysFixtures()) {
      const value = loadJson(ref.path);
      if (ref.isError) {
        if (!isErrorFixture(value)) problems.push(`${ref.path}: expected {status, body}`);
        else if (value.status < 400) problems.push(`${ref.path}: recorded status ${value.status} < 400`);
        continue;
      }
      if (!Array.isArray(value)) {
        problems.push(`${ref.path}: not an array`);
        continue;
      }
      const days = value as BaselineDay[];
      const expectedLength = daysInYear(ref.year);
      if (days.length !== expectedLength) {
        problems.push(`${ref.path}: ${days.length} entries, expected ${expectedLength}`);
      }
      checkDateRun(days, `${ref.year}-01-01`, `${ref.year}-12-31`, ref.path, problems);
    }
    assertNoProblems(problems);
  });

  it('lang/**: every file is a full year with well-formed days', () => {
    const refs = listLangFixtures();
    expect(refs.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const ref of refs) {
      const value = loadJson(ref.path);
      if (!Array.isArray(value)) {
        problems.push(`${ref.path}: not an array`);
        continue;
      }
      const days = value as BaselineDay[];
      if (days.length !== daysInYear(ref.year)) {
        problems.push(`${ref.path}: ${days.length} entries, expected ${daysInYear(ref.year)}`);
      }
      checkDateRun(days, `${ref.year}-01-01`, `${ref.year}-12-31`, ref.path, problems);
    }
    assertNoProblems(problems);
    // `weekday` is not localized — it is always the English name (Ruby entity quirk).
    const cs = refs.find((r) => r.lang === 'cs');
    if (cs) {
      const days = loadJson<BaselineDay[]>(cs.path);
      expect(WEEKDAYS).toContain(days[0].weekday);
    }
  });

  it('month/**: every file covers exactly its month', () => {
    const refs = listMonthFixtures();
    expect(refs.length).toBe(12);
    const problems: string[] = [];
    for (const ref of refs) {
      const days = loadJson<BaselineDay[]>(ref.path);
      const expectedLength = daysInMonth(ref.year, ref.month);
      if (days.length !== expectedLength) {
        problems.push(`${ref.path}: ${days.length} entries, expected ${expectedLength}`);
      }
      const mm = String(ref.month).padStart(2, '0');
      checkDateRun(days, `${ref.year}-${mm}-01`, `${ref.year}-${mm}-${expectedLength}`, ref.path, problems);
    }
    assertNoProblems(problems);
  });

  it('day/**: every file is the single day its filename names', () => {
    const refs = listDayFixtures();
    expect(refs.length).toBeGreaterThan(50);
    const problems: string[] = [];
    for (const ref of refs) {
      const day = loadJson<BaselineDay>(ref.path);
      checkDay(day, ref.path, problems);
      if (day && (day as BaselineDay).date !== ref.date) {
        problems.push(`${ref.path}: date ${JSON.stringify((day as BaselineDay).date)} != filename ${ref.date}`);
      }
    }
    assertNoProblems(problems);
  });

  it('day/** agrees with the matching entry in days/**', () => {
    const problems: string[] = [];
    for (const ref of listDayFixtures()) {
      const year = Number(ref.date.slice(0, 4));
      let fromYear: BaselineDay[];
      try {
        fromYear = loadJson<BaselineDay[]>(`days/${ref.cal}/${year}.json`);
      } catch {
        continue; // year not captured for this calendar
      }
      const inYear = fromYear.find((d) => d.date === ref.date);
      if (!inYear) {
        problems.push(`days/${ref.cal}/${year}.json has no entry for ${ref.date}`);
        continue;
      }
      const single = loadJson<BaselineDay>(ref.path);
      if (JSON.stringify(single) !== JSON.stringify(inYear)) {
        problems.push(
          `${ref.path} differs from days/${ref.cal}/${year}.json:\n` +
          `      single: ${JSON.stringify(single)}\n` +
          `      inYear: ${JSON.stringify(inYear)}`,
        );
      }
    }
    assertNoProblems(problems);
  });

  it('month/** agrees with the matching slice of days/**', () => {
    const problems: string[] = [];
    for (const ref of listMonthFixtures()) {
      let fromYear: BaselineDay[];
      try {
        fromYear = loadJson<BaselineDay[]>(`days/${ref.cal}/${ref.year}.json`);
      } catch {
        continue;
      }
      const mm = String(ref.month).padStart(2, '0');
      const slice = fromYear.filter((d) => d.date.slice(0, 7) === `${ref.year}-${mm}`);
      const month = loadJson<BaselineDay[]>(ref.path);
      if (JSON.stringify(month) !== JSON.stringify(slice)) {
        problems.push(`${ref.path} differs from the ${ref.year}-${mm} slice of days/${ref.cal}/${ref.year}.json`);
      }
    }
    assertNoProblems(problems);
  });

  it('year/**: lectionary cycles are well-formed and advance by one each year', () => {
    const refs = listYearFixtures();
    expect(refs.length).toBeGreaterThan(100);
    const problems: string[] = [];
    const byCal = new Map<string, { year: number; lectionary: string; ferial: number }[]>();
    for (const ref of refs) {
      const value = loadJson<{ lectionary: unknown; ferial_lectionary: unknown }>(ref.path);
      const keys = Object.keys(value);
      if (keys.length !== 2 || keys[0] !== 'lectionary' || keys[1] !== 'ferial_lectionary') {
        problems.push(`${ref.path}: keys ${JSON.stringify(keys)}`);
        continue;
      }
      if (!['A', 'B', 'C'].includes(value.lectionary as string)) {
        problems.push(`${ref.path}: lectionary ${JSON.stringify(value.lectionary)}`);
      }
      if (value.ferial_lectionary !== 1 && value.ferial_lectionary !== 2) {
        problems.push(`${ref.path}: ferial_lectionary ${JSON.stringify(value.ferial_lectionary)}`);
      }
      const list = byCal.get(ref.cal) ?? [];
      list.push({ year: ref.year, lectionary: value.lectionary as string, ferial: value.ferial_lectionary as number });
      byCal.set(ref.cal, list);
    }
    for (const [cal, list] of byCal) {
      list.sort((a, b) => a.year - b.year);
      for (let i = 1; i < list.length; i += 1) {
        if (list[i].year !== list[i - 1].year + 1) continue;
        const cycles = 'ABC';
        const expected = cycles[(cycles.indexOf(list[i - 1].lectionary) + 1) % 3];
        if (list[i].lectionary !== expected) {
          problems.push(`year/${cal}: ${list[i].year} lectionary ${list[i].lectionary}, expected ${expected}`);
        }
        if (list[i].ferial === list[i - 1].ferial) {
          problems.push(`year/${cal}: ${list[i].year} ferial_lectionary did not alternate (${list[i].ferial})`);
        }
      }
    }
    assertNoProblems(problems);
  });

  it('misc/**: the aggregate fixtures are present and shaped as the loader expects', () => {
    const calendars = loadJson<{ status: number; body: string[] }>('misc/calendars.json');
    expect(calendars.status).toBe(200);
    expect(calendars.body).toHaveLength(25);
    expect(calendars.body[0]).toBe('general-en');
    expect(calendars.body[calendars.body.length - 1]).toBe('default');

    const errors = loadJson<{ entries: { name: string; status: number }[] }>('misc/errors.json');
    expect(errors.entries.length).toBeGreaterThan(30);
    expect(errors.entries.find((e) => e.name === 'lang-es')?.status).toBe(400);
    expect(errors.entries.find((e) => e.name === 'day-2016-02-29-leap')?.status).toBe(200);

    const redirects = loadJson<{ entries: { status: number; location?: string }[] }>('misc/redirects.json');
    expect(redirects.entries).toHaveLength(4);
    for (const e of redirects.entries) {
      expect(e.status).toBe(301);
      expect(e.location).toContain('/calendars/default/');
    }

    const search = loadJson<{ entries: { q: string; count: number | null }[] }>('misc/search-queries.json');
    expect(search.entries).toHaveLength(15);
    expect(search.entries.find((e) => e.q === '')?.count).toBe(365);

    const headers = loadJson<{ entries: { name: string; headers: Record<string, string> }[] }>('misc/headers.json');
    const withOrigin = headers.entries.find((e) => e.name === 'api-day-with-origin');
    expect(withOrigin?.headers['cache-control']).toBe('max-age=3600');
    expect(withOrigin?.headers['access-control-allow-origin']).toBe('*');

    for (const rel of ['misc/today.json', 'misc/web.json', 'misc/calendar-descriptions.json',
      'misc/swagger.yml.txt', 'misc/browse-us-2026-9.html.txt']) {
      expect(readFixture(rel).length).toBeGreaterThan(0);
    }
  });

  it('stays within the size budget for git (< 10 MiB)', () => {
    const manifest = loadManifest();
    const mib = manifest.total_bytes / 1024 / 1024;
    expect(BASELINE_ROOT).toContain('baseline');
    expect(mib).toBeLessThan(10);
  });
});
