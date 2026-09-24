/**
 * Router edge cases.
 *
 * Every expectation here was produced by driving the real 2.7.0 stack
 * (`Rack::Builder.parse_file('config.ru')` + rack-test) inside
 * `sourceandsummit/church-calendar-api:2.7.0` on 2026-09-18 — not guessed.
 */

import { makeHandler, request } from '../helpers/handler.js';

const body = (url: string, opts = {}): string => request(url, opts).body;
const status = (url: string, opts = {}): number => request(url, opts).status;
const error = (url: string, opts = {}): string =>
  (JSON.parse(request(url, opts).body) as { error: string }).error;

describe('routing', () => {
  it('tolerates a trailing slash', () => {
    expect(status('/api/v0/en/calendars/us/2026/9/18/')).toBe(200);
    expect(status('/api/v0/en/calendars/us/today/')).toBe(200);
    expect(status('/api/v0/en/calendars/')).toBe(200);
  });

  it('ignores unknown query parameters', () => {
    expect(body('/api/v0/en/calendars/us/2026/9/18?foo=bar')).toBe(
      body('/api/v0/en/calendars/us/2026/9/18'),
    );
  });

  it('accepts zero-padded month and day', () => {
    expect(body('/api/v0/en/calendars/us/2026/09/18')).toBe(
      body('/api/v0/en/calendars/us/2026/9/18'),
    );
  });

  it('an unknown API version is a bare 404', () => {
    for (const url of ['/api/v1/en/calendars', '/api', '/api/', '/api/unknown_route']) {
      const response = request(url);
      expect([url, response.status, response.body]).toEqual([url, 404, '404 Not Found']);
      expect(response.headers['content-type']).toBeUndefined();
    }
  });

  it('too many segments is a bare 404', () => {
    expect(status('/api/v0/en/calendars/us/2026/9/18/extra')).toBe(404);
    expect(status('/api/v0/en/foo/bar/baz/qux')).toBe(404);
  });

  it('1-3 unknown segments after the lang redirect to the default calendar', () => {
    for (const [path, target] of [
      ['foo', '/api/v0/en/calendars/default/foo'],
      ['foo/bar', '/api/v0/en/calendars/default/foo/bar'],
      ['foo/bar/baz', '/api/v0/en/calendars/default/foo/bar/baz'],
      ['2026/13', '/api/v0/en/calendars/default/2026/13'],
    ] as const) {
      const response = request(`/api/v0/en/${path}`);
      expect([path, response.status, response.headers.location]).toEqual([path, 301, target]);
    }
  });

  it('a redirect keeps its content-type and cache-control', () => {
    const response = request('/api/v0/en/today?x=1');
    expect(response.status).toBe(301);
    expect(response.headers['content-type']).toBe('text/plain');
    expect(response.headers['cache-control']).toBe('max-age=3600');
    expect(response.headers.location).toBe('/api/v0/en/calendars/default/today');
  });

  it('absoluteRedirects builds the Location from the request headers', () => {
    const handler = makeHandler({ absoluteRedirects: true });
    const response = request(
      '/api/v0/en/today',
      { headers: { Host: 'calendar.example.com', 'X-Forwarded-Proto': 'https' } },
      handler,
    );
    expect(response.headers.location).toBe(
      'https://calendar.example.com/api/v0/en/calendars/default/today',
    );
    // The BODY still carries the path only, exactly like Grape.
    expect(response.body).toBe(
      '"This resource has been moved permanently to /api/v0/en/calendars/default/today."',
    );
  });

  it('the wrong method on a valid route is 405 with a JSON body', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const response = request('/api/v0/en/calendars/us/2026/9/18', { method });
      expect([method, response.status, response.body]).toEqual([
        method,
        405,
        '{"error":"405 Not Allowed"}',
      ]);
      expect(response.headers.allow).toBe('OPTIONS, GET, HEAD');
    }
    expect(status('/api/v0/en/calendars', { method: 'PUT' })).toBe(405);
  });

  it('HEAD is routed as GET with the body dropped', () => {
    const head = request('/api/v0/en/calendars/us/2026/9/18', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('the redirects validate lang first (they sit inside `segment "/:lang"`)', () => {
    expect(status('/api/v0/xx/today')).toBe(400);
    expect(error('/api/v0/xx/today')).toBe('lang does not have a valid value');
    expect(error('/api/v0/xx/2026/9/18')).toBe('lang does not have a valid value');
    expect(status('/api/v0/xx/today', { method: 'POST' })).toBe(405);
  });

  it('the last segment takes an optional `.<format>`, and a dot anywhere else matches nothing', () => {
    expect(body('/api/v0/en/calendars.json')).toBe(body('/api/v0/en/calendars'));
    expect(body('/api/v0/en/calendars.xml')).toBe(body('/api/v0/en/calendars'));
    expect(body('/api/v0/en/calendars/us/2026/9/18.json')).toBe(
      body('/api/v0/en/calendars/us/2026/9/18'),
    );
    expect(body('/api/v0/en/calendars/us/2026.5')).toBe(body('/api/v0/en/calendars/us/2026'));
    expect(request('/api/v0/en/today.json').headers.location).toBe(
      '/api/v0/en/calendars/default/today',
    );
    for (const url of [
      '/api/v0/en/calendars/us/2026/9.0/18',
      '/api/v0/en/calendars/us/2026.5.json',
      '/api/v0/en/calendars/us.ascension/2026',
    ]) {
      expect([url, status(url)]).toEqual([url, 404]);
    }
  });

  it('repeated slashes are squeezed, but `//v0` fails the path versioner', () => {
    expect(status('/api/v0//en/calendars')).toBe(200);
    const response = request('/api//v0/en/calendars');
    expect(response.status).toBe(404);
    expect(response.body).toBe('{"error":"404 API Version Not Found"}');
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('an encoded slash stays inside its segment', () => {
    expect(error('/api/v0/en/calendars/us%2F2026')).toBe('calendar does not have a valid value');
  });

  it('a non-ASCII redirect target is percent-encoded in Location only', () => {
    const response = request('/api/v0/en/%E2%82%AC');
    expect(response.headers.location).toBe('/api/v0/en/calendars/default/%E2%82%AC');
    expect(response.body).toBe(
      '"This resource has been moved permanently to /api/v0/en/calendars/default/€."',
    );
  });

  it('a year too large for exact day arithmetic fails at once instead of looping (Q36)', () => {
    expect(status('/api/v0/en/calendars/us/30000000000000')).toBe(502);
    expect(status('/api/v0/en/calendars/us/30000000000000/1')).toBe(502);
    expect(error('/api/v0/en/calendars/us/30000000000000/1/1')).toBe(
      'day does not have a valid value',
    );
    expect(error('/api/v0/en/calendars/us/search?date=30000000000000-01-01')).toBe(
      'date does not have a valid value',
    );
    expect(status('/api/v0/en/calendars/us/10000000000000')).toBe(200);
  });
});

describe('Grape validation messages', () => {
  it('lang', () => {
    expect(error('/api/v0/xx/calendars')).toBe('lang does not have a valid value');
    expect(error('/api/v0/es/calendars')).toBe('lang does not have a valid value');
    expect(error('/api/v0/EN/calendars')).toBe('lang does not have a valid value');
  });

  it('calendar', () => {
    expect(error('/api/v0/en/calendars/nope')).toBe('calendar does not have a valid value');
    expect(error('/api/v0/en/calendars/nope/today')).toBe('calendar does not have a valid value');
  });

  it('year — the four combinations of coercion / regexp / range', () => {
    expect(error('/api/v0/en/calendars/us/abc')).toBe(
      'year is invalid, year must be numeric, year invalid, ' +
        'the calendar has been effective only since 1970',
    );
    expect(error('/api/v0/en/calendars/us/0')).toBe(
      'year must be numeric, year invalid, the calendar has been effective only since 1970',
    );
    expect(error('/api/v0/en/calendars/us/1969')).toBe(
      'year invalid, the calendar has been effective only since 1970',
    );
    expect(status('/api/v0/en/calendars/us/12345')).toBe(200);
  });

  it('a zero-padded year fails the regexp on its COERCED form', () => {
    // "0970" coerces to 970, whose `to_s` is three digits.
    expect(error('/api/v0/en/calendars/us/0970')).toBe(
      'year must be numeric, year invalid, the calendar has been effective only since 1970',
    );
  });

  it('coercion is Coercible\'s: `+2026` and `2e3` are integers, ` 2026` is not', () => {
    expect(body('/api/v0/en/calendars/us/+2026')).toBe(body('/api/v0/en/calendars/us/2026'));
    expect(body('/api/v0/en/calendars/us/2026/+9/18')).toBe(
      body('/api/v0/en/calendars/us/2026/9/18'),
    );
    expect((JSON.parse(body('/api/v0/en/calendars/us/2e3/1/1')) as { date: string }).date).toBe(
      '2000-01-01',
    );
    for (const url of ['/api/v0/en/calendars/us/%202026', '/api/v0/en/calendars/us/1e400']) {
      expect([url, error(url)]).toEqual([
        url,
        'year is invalid, year must be numeric, year invalid, ' +
          'the calendar has been effective only since 1970',
      ]);
    }
    expect(error('/api/v0/en/calendars/us/2026/9/18%20')).toBe(
      'day is invalid, day does not have a valid value',
    );
    expect(error('/api/v0/en/calendars/us/2026/0x9/1')).toBe(
      'month is invalid, month does not have a valid value',
    );
  });

  it('month and day', () => {
    expect(error('/api/v0/en/calendars/us/2026/0')).toBe('month does not have a valid value');
    expect(error('/api/v0/en/calendars/us/2026/13')).toBe('month does not have a valid value');
    expect(error('/api/v0/en/calendars/us/2026/xx')).toBe(
      'month is invalid, month does not have a valid value',
    );
    expect(error('/api/v0/en/calendars/us/2026/9/0')).toBe('day does not have a valid value');
    expect(error('/api/v0/en/calendars/us/2026/9/32')).toBe('day does not have a valid value');
    expect(error('/api/v0/en/calendars/us/2026/9/xx')).toBe(
      'day is invalid, day does not have a valid value',
    );
  });

  it('a valid-looking but non-existent date is a day error', () => {
    for (const url of [
      '/api/v0/en/calendars/us/2015/2/29',
      '/api/v0/en/calendars/us/2015/2/30',
      '/api/v0/en/calendars/us/2015/4/31',
      '/api/v0/en/calendars/us/2026/9/31',
      '/api/v0/en/calendars/us/2026/2/30',
    ]) {
      expect([url, error(url)]).toEqual([url, 'day does not have a valid value']);
    }
    expect(status('/api/v0/en/calendars/us/2016/2/29')).toBe(200);
  });

  it('messages from several params are concatenated in declaration order', () => {
    expect(error('/api/v0/en/calendars/nope/abc')).toBe(
      'calendar does not have a valid value, year is invalid, year must be numeric, ' +
        'year invalid, the calendar has been effective only since 1970',
    );
    expect(error('/api/v0/xx/calendars/nope')).toBe(
      'lang does not have a valid value, calendar does not have a valid value',
    );
    expect(error('/api/v0/en/calendars/us/search/x')).toBe(
      'year is invalid, year must be numeric, year invalid, ' +
        'the calendar has been effective only since 1970, ' +
        'month is invalid, month does not have a valid value',
    );
  });
});

describe('the Date header', () => {
  const H = (value: string) => ({ headers: { Date: value } });

  it('is honoured by yesterday / today / tomorrow', () => {
    expect(
      JSON.parse(body('/api/v0/en/calendars/us/today', H('Sat, 01 Jan 2000 01:00:00 GMT'))).date,
    ).toBe('2000-01-01');
  });

  it('accepts a bare ISO date too (it is plain Date.parse)', () => {
    expect(JSON.parse(body('/api/v0/en/calendars/us/today', H('2026-09-18'))).date).toBe(
      '2026-09-18',
    );
  });

  it('a PRESENT but blank header is an error, not "today"', () => {
    // ruby: `if date` — "" is truthy, so Date.parse("") raises.
    expect(status('/api/v0/en/calendars/us/today', H(''))).toBe(400);
    expect(error('/api/v0/en/calendars/us/today', H(''))).toBe(
      'invalid content of HTTP header Date',
    );
  });

  it('junk is 400', () => {
    expect(error('/api/v0/en/calendars/us/today', H('not-a-date'))).toBe(
      'invalid content of HTTP header Date',
    );
  });

  it('an absent header falls back to the server clock', () => {
    expect(status('/api/v0/en/calendars/us/today')).toBe(200);
  });
});

describe('search parameters', () => {
  it('an empty `date=` is an error, because "" is truthy in Ruby', () => {
    expect(error('/api/v0/en/calendars/us/search?date=')).toBe('date does not have a valid value');
  });

  it('an empty `startDate=` is an error too, and it wins over endDate', () => {
    expect(error('/api/v0/en/calendars/us/search?q=&startDate=&endDate=')).toBe(
      'startDate does not have a valid value',
    );
  });

  it('startDate alone defaults endDate to +365', () => {
    const days = JSON.parse(body('/api/v0/en/calendars/us/search?startDate=2026-01-01'));
    expect(days.length).toBe(366);
  });

  it('endDate without startDate', () => {
    expect(error('/api/v0/en/calendars/us/search?endDate=2026-01-05')).toBe(
      'endDate cannot be given without startDate',
    );
  });

  it('endDate before startDate', () => {
    expect(
      error('/api/v0/en/calendars/us/search?startDate=2026-06-01&endDate=2026-01-01'),
    ).toBe('endDate cannot precede start date');
  });

  it('a bad startDate is reported before a bad endDate', () => {
    expect(error('/api/v0/en/calendars/us/search?startDate=garbage&endDate=2026-01-05')).toBe(
      'startDate does not have a valid value',
    );
    expect(error('/api/v0/en/calendars/us/search?startDate=2026-01-05&endDate=garbage')).toBe(
      'endDate does not have a valid value',
    );
  });

  it('`date` wins over `q`', () => {
    const days = JSON.parse(body('/api/v0/en/calendars/us/search?date=2026-09-18&q=advent'));
    expect(days.length).toBe(1);
    expect(days[0].date).toBe('2026-09-18');
  });

  it('search always answers with an ARRAY, even for a single date', () => {
    expect(body('/api/v0/en/calendars/us/search?date=2026-09-18').startsWith('[')).toBe(true);
  });

  it('an array-valued parameter is a 502, like the Ruby NoMethodError', () => {
    expect(
      status('/api/v0/en/calendars/us/search?q[]=advent&startDate=2026-01-01&endDate=2026-12-31'),
    ).toBe(502);
  });

  it('the query is parsed like Rack 1.6 (Q23)', () => {
    const search = '/api/v0/en/calendars/us/search';
    // the last of a repeated key wins, `;` separates too, a key without `=` is nil
    expect(body(`${search}?date=2026-01-01&date=2026-01-02`)).toBe(body(`${search}?date=2026-01-02`));
    expect(body(`${search}?startDate=2026-01-01;endDate=2026-01-02`)).toBe(
      body(`${search}?startDate=2026-01-01&endDate=2026-01-02`),
    );
    expect(body(`${search}?startDate=2026-01-01&endDate`)).toBe(body(`${search}?startDate=2026-01-01`));
    expect(status(`${search}?date`)).toBe(200);
    // a Hash is as fatal as an Array
    expect(status(`${search}?q[x]=1&startDate=2026-01-01&endDate=2026-01-01`)).toBe(502);
  });

  it('a query Rack cannot parse is a 502 on every matched API route, and nowhere else', () => {
    expect(status('/api/v0/en/calendars?x=%')).toBe(502);
    expect(status('/api/v0/en/calendars?x=1&x[]=2')).toBe(502);
    expect(status('/api/v0/en/today?x=%')).toBe(502);
    expect(status('/api/v0/en/calendars?x=%', { method: 'OPTIONS' })).toBe(502);
    expect(status('/api/v0/en/calendars/us/a/b/c/d/e?x=%')).toBe(404);
    expect(status('/about?x=%')).toBe(200);
  });
});

describe('failures that escape the Ruby app become 502', () => {
  it('the two calendars whose data cannot be loaded', () => {
    for (const cal of ['general-fr', 'general-es']) {
      expect([cal, status(`/api/v0/en/calendars/${cal}/2026/1/1`)]).toEqual([cal, 502]);
      expect([cal, status(`/api/v0/en/calendars/${cal}`)]).toEqual([cal, 502]);
    }
  });

  it('but they are still listed by GET /calendars', () => {
    expect(JSON.parse(body('/api/v0/en/calendars'))).toContain('general-fr');
  });

  it('a search that reaches before 1970 raises a RangeError in the library', () => {
    expect(status('/api/v0/en/calendars/us/search?startDate=1969-01-01&endDate=1969-01-02')).toBe(
      502,
    );
  });

  it('1970 itself is served', () => {
    expect(status('/api/v0/en/calendars/us/1970/1/1')).toBe(200);
  });
});

describe('CORS', () => {
  const ORIGIN = { headers: { Origin: 'https://example.com' } };

  it('adds vary: Origin to /api/* even without an Origin', () => {
    const response = request('/api/v0/en/calendars');
    expect(response.headers.vary).toBe('Origin');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('adds the allow headers only when Origin is present', () => {
    const response = request('/api/v0/en/calendars', ORIGIN);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-methods']).toBe('GET');
    expect(response.headers['access-control-max-age']).toBe('1728000');
  });

  it('covers /swagger.yml but no other web route', () => {
    expect(request('/swagger.yml', ORIGIN).headers['access-control-allow-origin']).toBe('*');
    expect(request('/', ORIGIN).headers['access-control-allow-origin']).toBeUndefined();
    expect(request('/style.css', ORIGIN).headers['access-control-allow-origin']).toBeUndefined();
    expect(request('/', ORIGIN).headers.vary).toBeUndefined();
  });

  it('the preflight is 200 text/plain, empty, and WITHOUT cache-control', () => {
    const response = request('/api/v0/en/calendars/us/2026/9/18', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/plain');
    expect(response.headers['content-length']).toBe('0');
    expect(response.body).toBe('');
    expect(response.headers['cache-control']).toBeUndefined();
    expect(response.headers.vary).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('the preflight echoes Access-Control-Request-Headers (rack-cors `headers: :any`)', () => {
    const response = request('/api/v0/en/calendars', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://client.example',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'x-requested-with, content-type',
      },
    });
    expect(response.headers['access-control-allow-headers']).toBe('x-requested-with, content-type');
  });

  it('a preflight for any method but GET gets text/plain and no allow headers', () => {
    const preflight = (requestMethod: string) =>
      request('/api/v0/en/calendars', {
        method: 'OPTIONS',
        headers: { Origin: 'https://client.example', 'Access-Control-Request-Method': requestMethod },
      });
    const denied = preflight('POST');
    expect(denied.status).toBe(200);
    expect(denied.headers['content-type']).toBe('text/plain');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(denied.headers['access-control-allow-methods']).toBeUndefined();
    expect(denied.headers['cache-control']).toBeUndefined();
    expect(preflight('get').headers['access-control-allow-origin']).toBe('*');
  });

  it('OPTIONS without the preflight request-method header is Grape\'s own 204', () => {
    const response = request('/api/v0/en/calendars/us/2026/9/18', {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.com' },
    });
    expect(response.status).toBe(204);
    expect(response.body).toBe('');
    expect(response.headers.allow).toBe('OPTIONS, GET, HEAD');
    expect(response.headers['content-type']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('max-age=3600');
    expect(response.headers.vary).toBe('Origin');
    expect(response.headers['access-control-allow-origin']).toBe('*');
    // Grape's generated OPTIONS runs no validation and covers the redirects too.
    expect(status('/api/v0/xx/calendars/nope', { method: 'OPTIONS' })).toBe(204);
    expect(status('/api/v0/en/today', { method: 'OPTIONS' })).toBe(204);
  });

  it('CORS is applied to error responses too', () => {
    const response = request('/api/v0/en/calendars/us/2026/9/0', ORIGIN);
    expect(response.status).toBe(400);
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('Cache-Control is unconditional (Rack::ResponseHeaders)', () => {
  it('on 200s, 301s, 400s, 404s and HTML', () => {
    for (const url of [
      '/api/v0/en/calendars/us/2026/9/18',
      '/api/v0/en/today',
      '/api/v0/en/calendars/us/2026/9/0',
      '/api/unknown_route',
      '/',
      '/about',
      '/style.css',
      '/browse',
    ]) {
      expect([url, request(url).headers['cache-control']]).toEqual([url, 'max-age=3600']);
    }
  });
});

describe('the Roda web UI', () => {
  it('/', () => {
    const response = request('/');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/html');
    expect(response.body).toContain('Liturgical Calendar API');
    expect(response.body).toContain("href='/browse'");
  });

  it('r.root is GET-only', () => {
    expect(status('/', { method: 'POST' })).toBe(404);
  });

  it('/browse redirects to /browse/default', () => {
    const response = request('/browse');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/browse/default');
    expect(response.body).toBe('');
    // ruby: `r.on 'browse'` is not method-constrained.
    expect(request('/browse', { method: 'POST' }).status).toBe(302);
  });

  it('/browse/:cal lists years and the calendar picker', () => {
    const response = request('/browse/us');
    expect(response.status).toBe(200);
    expect(response.body).toContain('US Calendar');
    expect(response.body).toContain("href='/browse/us/2026/9'");
    expect(response.body).toContain("href='/browse/czech'");
  });

  it('/browse/<unknown> is a bodyless 404', () => {
    const response = request('/browse/unknown');
    expect(response.status).toBe(404);
    expect(response.body).toBe('');
    expect(response.headers['content-type']).toBe('text/html');
  });

  it('/browse/:cal/:year redirects to month 1', () => {
    const response = request('/browse/us/2026');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/browse/us/2026/1');
  });

  it('/browse/:cal/:year/:month renders a table', () => {
    const response = request('/browse/us/2026/9');
    expect(response.status).toBe(200);
    expect(response.body).toContain('2026 / 9');
    expect(response.body).toContain('Friday of the 24th Week in Ordinary Time');
  });

  it('/browse localizes with the CALENDAR language, not the API lang', () => {
    // Sunday and ferial titles are fixed when the day is computed, so the days
    // must be computed in the calendar's locale, not just rendered in it.
    const page = request('/browse/general-la/2026/1').body;
    expect(page).toContain('Feria tertia, hebdomada I per annum');
    expect(page).not.toContain('in Ordinary Time');
  });

  it('a year before 1970 or a bad month is a bodyless 400', () => {
    for (const url of ['/browse/us/1900/1', '/browse/us/2026/13', '/browse/us/2026/0', '/browse/us/0/1']) {
      const response = request(url);
      expect([url, response.status, response.body]).toEqual([url, 400, '']);
      expect(response.headers['content-type']).toBe('text/html');
    }
  });

  it('a non-numeric browse segment is a 404', () => {
    expect(status('/browse/us/abc')).toBe(404);
    expect(status('/browse/us/2026/9/1')).toBe(404);
  });

  it('/api-doc, /about, /style.css', () => {
    expect(request('/api-doc').status).toBe(200);
    expect(request('/api-doc').body).toContain('API Documentation');
    expect(request('/about').body).toContain('Example Joe');
    expect(request('/style.css').headers['content-type']).toBe('text/css');
  });

  it('r.public serves /style.css to GET only, and nothing below it', () => {
    expect(status('/style.css/')).toBe(200);
    expect(status('/style.css/foo')).toBe(404);
    expect(status('/style.css', { method: 'POST' })).toBe(404);
    expect(status('/style.css', { method: 'HEAD' })).toBe(404);
  });

  it('/swagger.yml is served as text/html (Q22)', () => {
    const response = request('/swagger.yml');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/html');
    expect(response.body.startsWith("---\nswagger: '2.0'")).toBe(true);
    expect(response.body).toContain('enum: [cs, en, fr, it, la]');
    expect(response.body).toContain('enum: [general-en, general-la,');
  });

  it('Roda is STRICT about a trailing slash, unlike Grape', () => {
    for (const url of ['/browse/', '/browse/us/', '/about/', '/api-doc/', '/browse/us/2026/', '/browse/us/2026/9/']) {
      expect([url, status(url)]).toEqual([url, 404]);
    }
    // ...but r.public matches by prefix, so /style.css/ still serves the CSS.
    expect(status('/style.css/')).toBe(200);
    // ...and Grape tolerates it throughout.
    expect(status('/api/v0/en/calendars/us/search/')).toBe(200);
  });

  it('an unknown web path is a bodyless 404', () => {
    for (const url of ['/nope', '/api-doc/x']) {
      const response = request(url);
      expect([url, response.status, response.body]).toEqual([url, 404, '']);
    }
  });
});
