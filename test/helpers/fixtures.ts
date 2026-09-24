/**
 * Typed loader for the baseline fixtures captured from the Ruby service
 * (`scripts/capture-baseline.mjs`, church-calendar-api 2.7.0).
 *
 * The shapes below are what the Ruby service ACTUALLY returns, not what it ought to return;
 * see `test/fixtures/baseline/README.md` for the known defects that are baked into them.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// paths
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path of `test/fixtures/baseline`. */
export const BASELINE_ROOT = resolve(HERE, '..', 'fixtures', 'baseline');

// ---------------------------------------------------------------------------
// types — exactly as observed on the wire
// ---------------------------------------------------------------------------

export type BaselineColour = 'green' | 'violet' | 'white' | 'red';

export type BaselineSeason = 'advent' | 'christmas' | 'lent' | 'easter' | 'ordinary';

export type BaselineWeekday =
  | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

/** Sunday lectionary cycle. */
export type BaselineSundayCycle = 'A' | 'B' | 'C';

/** Ferial (weekday) lectionary cycle. */
export type BaselineFerialCycle = 1 | 2;

/** `Day#cycle` is the Sunday cycle on Sundays and the ferial cycle otherwise. */
export type BaselineCycle = BaselineSundayCycle | BaselineFerialCycle;

/** `apps/api/v0/entities/celebration.rb` — key order is significant for byte parity. */
export interface BaselineCelebration {
  /** Localized celebration title. */
  title: string;
  colour: BaselineColour;
  /** Localized `Rank#short_desc || Rank#desc` — so privileged days carry the LONG description. */
  rank: string;
  /** `Rank#priority`, e.g. 1.1, 1.2, 1.3, 2.6, 2.9, 3.12, 3.13. */
  rank_num: number;
  /** `Celebration#symbol`; `null` for temporale days that have no symbol. */
  id: string | null;
}

/** `apps/api/v0/entities/day.rb` — key order is significant for byte parity. */
export interface BaselineDay {
  /** `YYYY-MM-DD`. */
  date: string;
  season: BaselineSeason;
  season_week: number;
  cycle: BaselineCycle;
  cycle_sunday: BaselineSundayCycle;
  cycle_ferial: BaselineFerialCycle;
  celebrations: BaselineCelebration[];
  /** Fork-only (2.7.0): the celebration whose first vespers are said this evening, else `null`. */
  vespers: BaselineCelebration | null;
  /** Always English, even for non-English `lang` (`WDAYS[date.wday]` in the entity). */
  weekday: BaselineWeekday;
}

/** `GET /api/v0/:lang/calendars/:cal/:year`. */
export interface BaselineLectionaryYear {
  lectionary: BaselineSundayCycle;
  ferial_lectionary: BaselineFerialCycle;
}

/** `GET /api/v0/:lang/calendars/:cal`. */
export interface BaselineCalendarDescription {
  system: { promulgated: number; effective_since: number; desc: string };
  sanctorale: { title: string; language: string };
}

/** Recorded in place of a body when the service did not return 200 (e.g. the known 502 calendars). */
export interface BaselineErrorFixture {
  status: number;
  body: string;
}

export interface BaselineManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface BaselineManifest {
  base_url: string;
  service: string;
  service_version: string;
  capture_started_at: string;
  capture_finished_at: string;
  total_requests: number;
  file_count: number;
  total_bytes: number;
  files: BaselineManifestEntry[];
}

/** Key order asserted by the conformance suite. */
export const DAY_KEYS = [
  'date', 'season', 'season_week', 'cycle', 'cycle_sunday', 'cycle_ferial',
  'celebrations', 'vespers', 'weekday',
] as const;

/** Key order asserted by the conformance suite. */
export const CELEBRATION_KEYS = ['title', 'colour', 'rank', 'rank_num', 'id'] as const;

export const WEEKDAYS: readonly BaselineWeekday[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

export const SEASONS: readonly BaselineSeason[] = [
  'advent', 'christmas', 'lent', 'easter', 'ordinary',
];

export const COLOURS: readonly BaselineColour[] = ['green', 'violet', 'white', 'red'];

/** Calendars that 502 on every day request in 2.7.0 (duplicate `faustina_kowalska` symbol). */
export const BROKEN_CALENDARS: readonly string[] = ['general-fr', 'general-es'];

// ---------------------------------------------------------------------------
// low-level loading
// ---------------------------------------------------------------------------

export function fixturePath(relPath: string): string {
  return join(BASELINE_ROOT, relPath);
}

/** True when the fixture exists, trying `<rel>` and then `<rel>.gz`. */
export function fixtureExists(relPath: string): boolean {
  return existsSync(fixturePath(relPath)) || existsSync(fixturePath(`${relPath}.gz`));
}

/** Read a fixture's raw bytes, transparently gunzipping `*.gz`. */
export function readFixture(relPath: string): Buffer {
  let abs = fixturePath(relPath);
  if (!existsSync(abs) && existsSync(`${abs}.gz`)) abs = `${abs}.gz`;
  if (!existsSync(abs)) {
    throw new Error(
      `baseline fixture not found: ${relPath}\n` +
      `  expected under ${BASELINE_ROOT}\n` +
      '  run: npm run capture-baseline',
    );
  }
  const buf = readFileSync(abs);
  return abs.endsWith('.gz') ? gunzipSync(buf) : buf;
}

/**
 * Parse a fixture as JSON. `relPath` may be given with or without the `.gz` suffix;
 * `loadJson('days/us/2026.json')` finds `days/us/2026.json.gz`.
 */
export function loadJson<T = unknown>(relPath: string): T {
  const text = readFixture(relPath).toString('utf8');
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`baseline fixture ${relPath} is not valid JSON: ${(err as Error).message}`);
  }
}

/** A fixture is an "error fixture" when the capture recorded a non-200 response instead of a body. */
export function isErrorFixture(value: unknown): value is BaselineErrorFixture {
  return (
    typeof value === 'object' && value !== null &&
    typeof (value as BaselineErrorFixture).status === 'number' &&
    typeof (value as BaselineErrorFixture).body === 'string' &&
    !Array.isArray(value)
  );
}

function expectDays(value: unknown, relPath: string): BaselineDay[] {
  if (isErrorFixture(value)) {
    throw new Error(
      `baseline fixture ${relPath} recorded HTTP ${value.status}, not a day array ` +
      '(use tryLoadDays if the calendar is expected to fail)',
    );
  }
  if (!Array.isArray(value)) throw new Error(`baseline fixture ${relPath} is not an array`);
  return value as BaselineDay[];
}

// ---------------------------------------------------------------------------
// typed accessors
// ---------------------------------------------------------------------------

/** Every day of `year` for `cal` in English (`search?startDate=…&endDate=…`). */
export function loadDays(cal: string, year: number): BaselineDay[] {
  const rel = `days/${cal}/${year}.json`;
  return expectDays(loadJson(rel), rel);
}

/** Like `loadDays`, but returns the recorded `{status, body}` for calendars that error. */
export function tryLoadDays(cal: string, year: number): BaselineDay[] | BaselineErrorFixture {
  const value = loadJson(`days/${cal}/${year}.json`);
  return isErrorFixture(value) ? value : expectDays(value, `days/${cal}/${year}.json`);
}

/** Every day of `year` for `cal` in `lang` (temporale titles localized, sanctorale from the data). */
export function loadLangDays(lang: string, cal: string, year: number): BaselineDay[] {
  const rel = `lang/${lang}/${cal}-${year}.json`;
  return expectDays(loadJson(rel), rel);
}

/** A single day from `GET /:year/:month/:day`. `date` is `YYYY-MM-DD`. */
export function loadDay(cal: string, date: string): BaselineDay {
  return loadJson<BaselineDay>(`day/${cal}/${date}.json`);
}

/** A month from `GET /:year/:month`. */
export function loadMonth(cal: string, year: number, month: number): BaselineDay[] {
  const rel = `month/${cal}/${year}-${String(month).padStart(2, '0')}.json`;
  return expectDays(loadJson(rel), rel);
}

/** The lectionary cycles from `GET /:year`. */
export function loadYear(cal: string, year: number): BaselineLectionaryYear {
  return loadJson<BaselineLectionaryYear>(`year/${cal}/${year}.json`);
}

export function loadManifest(): BaselineManifest {
  return loadJson<BaselineManifest>('manifest.json');
}

// ---------------------------------------------------------------------------
// enumeration
// ---------------------------------------------------------------------------

function listDirs(relPath: string): string[] {
  const abs = fixturePath(relPath);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function listFiles(relPath: string): string[] {
  const abs = fixturePath(relPath);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
}

export interface DayFixtureRef {
  /** Calendar id, e.g. `us`. */
  cal: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Path relative to `BASELINE_ROOT`. */
  path: string;
}

/** Every `day/<cal>/<date>.json` fixture. */
export function listDayFixtures(): DayFixtureRef[] {
  const out: DayFixtureRef[] = [];
  for (const cal of listDirs('day')) {
    for (const name of listFiles(`day/${cal}`)) {
      if (!name.endsWith('.json')) continue;
      out.push({ cal, date: name.slice(0, -'.json'.length), path: `day/${cal}/${name}` });
    }
  }
  return out;
}

export interface DaysFixtureRef {
  cal: string;
  year: number;
  /** Path relative to `BASELINE_ROOT` (`.json.gz`, or `.json` when the capture recorded an error). */
  path: string;
  /** True when the capture recorded `{status, body}` instead of a day array. */
  isError: boolean;
}

/** Every `days/<cal>/<year>.json(.gz)` fixture. */
export function listDaysFixtures(): DaysFixtureRef[] {
  const out: DaysFixtureRef[] = [];
  for (const cal of listDirs('days')) {
    for (const name of listFiles(`days/${cal}`)) {
      if (name.endsWith('.json.gz')) {
        out.push({ cal, year: Number(name.slice(0, -'.json.gz'.length)), path: `days/${cal}/${name}`, isError: false });
      } else if (name.endsWith('.json')) {
        out.push({ cal, year: Number(name.slice(0, -'.json'.length)), path: `days/${cal}/${name}`, isError: true });
      }
    }
  }
  return out;
}

export interface LangFixtureRef {
  lang: string;
  cal: string;
  year: number;
  path: string;
}

/** Every `lang/<lang>/<cal>-<year>.json.gz` fixture. */
export function listLangFixtures(): LangFixtureRef[] {
  const out: LangFixtureRef[] = [];
  for (const lang of listDirs('lang')) {
    for (const name of listFiles(`lang/${lang}`)) {
      const m = /^(.+)-(\d{4})\.json(?:\.gz)?$/.exec(name);
      if (!m) continue;
      out.push({ lang, cal: m[1], year: Number(m[2]), path: `lang/${lang}/${name}` });
    }
  }
  return out;
}

export interface MonthFixtureRef {
  cal: string;
  year: number;
  month: number;
  path: string;
}

/** Every `month/<cal>/<year>-<month>.json` fixture. */
export function listMonthFixtures(): MonthFixtureRef[] {
  const out: MonthFixtureRef[] = [];
  for (const cal of listDirs('month')) {
    for (const name of listFiles(`month/${cal}`)) {
      const m = /^(\d{4})-(\d{2})\.json$/.exec(name);
      if (!m) continue;
      out.push({ cal, year: Number(m[1]), month: Number(m[2]), path: `month/${cal}/${name}` });
    }
  }
  return out;
}

export interface YearFixtureRef {
  cal: string;
  year: number;
  path: string;
}

/** Every `year/<cal>/<year>.json` (lectionary) fixture. */
export function listYearFixtures(): YearFixtureRef[] {
  const out: YearFixtureRef[] = [];
  for (const cal of listDirs('year')) {
    for (const name of listFiles(`year/${cal}`)) {
      const m = /^(\d{4,})\.json$/.exec(name);
      if (!m) continue;
      out.push({ cal, year: Number(m[1]), path: `year/${cal}/${name}` });
    }
  }
  return out;
}

/** Every fixture file, as paths relative to `BASELINE_ROOT`, sorted. Excludes manifest.json/README.md. */
export function listFixtureFiles(): string[] {
  const out: string[] = [];
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = join(abs, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) out.push(relative(BASELINE_ROOT, child).split(sep).join('/'));
    }
  };
  if (existsSync(BASELINE_ROOT)) walk(BASELINE_ROOT);
  return out.filter((p) => p !== 'manifest.json' && p !== 'README.md').sort();
}

/** Byte length of a fixture file on disk (compressed size for `.gz`). */
export function fixtureBytes(relPath: string): number {
  return statSync(fixturePath(relPath)).size;
}

// ---------------------------------------------------------------------------
// small date helpers (test-side only; src/ uses CalDate instead of Date)
// ---------------------------------------------------------------------------

/** Weekday name for an ISO `YYYY-MM-DD` date, matching the Ruby entity's `WDAYS[date.wday]`. */
export function weekdayOf(iso: string): BaselineWeekday {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Days in `year`, proleptic Gregorian. */
export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** The ISO date `n` days after `iso`. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return [
    String(next.getUTCFullYear()).padStart(4, '0'),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
