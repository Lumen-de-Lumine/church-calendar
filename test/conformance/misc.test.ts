/**
 * Golden tests over `test/fixtures/baseline/misc/**` — everything that is not a
 * day listing: the calendar list and descriptions (parsed AND raw text), the
 * `Date`-header routes, the four 301s, all 36 error cases, the 15 search queries,
 * the CORS/header probes and the Roda web UI.
 */

import { createHash } from 'node:crypto';
import { diffDays, formatDiffs, request } from '../helpers/handler.js';
import { loadJson, readFixture } from '../helpers/fixtures.js';
import type { BaselineCalendarDescription, BaselineDay } from '../helpers/fixtures.js';

function sha256(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function bytes(body: string): number {
  return Buffer.byteLength(body, 'utf8');
}

// ---------------------------------------------------------------------------
// misc/calendars.json — parsed AND raw
// ---------------------------------------------------------------------------

describe('conformance: misc/calendars.json', () => {
  const fixture = loadJson<{
    url: string;
    status: number;
    content_type: string;
    bytes: number;
    sha256: string;
    raw: string;
    body: string[];
  }>('misc/calendars.json');

  const response = request(fixture.url);

  it('status and content-type', () => {
    expect(response.status).toBe(fixture.status);
    expect(response.headers['content-type']).toBe(fixture.content_type);
  });

  it('parsed body', () => {
    expect(JSON.parse(response.body)).toEqual(fixture.body);
  });

  it('RAW body is byte-identical (Oj pretty: 2-space indent, no space after colon)', () => {
    expect(response.body).toBe(fixture.raw);
    expect(bytes(response.body)).toBe(fixture.bytes);
    expect(sha256(response.body)).toBe(fixture.sha256);
  });
});

// ---------------------------------------------------------------------------
// misc/calendar-descriptions.json — all 25 calendars, parsed AND raw
// ---------------------------------------------------------------------------

describe('conformance: misc/calendar-descriptions.json', () => {
  interface DescriptionFixture {
    url: string;
    status: number;
    content_type: string | null;
    bytes: number;
    sha256: string;
    body?: BaselineCalendarDescription;
    raw?: string;
    body_text?: string;
  }
  const fixtures = loadJson<Record<string, DescriptionFixture>>('misc/calendar-descriptions.json');

  it('covers all 25 calendars', () => {
    expect(Object.keys(fixtures).length).toBe(25);
  });

  for (const [key, fixture] of Object.entries(fixtures)) {
    it(key, () => {
      const response = request(fixture.url);
      expect(response.status).toBe(fixture.status);
      if (fixture.status !== 200) {
        // general-fr / general-es fail to load their sanctorale (Q10) -> 502.
        expect(response.body.length).toBeGreaterThan(0);
        return;
      }
      expect(response.headers['content-type']).toBe(fixture.content_type);
      expect(JSON.parse(response.body)).toEqual(fixture.body);
      if (fixture.raw !== undefined) {
        expect(response.body).toBe(fixture.raw);
        expect(bytes(response.body)).toBe(fixture.bytes);
        expect(sha256(response.body)).toBe(fixture.sha256);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// misc/today.json
// ---------------------------------------------------------------------------

describe('conformance: misc/today.json', () => {
  interface TodayFixture {
    endpoint: 'yesterday' | 'today' | 'tomorrow';
    date_header: string;
    date_header_value: string | null;
    url: string;
    deterministic: boolean;
    status: number;
    content_type: string;
    bytes: number;
    sha256: string;
    body: BaselineDay | { error: string };
  }
  const { entries } = loadJson<{ entries: TodayFixture[] }>('misc/today.json');

  it('has all 15 probes', () => {
    expect(entries.length).toBe(15);
  });

  for (const entry of entries) {
    it(`${entry.endpoint} / Date: ${entry.date_header}`, () => {
      const headers: Record<string, string> = {};
      if (entry.date_header_value !== null) headers.Date = entry.date_header_value;
      const response = request(entry.url, { headers });

      expect(response.status).toBe(entry.status);
      expect(response.headers['content-type']).toBe(entry.content_type);

      if (entry.deterministic) {
        // A pinned `Date` header makes the whole response deterministic.
        expect(JSON.parse(response.body)).toEqual(entry.body);
        if (entry.status === 200) {
          expect(bytes(response.body)).toBe(entry.bytes);
          expect(sha256(response.body)).toBe(entry.sha256);
        }
        return;
      }

      // Clock-dependent: assert only the SHAPE (fixture README, "do not pin").
      const body = JSON.parse(response.body) as BaselineDay;
      expect(Object.keys(body)).toEqual(Object.keys(entry.body));
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(body.celebrations)).toBe(true);
      expect(body.celebrations.length).toBeGreaterThan(0);
      for (const cel of body.celebrations) {
        expect(Object.keys(cel)).toEqual(['title', 'colour', 'rank', 'rank_num', 'id']);
      }
    });
  }

  it('yesterday/today/tomorrow are consecutive for the same Date header', () => {
    const headers = { Date: 'Sat, 01 Jan 2000 01:00:00 GMT' };
    const dates = ['yesterday', 'today', 'tomorrow'].map((endpoint) => {
      const response = request(`/api/v0/en/calendars/us/${endpoint}`, { headers });
      return (JSON.parse(response.body) as BaselineDay).date;
    });
    expect(dates).toEqual(['1999-12-31', '2000-01-01', '2000-01-02']);
  });
});

// ---------------------------------------------------------------------------
// misc/redirects.json
// ---------------------------------------------------------------------------

describe('conformance: misc/redirects.json', () => {
  interface RedirectFixture {
    url: string;
    status: number;
    content_type: string;
    bytes: number;
    sha256: string;
    location: string;
    body_text: string;
  }
  const { entries } = loadJson<{ entries: RedirectFixture[] }>('misc/redirects.json');

  it('has all four redirects', () => {
    expect(entries.length).toBe(4);
  });

  for (const entry of entries) {
    it(entry.url, () => {
      const response = request(entry.url);
      expect(response.status).toBe(entry.status);
      expect(response.headers['content-type']).toBe(entry.content_type);
      // The Ruby service emits a RELATIVE Location (verified with curl on
      // 2026-09-18); `absoluteRedirects: true` opts out.
      expect(response.headers.location).toBe(entry.location);
      expect(response.body).toBe(entry.body_text);
      expect(bytes(response.body)).toBe(entry.bytes);
      expect(sha256(response.body)).toBe(entry.sha256);
      expect(response.headers['cache-control']).toBe('max-age=3600');
    });
  }
});

// ---------------------------------------------------------------------------
// misc/errors.json — all 36 cases
// ---------------------------------------------------------------------------

describe('conformance: misc/errors.json', () => {
  interface ErrorFixture {
    name: string;
    method: string;
    url: string;
    status: number;
    content_type: string | null;
    bytes: number;
    sha256: string;
    body?: unknown;
    body_text?: string;
    array_length?: number;
    dates?: string[];
  }
  const { entries } = loadJson<{ entries: ErrorFixture[] }>('misc/errors.json');

  it('has every recorded probe', () => {
    expect(entries.length).toBe(35);
  });

  for (const entry of entries) {
    it(`${entry.name} (${entry.status})`, () => {
      const response = request(entry.url, { method: entry.method });
      expect(response.status).toBe(entry.status);
      expect(response.headers['content-type'] ?? null).toBe(entry.content_type);

      if (entry.name === 'search-no-params') {
        // Clock-dependent by design (BASELINE defect A): today .. today + 365.
        const days = JSON.parse(response.body) as BaselineDay[];
        expect(days.length).toBe(entry.array_length);
        const first = new Date(`${days[0].date}T00:00:00Z`).getTime();
        const last = new Date(`${days[days.length - 1].date}T00:00:00Z`).getTime();
        expect((last - first) / 86400000).toBe(365);
        return;
      }

      if (entry.body_text !== undefined) {
        expect(response.body).toBe(entry.body_text);
      } else {
        expect(JSON.parse(response.body)).toEqual(entry.body);
      }
      expect(bytes(response.body)).toBe(entry.bytes);
      expect(sha256(response.body)).toBe(entry.sha256);
    });
  }
});

// ---------------------------------------------------------------------------
// misc/search-queries.json
// ---------------------------------------------------------------------------

describe('conformance: misc/search-queries.json', () => {
  interface SearchFixture {
    q: string;
    url: string;
    status: number;
    bytes: number;
    sha256: string;
    count: number;
    dates: string[];
    titles: string[][] | null;
    body: BaselineDay[] | null;
  }
  const fixture = loadJson<{ entries: SearchFixture[] }>('misc/search-queries.json');

  it('has all 15 queries', () => {
    expect(fixture.entries.length).toBe(15);
  });

  for (const entry of fixture.entries) {
    it(`q=${JSON.stringify(entry.q)} -> ${entry.count} day(s)`, () => {
      const response = request(entry.url);
      expect(response.status).toBe(entry.status);

      const days = JSON.parse(response.body) as BaselineDay[];
      expect(days.map((d) => d.date)).toEqual(entry.dates);
      if (entry.titles !== null) {
        expect(days.map((d) => d.celebrations.map((c) => c.title))).toEqual(entry.titles);
      }

      if (entry.body !== null) {
        const diffs = diffDays(entry.body, days);
        if (diffs.length > 0) throw new Error(formatDiffs(`q=${entry.q}`, diffs));
      }

      // Byte parity of the pretty-array-of-compact-objects shape.
      expect(bytes(response.body)).toBe(entry.bytes);
      expect(sha256(response.body)).toBe(entry.sha256);
    });
  }
});

// ---------------------------------------------------------------------------
// misc/headers.json
// ---------------------------------------------------------------------------

describe('conformance: misc/headers.json', () => {
  interface HeaderFixture {
    name: string;
    method: string;
    url: string;
    origin: string | null;
    status: number;
    headers: Record<string, string>;
  }
  const { entries } = loadJson<{ entries: HeaderFixture[] }>('misc/headers.json');

  /** Headers the Ruby stack sets that are the web server's, not the app's. */
  const SERVER_HEADERS = new Set([
    'connection', 'date', 'status', 'x-powered-by', 'transfer-encoding',
    'content-encoding', 'age', 'server',
  ]);

  it('has all 10 probes', () => {
    expect(entries.length).toBe(10);
  });

  for (const entry of entries) {
    it(entry.name, () => {
      const headers: Record<string, string> = {};
      if (entry.origin !== null) headers.Origin = entry.origin;
      if (entry.method === 'OPTIONS') headers['Access-Control-Request-Method'] = 'GET';

      const response = request(entry.url, { method: entry.method, headers });
      expect(response.status).toBe(entry.status);

      for (const [name, value] of Object.entries(entry.headers)) {
        if (SERVER_HEADERS.has(name)) continue;
        if (name === 'content-length') {
          // Only meaningful where the fixture was not gzipped by nginx.
          if (entry.headers['content-encoding'] === undefined) {
            expect(Buffer.byteLength(response.body, 'utf8')).toBe(Number(value));
          }
          continue;
        }
        expect([name, response.headers[name]]).toEqual([name, value]);
      }

      // Headers the Ruby stack does NOT set must be absent too.
      if (entry.headers['access-control-allow-origin'] === undefined) {
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      }
      if (entry.headers['cache-control'] === undefined) {
        expect(response.headers['cache-control']).toBeUndefined();
      }
      if (entry.headers.vary === undefined) {
        expect(response.headers.vary).toBeUndefined();
      }
    });
  }

  it('never emits x-powered-by', () => {
    const response = request('/api/v0/en/calendars/us/2026/9/18');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// misc/web.json
// ---------------------------------------------------------------------------

describe('conformance: misc/web.json', () => {
  interface WebFixture {
    url: string;
    status: number;
    content_type: string;
    location: string | null;
    bytes: number;
    sha256: string;
  }
  const { entries } = loadJson<{ entries: WebFixture[] }>('misc/web.json');

  it('has all 11 routes', () => {
    expect(entries.length).toBe(11);
  });

  for (const entry of entries) {
    it(`${entry.url} -> ${entry.status}`, () => {
      const response = request(entry.url, { headers: { Host: 'localhost:9292' } });
      expect(response.status).toBe(entry.status);
      expect(response.headers['content-type']).toBe(entry.content_type);
      expect(response.headers.location ?? null).toBe(entry.location);
      if (entry.bytes === 0) {
        // The bodyless 302/404/400 responses.
        expect(response.body).toBe('');
      } else {
        expect(response.body.length).toBeGreaterThan(0);
      }
      expect(response.headers['cache-control']).toBe('max-age=3600');
    });
  }

  it('/style.css is byte-identical', () => {
    const fixture = entries.find((e) => e.url === '/style.css');
    const response = request('/style.css');
    expect(bytes(response.body)).toBe(fixture?.bytes);
    expect(sha256(response.body)).toBe(fixture?.sha256);
  });

  it('/swagger.yml matches the captured YAML after whitespace normalization', () => {
    const expected = readFixture('misc/swagger.yml.txt').toString('utf8');
    // The fixture was captured with the documented default, BASE_URL=http://localhost:9292.
    const response = request('/swagger.yml', { headers: { Host: 'localhost:9292' } });
    expect(response.status).toBe(200);
    // ruby: Roda serves the ERB output as text/html, not YAML (Q22).
    expect(response.headers['content-type']).toBe('text/html');

    const normalize = (s: string): string =>
      s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
    expect(normalize(response.body)).toBe(normalize(expected));
  });

  it('/swagger.yml interpolates the request host into docs_url', () => {
    const response = request('/swagger.yml', {
      headers: { Host: 'calendar.example.com', 'X-Forwarded-Proto': 'https' },
    });
    expect(response.body).toContain('url: https://calendar.example.com/api-doc');
  });
});
