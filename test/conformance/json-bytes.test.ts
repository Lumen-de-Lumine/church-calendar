/**
 * Byte-level parity of the three JSON shapes Grape's formatter produces, one
 * route per shape, against the raw texts kept in the fixtures.
 *
 * Parsed equality is the conformance criterion; these tests pin the FORMATTING,
 * which parsed equality cannot see (docs/BASELINE.md, "Corrections and additions").
 */

import { createHash } from 'node:crypto';
import { request } from '../helpers/handler.js';
import { loadJson } from '../helpers/fixtures.js';

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const len = (s: string): number => Buffer.byteLength(s, 'utf8');

describe('byte parity: shape 1 — plain Hash/Array, Oj pretty', () => {
  it('GET /calendars is the exact captured text', () => {
    const fixture = loadJson<{ raw: string; bytes: number; sha256: string }>(
      'misc/calendars.json',
    );
    const body = request('/api/v0/en/calendars').body;
    expect(body).toBe(fixture.raw);
    expect(len(body)).toBe(fixture.bytes);
    expect(sha(body)).toBe(fixture.sha256);
  });

  it('two-space indent, NO space after the colon, trailing newline', () => {
    const body = request('/api/v0/en/calendars/general-en').body;
    expect(body).toBe(
      '{\n' +
        '  "system":{\n' +
        '    "promulgated":1969,\n' +
        '    "effective_since":1970,\n' +
        '    "desc":"promulgated by motu proprio Mysterii Paschalis of Paul VI. ' +
        '(AAS 61 (1969), pp. 222-226)."\n' +
        '  },\n' +
        '  "sanctorale":{\n' +
        '    "title":"General Roman Calendar",\n' +
        '    "language":"en"\n' +
        '  }\n' +
        '}\n',
    );
  });

  it('GET /:year is pretty too', () => {
    expect(request('/api/v0/en/calendars/us/2026').body).toBe(
      '{\n  "lectionary":"B",\n  "ferial_lectionary":1\n}\n',
    );
  });
});

describe('byte parity: shape 2 — a single Grape::Entity is COMPACT', () => {
  it('GET /:y/:m/:d', () => {
    const body = request('/api/v0/en/calendars/us/2026/9/18').body;
    expect(body).toBe(
      '{"date":"2026-09-18","season":"ordinary","season_week":24,"cycle":2,' +
        '"cycle_sunday":"A","cycle_ferial":2,"celebrations":[' +
        '{"title":"Friday of the 24th Week in Ordinary Time","colour":"green",' +
        '"rank":"ferial","rank_num":3.13,"id":null}],"vespers":null,"weekday":"friday"}\n',
    );
    expect(len(body)).toBe(268);
  });

  it('a commemoration writes rank_num as the Ruby Float 4.0, not 4', () => {
    const body = request('/api/v0/en/calendars/us/1999/12/31').body;
    expect(body).toContain('"rank_num":4.0');
    // 539 bytes on the wire; 537 if the `.0` were dropped.
    expect(len(body)).toBe(539);
  });

  it('a general memorial writes 3.1 (the Ruby literal 3.10 IS 3.1)', () => {
    expect(request('/api/v0/en/calendars/us/2015/6/11').body).toContain('"rank_num":3.1,');
  });
});

describe('byte parity: shape 3 — an Array of entities is a PRETTY array of COMPACT objects', () => {
  it('search with a one-day range', () => {
    const body = request(
      '/api/v0/en/calendars/us/search?startDate=2026-01-01&endDate=2026-01-01',
    ).body;
    expect(body.startsWith('[\n  {"date":"2026-01-01"')).toBe(true);
    expect(body.endsWith('"weekday":"thursday"}\n]\n')).toBe(true);
    expect(len(body)).toBe(290);
  });

  it('an empty result is "[]\\n"', () => {
    const body = request(
      '/api/v0/en/calendars/us/search?startDate=2026-01-01&endDate=2026-01-01&q=zzzzz',
    ).body;
    expect(body).toBe('[]\n');
  });

  it('a month listing separates items with ",\\n  "', () => {
    const body = request('/api/v0/en/calendars/us/2026/2').body;
    expect(body.startsWith('[\n  {')).toBe(true);
    expect(body).toContain('},\n  {');
    expect(body.endsWith('}\n]\n')).toBe(true);
    expect(len(body)).toBe(8851);
  });
});

describe('byte parity: shape 4 — Grape ERROR bodies are compact with NO trailing newline', () => {
  it('a validation error', () => {
    const body = request('/api/v0/en/calendars/us/2026/9/0').body;
    expect(body).toBe('{"error":"day does not have a valid value"}');
    expect(len(body)).toBe(43);
  });

  it('the 405', () => {
    const body = request('/api/v0/en/calendars/us/2026/9/18', { method: 'POST' }).body;
    expect(body).toBe('{"error":"405 Not Allowed"}');
    expect(len(body)).toBe(27);
  });

  it('the bare 404 has no JSON and no content-type', () => {
    const response = request('/api/unknown_route');
    expect(response.body).toBe('404 Not Found');
    expect(response.headers['content-type']).toBeUndefined();
  });

  it('a 301 body is a JSON-encoded string, no trailing newline', () => {
    const body = request('/api/v0/en/today').body;
    expect(body).toBe(
      '"This resource has been moved permanently to /api/v0/en/calendars/default/today."',
    );
    expect(len(body)).toBe(81);
  });
});

describe('byte parity: non-ASCII titles are emitted raw, not \\u-escaped', () => {
  it('U+2019 survives', () => {
    const body = request('/api/v0/en/calendars/us/2026/4/2').body;
    expect(body).toContain('Thursday of the Lord’s Supper');
    expect(body).not.toContain('\\u2019');
  });
});
