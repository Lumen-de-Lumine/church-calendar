#!/usr/bin/env node
/**
 * capture-baseline.mjs — capture golden fixtures from a running church-calendar-api (Ruby, v2.7.0).
 *
 * Zero dependencies, Node >= 22 (developed on 24). Writes into test/fixtures/baseline/.
 *
 *   node scripts/capture-baseline.mjs                 # capture missing fixtures from http://localhost:9292
 *   BASE_URL=https://calendar.example.com node ...    # capture from another Ruby 2.7.0 deployment
 *   node scripts/capture-baseline.mjs --force         # re-capture everything
 *   node scripts/capture-baseline.mjs --only=days,misc # capture only some groups
 *   node scripts/capture-baseline.mjs --dry-run       # list what would be captured
 *
 * Behaviour:
 *   - concurrency <= 4 (CONCURRENCY env), polite to the server
 *   - 3 attempts with exponential backoff on network errors and 5xx, EXCEPT for the calendars in
 *     BROKEN_CALENDARS, which are known to 502 on every day request in 2.7.0 (duplicate
 *     `faustina_kowalska` symbol in their sanctorale data) — those get a single attempt and the
 *     {status, body} is recorded as the fixture.
 *   - idempotent: an existing output file is skipped unless --force
 *   - large payloads are gzipped (.json.gz), small ones stored as plain .json
 *   - writes manifest.json ({path, bytes, sha256} for every fixture) at the end
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// configuration
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const OUT_ROOT = join(PKG_ROOT, 'test', 'fixtures', 'baseline');

// Defaults to the public Ruby image run locally
// (`docker run --rm -p 9292:80 sourceandsummit/church-calendar-api:2.7.0`), not to anyone's deployment.
const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:9292').replace(/\/+$/, '');
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? '2.7.0';
const USER_AGENT = 'church-calendar-baseline/1.0';
// A Passenger pool computes a whole liturgical year per request, and a small one starts returning
// nginx 503s at 4 concurrent full-year requests, so be conservative by default.
const CONCURRENCY = Math.min(4, Math.max(1, Number(process.env.CONCURRENCY ?? 2) || 2));
const THROTTLE_MS = Number(process.env.THROTTLE_MS ?? 200); // per worker, between requests
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 120_000);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [2_000, 8_000]; // after attempt 1, after attempt 2

const ARGV = process.argv.slice(2);
const FORCE = ARGV.includes('--force');
const DRY_RUN = ARGV.includes('--dry-run');
const ONLY = (() => {
  const arg = ARGV.find((a) => a.startsWith('--only='));
  if (!arg) return null;
  return new Set(arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean));
})();

/** Calendar ids in `GET /api/v0/en/calendars` order (config/calendars.yml order). */
const CALENDARS = [
  'general-en', 'general-la', 'general-fr', 'general-it', 'general-es',
  'us', 'us-ascension', 'us-boston', 'us-hartford', 'us-new-york', 'us-newark',
  'us-omaha', 'us-philadelphia',
  'czech', 'czech-cechy', 'czech-morava', 'czech-pha', 'czech-ltm', 'czech-hk',
  'czech-cb', 'czech-plz', 'czech-olm', 'czech-brn', 'czech-oo',
  'default',
];

/** Languages the API accepts (`LANGS` in lib/church-calendar.rb). Note: `es` is NOT accepted. */
const LANGS = ['cs', 'en', 'fr', 'it', 'la'];

/** KNOWN DEFECT in 2.7.0: these two 502 on every day request. */
const BROKEN_CALENDARS = new Set(['general-fr', 'general-es']);

/** The calendars captured in depth (every year 1970–2100): the two US variants and the two general reference calendars. */
const PRIMARY_CALENDARS = ['us', 'us-ascension', 'general-en', 'general-la'];

const YEAR_FIRST = 1970; // ChurchCalendar::CALENDAR_START
const YEAR_LAST = 2100;
const ALL_YEARS = range(YEAR_FIRST, YEAR_LAST);
const CROSS_CALENDAR_YEARS = [2025, 2026, 2027];

const LANG_FIXTURE_CALENDARS = ['us', 'general-la'];
const LANG_FIXTURE_YEAR = 2026;

const MONTH_FIXTURE = { cal: 'us', year: 2026 };

/** Hand-picked dates that exercise the interesting branches of the temporale/sanctorale/transfer logic. */
const DAY_DATES = [
  // Christmas cycle 2026/2027
  '2026-11-26', // Thanksgiving (US proper)
  '2026-11-28', // Saturday, vespers of the 1st Sunday of Advent
  '2026-11-29', // 1st Sunday of Advent
  '2026-12-17', '2026-12-18', '2026-12-19', '2026-12-20', '2026-12-21',
  '2026-12-22', '2026-12-23',
  '2026-12-24', // Christmas Eve: ferial "December 24th" + vigil Mass + vespers of Nativity
  '2026-12-25',
  '2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', // octave
  '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07',
  '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', // Epiphany eve/day, transferred vs fixed
  // Easter cycle 2026 (Easter = 2026-04-05)
  '2026-04-02', // Holy Thursday
  '2026-04-04', // Holy Saturday / eve of the Easter Vigil
  '2026-05-14', // Ascension Thursday (us-ascension) / ferial (us)
  '2026-05-17', // Ascension Sunday (us)
  '2026-05-23', // Pentecost eve
  '2026-05-25', // Mary, Mother of the Church
  '2026-06-13', // Immaculate Heart of Mary
  // Vigils of sanctorale solemnities
  '2026-06-23', '2026-06-24', // John the Baptist + vigil
  '2026-06-28', '2026-06-29', // Peter and Paul + vigil
  '2026-08-14', '2026-08-15', // Assumption + vigil
  // Collisions / transfers
  '2022-06-22', '2022-06-23', '2022-06-24', '2022-06-25', // Sacred Heart vs John the Baptist
  '2024-03-25', '2024-04-08', // Annunciation falls in Holy Week -> transferred
  '2019-12-08', '2019-12-09', // Immaculate Conception on the 2nd Sunday of Advent
  '2024-12-08', '2024-12-09', // ditto, 2024
  '2017-03-19', '2017-03-20', // St Joseph on a Sunday of Lent
  '2023-01-22', '2023-01-23', // Jan 22 on a Sunday -> Day of Prayer moved
  '2026-11-09', // Dedication of the Lateran Basilica (feast on a weekday)
  // Plain days
  '2026-09-18', // plain ferial
  '2026-09-19', // Saturday in OT with an optional memorial + saturday_memorial_bvm
  '2026-09-20', // Sunday in Ordinary Time
];
const DAY_CALENDARS = ['us', 'us-ascension'];

const YEAR_LECTIONARY_CALENDAR = 'us';

/** `Date` request header variants for the today/yesterday/tomorrow endpoints. */
const DATE_HEADER_VARIANTS = [
  { name: 'rfc1123', value: 'Sat, 01 Jan 2000 01:00:00 GMT' },
  { name: 'rfc850', value: 'Saturday, 01-Jan-00 01:00:00 GMT' },
  { name: 'asctime', value: 'Sat Jan  1 01:00:00 2000' },
  { name: 'invalid', value: 'not-a-date' },
  { name: 'absent', value: null },
];

/** Search `q` values (Ruby CalendarFacade#search_title + spell_out_ordinals). */
const SEARCH_QUERIES = [
  'advent', '33rd', 'thirty-third', 'Sunday', 'Mary', 'mass', 'joseph',
  '1st', 'first', 'Christ', 'ADVENT', 'of the', "'", '’', '',
];

const ERROR_CASES = [
  // lang
  ['lang-xx', 'GET', '/api/v0/xx/calendars'],
  ['lang-es', 'GET', '/api/v0/es/calendars'],
  // unknown calendar
  ['calendar-unknown', 'GET', '/api/v0/en/calendars/nope'],
  ['calendar-unknown-day', 'GET', '/api/v0/en/calendars/nope/2026/9/18'],
  ['calendar-unknown-today', 'GET', '/api/v0/en/calendars/nope/today'],
  // year
  ['year-1969', 'GET', '/api/v0/en/calendars/us/1969'],
  ['year-abc', 'GET', '/api/v0/en/calendars/us/abc'],
  ['year-12345', 'GET', '/api/v0/en/calendars/us/12345'],
  ['year-0', 'GET', '/api/v0/en/calendars/us/0'],
  // month
  ['month-0', 'GET', '/api/v0/en/calendars/us/2026/0'],
  ['month-13', 'GET', '/api/v0/en/calendars/us/2026/13'],
  ['month-xx', 'GET', '/api/v0/en/calendars/us/2026/xx'],
  // day
  ['day-0', 'GET', '/api/v0/en/calendars/us/2026/9/0'],
  ['day-32', 'GET', '/api/v0/en/calendars/us/2026/9/32'],
  ['day-xx', 'GET', '/api/v0/en/calendars/us/2026/9/xx'],
  ['day-2015-02-29', 'GET', '/api/v0/en/calendars/us/2015/2/29'],
  ['day-2015-02-30', 'GET', '/api/v0/en/calendars/us/2015/2/30'],
  ['day-2016-02-29-leap', 'GET', '/api/v0/en/calendars/us/2016/2/29'],
  ['day-2015-04-31', 'GET', '/api/v0/en/calendars/us/2015/4/31'],
  // search parameter parsing
  ['search-date-garbage', 'GET', '/api/v0/en/calendars/us/search?date=garbage'],
  ['search-date-month-13', 'GET', '/api/v0/en/calendars/us/search?date=2026-13-01'],
  ['search-startDate-garbage', 'GET', '/api/v0/en/calendars/us/search?startDate=garbage'],
  ['search-endDate-without-startDate', 'GET', '/api/v0/en/calendars/us/search?endDate=2026-01-05'],
  ['search-endDate-before-startDate', 'GET', '/api/v0/en/calendars/us/search?startDate=2026-06-01&endDate=2026-01-01'],
  ['search-single-day-range', 'GET', '/api/v0/en/calendars/us/search?startDate=2026-01-01&endDate=2026-01-01'],
  ['search-date-iso-datetime', 'GET', '/api/v0/en/calendars/us/search?date=2026-09-18T14%3A00%3A00.000Z'],
  ['search-date-slashes', 'GET', '/api/v0/en/calendars/us/search?date=2026%2F9%2F18'],
  ['search-date-compact', 'GET', '/api/v0/en/calendars/us/search?date=20260918'],
  ['search-date-d-mon-yyyy', 'GET', '/api/v0/en/calendars/us/search?date=18%20Sep%202026'],
  ['search-date-mon-d-yyyy', 'GET', '/api/v0/en/calendars/us/search?date=Sep%2018%202026'],
  ['search-date-unpadded', 'GET', '/api/v0/en/calendars/us/search?date=2026-9-8'],
  ['search-no-params', 'GET', '/api/v0/en/calendars/us/search'],
  // routing
  ['route-unknown', 'GET', '/api/unknown_route'],
  ['route-extra-segment', 'GET', '/api/v0/en/calendars/us/2026/9/18/extra'],
  ['route-post', 'POST', '/api/v0/en/calendars/us/2026/9/18'],
];

const REDIRECT_CASES = [
  '/api/v0/en/today',
  '/api/v0/en/2014',
  '/api/v0/en/2014/5',
  '/api/v0/en/2014/5/5',
];

const WEB_PATHS = [
  '/', '/browse', '/browse/us', '/browse/us/2026', '/browse/us/2026/9',
  '/browse/unknown', '/browse/us/1900/1', '/api-doc', '/about', '/style.css', '/swagger.yml',
];

const ORIGIN = 'https://example.com';

/** Max body bytes inlined into the aggregate misc/*.json fixtures. */
const INLINE_BODY_LIMIT = 20_000;

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------

function range(from, to) {
  const out = [];
  for (let n = from; n <= to; n += 1) out.push(n);
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pad2 = (n) => String(n).padStart(2, '0');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function headersToObject(headers) {
  const out = {};
  for (const [k, v] of headers) out[k.toLowerCase()] = v;
  return out;
}

const stats = {
  requests: 0,
  retries: 0,
  bytesDownloaded: 0,
  written: 0,
  skipped: 0,
  retriedFailures: 0,
  failures: [],
  statuses: new Map(),
  notes: [],
};

function noteStatus(status) {
  stats.statuses.set(status, (stats.statuses.get(status) ?? 0) + 1);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * @param {string} path  path beginning with '/'
 * @param {{ method?: string, headers?: Record<string,string>, allowBroken?: boolean }} [opts]
 * @returns {Promise<{ status: number, statusText: string, headers: Record<string,string>, body: Buffer, text: string, url: string }>}
 */
async function request(path, opts = {}) {
  const { method = 'GET', headers = {}, allowBroken = false } = opts;
  const url = BASE_URL + path;
  const maxAttempts = allowBroken ? 1 : MAX_ATTEMPTS;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (THROTTLE_MS > 0) await sleep(THROTTLE_MS);
      stats.requests += 1;
      const res = await fetch(url, {
        method,
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = Buffer.from(await res.arrayBuffer());
      stats.bytesDownloaded += body.length;
      noteStatus(res.status);
      if (res.status >= 500 && attempt < maxAttempts) {
        stats.retries += 1;
        await sleep(BACKOFF_MS[attempt - 1] ?? 8_000);
        continue;
      }
      return {
        status: res.status,
        statusText: res.statusText,
        headers: headersToObject(res.headers),
        body,
        text: body.toString('utf8'),
        url,
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        stats.retries += 1;
        await sleep(BACKOFF_MS[attempt - 1] ?? 8_000);
        continue;
      }
    }
  }
  throw new Error(`request failed after ${maxAttempts} attempt(s): ${method} ${url}: ${lastError?.message ?? 'unknown'}`);
}

/** Response shape recorded in the aggregate misc/*.json fixtures. */
function summarize(res, { inline = true } = {}) {
  const out = {
    status: res.status,
    content_type: res.headers['content-type'] ?? null,
    bytes: res.body.length,
    sha256: sha256(res.body),
  };
  if (res.headers.location) out.location = res.headers.location;
  if (!inline) return out;

  const ct = out.content_type ?? '';
  let parsed;
  let parseFailed = false;
  if (ct.includes('json')) {
    try {
      parsed = JSON.parse(res.text);
    } catch {
      parseFailed = true;
    }
  }

  // Day arrays can be huge; always record their shape, inline the body only when it is small.
  if (Array.isArray(parsed)) {
    out.array_length = parsed.length;
    const dates = parsed.map((d) => (d && typeof d === 'object' ? d.date : undefined));
    if (dates.every((d) => typeof d === 'string')) out.dates = dates;
  }

  if (res.body.length <= INLINE_BODY_LIMIT) {
    if (parsed !== undefined) out.body = parsed;
    else out.body_text = res.text;
  } else if (parseFailed) {
    out.body_truncated = res.text.slice(0, INLINE_BODY_LIMIT);
  }
  return out;
}

// ---------------------------------------------------------------------------
// writers
// ---------------------------------------------------------------------------

async function writeFixture(relPath, buf) {
  const abs = join(OUT_ROOT, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  stats.written += 1;
}

const jsonBuf = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

async function writeJson(relPath, value) {
  await writeFixture(relPath, jsonBuf(value));
}

async function writeJsonGz(relPath, value) {
  // level 9 + no mtime/OS in the header keeps the output byte-stable across runs and machines.
  await writeFixture(relPath, gzipSync(Buffer.from(JSON.stringify(value), 'utf8'), { level: 9 }));
}

async function writeText(relPath, text) {
  await writeFixture(relPath, Buffer.from(text, 'utf8'));
}

function exists(relPath) {
  return existsSync(join(OUT_ROOT, relPath));
}

/** Remove a stale plain-JSON error fixture once the same day set has been captured successfully. */
async function dropStaleErrorFixture(relPath) {
  const abs = join(OUT_ROOT, relPath);
  if (existsSync(abs)) await rm(abs);
}

/**
 * A previously written `{status, body}` fixture for a route that ought to return 200 means a FAILED
 * capture (a small Passenger pool answers nginx 503 when it is saturated), not recorded
 * behaviour — so those are re-attempted on the next run without --force.
 */
function isRecoverableFailure(relPath, expectFailure) {
  if (expectFailure) return false; // a recorded 502 from a known-broken calendar IS the fixture
  const abs = join(OUT_ROOT, relPath);
  if (!existsSync(abs) || !relPath.endsWith('.json')) return false;
  try {
    const value = JSON.parse(readFileSync(abs, 'utf8'));
    return typeof value?.status === 'number' && value.status >= 500;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// task construction
// ---------------------------------------------------------------------------

/** @type {{ group: string, out: string, run: () => Promise<void> }[]} */
const tasks = [];

function addTask(group, out, run, expectFailure = false) {
  if (ONLY && !ONLY.has(group)) return;
  tasks.push({ group, out, run, expectFailure });
}

const apiPath = (lang, rest) => `/api/v0/${lang}/calendars${rest}`;

/** Parse a JSON body, or throw with context. */
function parseJson(res, what) {
  try {
    return JSON.parse(res.text);
  } catch {
    throw new Error(`${what}: ${res.status} body is not JSON: ${res.text.slice(0, 200)}`);
  }
}

// --- days/<cal>/<year>.json.gz ---------------------------------------------

function addDaysTask(cal, year) {
  const broken = BROKEN_CALENDARS.has(cal);
  const out = broken ? `days/${cal}/${year}.json` : `days/${cal}/${year}.json.gz`;
  addTask('days', out, async () => {
    const res = await request(
      apiPath('en', `/${cal}/search?startDate=${year}-01-01&endDate=${year}-12-31`),
      { allowBroken: broken },
    );
    if (res.status !== 200) {
      await writeJson(`days/${cal}/${year}.json`, { status: res.status, body: res.text });
      return;
    }
    await writeJsonGz(`days/${cal}/${year}.json.gz`, parseJson(res, `days ${cal} ${year}`));
    await dropStaleErrorFixture(`days/${cal}/${year}.json`);
  }, broken);
}

for (const cal of PRIMARY_CALENDARS) for (const year of ALL_YEARS) addDaysTask(cal, year);
for (const cal of CALENDARS) {
  if (PRIMARY_CALENDARS.includes(cal)) continue;
  for (const year of CROSS_CALENDAR_YEARS) addDaysTask(cal, year);
}
// the primary calendars already cover 2025-2027.

// --- lang/<lang>/<cal>-<year>.json.gz ---------------------------------------

for (const lang of LANGS) {
  for (const cal of LANG_FIXTURE_CALENDARS) {
    const year = LANG_FIXTURE_YEAR;
    addTask('lang', `lang/${lang}/${cal}-${year}.json.gz`, async () => {
      const res = await request(apiPath(lang, `/${cal}/search?startDate=${year}-01-01&endDate=${year}-12-31`));
      if (res.status !== 200) {
        await writeJson(`lang/${lang}/${cal}-${year}.json`, { status: res.status, body: res.text });
        return;
      }
      await writeJsonGz(`lang/${lang}/${cal}-${year}.json.gz`, parseJson(res, `lang ${lang} ${cal}`));
      await dropStaleErrorFixture(`lang/${lang}/${cal}-${year}.json`);
    });
  }
}

// --- month/<cal>/<year>-<month>.json ----------------------------------------

for (let m = 1; m <= 12; m += 1) {
  const { cal, year } = MONTH_FIXTURE;
  addTask('month', `month/${cal}/${year}-${pad2(m)}.json`, async () => {
    const res = await request(apiPath('en', `/${cal}/${year}/${m}`));
    await writeJson(`month/${cal}/${year}-${pad2(m)}.json`,
      res.status === 200 ? parseJson(res, `month ${cal} ${year}-${m}`) : { status: res.status, body: res.text });
  });
}

// --- day/<cal>/<date>.json ---------------------------------------------------

for (const cal of DAY_CALENDARS) {
  for (const date of DAY_DATES) {
    const [y, m, d] = date.split('-').map(Number);
    addTask('day', `day/${cal}/${date}.json`, async () => {
      const res = await request(apiPath('en', `/${cal}/${y}/${m}/${d}`));
      await writeJson(`day/${cal}/${date}.json`,
        res.status === 200 ? parseJson(res, `day ${cal} ${date}`) : { status: res.status, body: res.text });
    });
  }
}

// --- year/<cal>/<year>.json (lectionary) -------------------------------------

for (const year of ALL_YEARS) {
  const cal = YEAR_LECTIONARY_CALENDAR;
  addTask('year', `year/${cal}/${year}.json`, async () => {
    const res = await request(apiPath('en', `/${cal}/${year}`));
    await writeJson(`year/${cal}/${year}.json`,
      res.status === 200 ? parseJson(res, `year ${cal} ${year}`) : { status: res.status, body: res.text });
  });
}

// --- misc/calendars.json ------------------------------------------------------

addTask('misc', 'misc/calendars.json', async () => {
  const res = await request('/api/v0/en/calendars');
  await writeJson('misc/calendars.json', {
    url: '/api/v0/en/calendars',
    status: res.status,
    content_type: res.headers['content-type'] ?? null,
    bytes: res.body.length,
    sha256: sha256(res.body),
    raw: res.text, // raw so the pretty-printing quirk is preserved
    body: res.status === 200 ? parseJson(res, 'calendars') : null,
  });
});

// --- misc/calendar-descriptions.json -----------------------------------------

addTask('misc', 'misc/calendar-descriptions.json', async () => {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const cal of CALENDARS) {
    const res = await request(apiPath('en', `/${cal}`), { allowBroken: BROKEN_CALENDARS.has(cal) });
    out[cal] = { url: apiPath('en', `/${cal}`), ...summarize(res), raw: res.text };
  }
  await writeJson('misc/calendar-descriptions.json', out);
});

// --- misc/today.json ----------------------------------------------------------

addTask('misc', 'misc/today.json', async () => {
  const entries = [];
  for (const endpoint of ['yesterday', 'today', 'tomorrow']) {
    for (const variant of DATE_HEADER_VARIANTS) {
      const path = apiPath('en', `/us/${endpoint}`);
      const headers = variant.value === null ? {} : { Date: variant.value };
      const res = await request(path, { headers });
      entries.push({
        endpoint,
        date_header: variant.name,
        date_header_value: variant.value,
        url: path,
        // `absent` resolves against "now" on the server, so its body is informational only.
        deterministic: variant.name !== 'absent',
        ...summarize(res),
        response_date_header: res.headers.date ?? null,
      });
    }
  }
  await writeJson('misc/today.json', {
    note: 'Entries with deterministic=false depend on the server clock at capture time; assert only the shape.',
    entries,
  });
});

// --- misc/redirects.json -------------------------------------------------------

addTask('misc', 'misc/redirects.json', async () => {
  const entries = [];
  for (const path of REDIRECT_CASES) {
    const res = await request(path);
    entries.push({ url: path, ...summarize(res) });
  }
  await writeJson('misc/redirects.json', { note: 'Redirects are NOT followed.', entries });
});

// --- misc/errors.json ----------------------------------------------------------

addTask('misc', 'misc/errors.json', async () => {
  const entries = [];
  for (const [name, method, path] of ERROR_CASES) {
    const res = await request(path, { method });
    entries.push({ name, method, url: path, ...summarize(res) });
  }
  await writeJson('misc/errors.json', { entries });
});

// --- misc/search-queries.json ---------------------------------------------------

addTask('misc', 'misc/search-queries.json', async () => {
  const entries = [];
  for (const q of SEARCH_QUERIES) {
    const path = apiPath('en', `/us/search?q=${encodeURIComponent(q)}&startDate=2026-01-01&endDate=2026-12-31`);
    const res = await request(path);
    const parsed = res.status === 200 ? parseJson(res, `search q=${q}`) : null;
    entries.push({
      q,
      url: path,
      status: res.status,
      bytes: res.body.length,
      sha256: sha256(res.body),
      count: Array.isArray(parsed) ? parsed.length : null,
      // Dates identify the matched days; the day bodies themselves live in days/us/2026.json.gz.
      dates: Array.isArray(parsed) ? parsed.map((d) => d.date) : null,
      titles: Array.isArray(parsed) && parsed.length <= 60
        ? parsed.map((d) => d.celebrations.map((c) => c.title))
        : null,
      body: res.body.length <= INLINE_BODY_LIMIT ? parsed : null,
    });
  }
  await writeJson('misc/search-queries.json', {
    calendar: 'us',
    lang: 'en',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    note: 'body is inlined only for small results; otherwise use `dates` joined against days/us/2026.json.gz.',
    entries,
  });
});

// --- misc/headers.json -----------------------------------------------------------

addTask('misc', 'misc/headers.json', async () => {
  const entries = [];
  const probes = [
    { name: 'api-day', method: 'GET', path: apiPath('en', '/us/2026/9/18') },
    { name: 'api-calendars', method: 'GET', path: '/api/v0/en/calendars' },
    { name: 'swagger', method: 'GET', path: '/swagger.yml' },
    { name: 'web-root', method: 'GET', path: '/' },
  ];
  for (const probe of probes) {
    for (const withOrigin of [false, true]) {
      const res = await request(probe.path, {
        method: probe.method,
        headers: withOrigin ? { Origin: ORIGIN } : {},
      });
      entries.push({
        name: `${probe.name}${withOrigin ? '-with-origin' : ''}`,
        method: probe.method,
        url: probe.path,
        origin: withOrigin ? ORIGIN : null,
        status: res.status,
        headers: res.headers,
      });
    }
  }
  // CORS preflight
  for (const path of [apiPath('en', '/us/2026/9/18'), '/swagger.yml']) {
    const res = await request(path, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' },
    });
    entries.push({
      name: `preflight${path.startsWith('/swagger') ? '-swagger' : '-api-day'}`,
      method: 'OPTIONS', url: path, origin: ORIGIN, status: res.status, headers: res.headers,
    });
  }
  await writeJson('misc/headers.json', {
    note: '`date` and any per-request headers vary; assert on cache-control / access-control-* / content-type.',
    entries,
  });
});

// --- misc/web.json (+ full bodies) -------------------------------------------------

addTask('misc', 'misc/web.json', async () => {
  const entries = [];
  for (const path of WEB_PATHS) {
    const res = await request(path);
    entries.push({
      url: path,
      status: res.status,
      content_type: res.headers['content-type'] ?? null,
      location: res.headers.location ?? null,
      bytes: res.body.length,
      sha256: sha256(res.body),
    });
  }
  await writeJson('misc/web.json', {
    note: 'HTML markup parity is explicitly NOT required (see docs/ARCHITECTURE.md); these are drift canaries.',
    entries,
  });
});

addTask('misc', 'misc/swagger.yml.txt', async () => {
  const res = await request('/swagger.yml');
  await writeText('misc/swagger.yml.txt', res.text);
});

addTask('misc', 'misc/browse-us-2026-9.html.txt', async () => {
  const res = await request('/browse/us/2026/9');
  await writeText('misc/browse-us-2026-9.html.txt', res.text);
});

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------

const MANIFEST_EXCLUDE = new Set(['manifest.json', 'README.md']);

async function walk(dir, acc = []) {
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const item of items) {
    const abs = join(dir, item.name);
    if (item.isDirectory()) await walk(abs, acc);
    else if (item.isFile()) acc.push(abs);
  }
  return acc;
}

async function buildManifest(startedAt, finishedAt) {
  const files = await walk(OUT_ROOT);
  const rows = [];
  for (const abs of files) {
    const rel = relative(OUT_ROOT, abs).split(sep).join('/');
    if (MANIFEST_EXCLUDE.has(rel)) continue;
    const buf = await readFile(abs);
    rows.push({ path: rel, bytes: buf.length, sha256: sha256(buf) });
  }
  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // A capture may be completed over several runs (resume after a failure); keep the totals cumulative
  // so manifest.json describes the whole fixture set rather than only the last pass.
  let previous = null;
  const manifestPath = join(OUT_ROOT, 'manifest.json');
  if (!FORCE && existsSync(manifestPath)) {
    try {
      previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      previous = null;
    }
  }

  return {
    base_url: BASE_URL,
    service: 'church-calendar-api',
    service_version: SERVICE_VERSION,
    capture_started_at: previous?.capture_started_at ?? startedAt,
    capture_finished_at: finishedAt,
    total_requests: (previous?.total_requests ?? 0) + stats.requests,
    runs: (previous?.runs ?? 0) + 1,
    last_run: {
      started_at: startedAt,
      finished_at: finishedAt,
      requests: stats.requests,
      retries: stats.retries,
      files_written: stats.written,
      files_skipped: stats.skipped,
    },
    file_count: rows.length,
    total_bytes: rows.reduce((n, r) => n + r.bytes, 0),
    files: rows,
  };
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

async function runPool(items, concurrency) {
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const task = items[index];
      try {
        await task.run();
      } catch (err) {
        stats.failures.push({ out: task.out, group: task.group, error: String(err?.message ?? err) });
        process.stderr.write(`  !! ${task.out}: ${err?.message ?? err}\n`);
      }
      const done = index + 1;
      if (done % 50 === 0 || done === items.length) {
        process.stderr.write(`  .. ${done}/${items.length} (${stats.requests} requests)\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function main() {
  const startedAt = new Date().toISOString();
  await mkdir(OUT_ROOT, { recursive: true });

  const pending = [];
  for (const task of tasks) {
    // `days`/`lang` for a broken calendar may already exist under the plain-json name.
    const alternates = task.out.endsWith('.json.gz') ? [task.out, task.out.slice(0, -3)] : [task.out];
    const present = alternates.filter(exists);
    // A recorded 5xx means the capture failed (saturated Passenger pool), so try it again.
    const recoverable = present.length > 0 && present.every((p) => isRecoverableFailure(p, task.expectFailure));
    if (!FORCE && present.length > 0 && !recoverable) {
      stats.skipped += 1;
      continue;
    }
    if (recoverable) stats.retriedFailures += 1;
    pending.push(task);
  }

  process.stderr.write(
    `capture-baseline: base=${BASE_URL} concurrency=${CONCURRENCY} ` +
    `tasks=${tasks.length} pending=${pending.length} skipped=${stats.skipped} ` +
    `retrying-failed=${stats.retriedFailures}${FORCE ? ' (--force)' : ''}\n`,
  );

  if (DRY_RUN) {
    for (const t of pending) process.stdout.write(`${t.group}\t${t.out}\n`);
    return;
  }

  await runPool(pending, CONCURRENCY);

  const finishedAt = new Date().toISOString();
  const manifest = await buildManifest(startedAt, finishedAt);
  await writeFile(join(OUT_ROOT, 'manifest.json'), jsonBuf(manifest));

  const seconds = (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000;
  const mib = (n) => `${(n / 1024 / 1024).toFixed(2)} MiB`;
  process.stderr.write(
    `\ncapture-baseline summary\n` +
    `  base url        ${BASE_URL}\n` +
    `  duration        ${seconds.toFixed(1)}s\n` +
    `  requests        ${stats.requests} (retries ${stats.retries})\n` +
    `  downloaded      ${mib(stats.bytesDownloaded)}\n` +
    `  files written   ${stats.written}\n` +
    `  files skipped   ${stats.skipped}\n` +
    `  retried failed  ${stats.retriedFailures}\n` +
    `  fixture files   ${manifest.file_count} (${mib(manifest.total_bytes)} on disk)\n` +
    `  statuses        ${[...stats.statuses].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join(' ')}\n` +
    `  failures        ${stats.failures.length}\n`,
  );
  for (const f of stats.failures) process.stderr.write(`    - ${f.out}: ${f.error}\n`);
  if (stats.failures.length > 0) process.exitCode = 1;
}

await main();
