/**
 * The four adapters.
 *
 * The Node one is driven over a real ephemeral port with `node:http`; the other
 * three are driven with synthetic events, which is exactly what they receive in
 * real use (Lambda, a fetch runtime, Express).
 */

import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHandler } from '../../src/http/router.js';
import { createServer, toHttpRequest } from '../../src/http/adapters/node.js';
import { createExpressMiddleware } from '../../src/http/adapters/express.js';
import type { ExpressLikeRequest } from '../../src/http/adapters/express.js';
import { createLambdaHandler } from '../../src/http/adapters/lambda.js';
import type { LambdaEventV2 } from '../../src/http/adapters/lambda.js';
import { createFetchHandler } from '../../src/http/adapters/fetch.js';
import { isUnparseableQuery, parseQuery, splitTarget } from '../../src/http/adapters/common.js';

const handler = createHandler();
const DAY_URL = '/api/v0/en/calendars/us/2026/9/18';
const expected = handler({ method: 'GET', path: DAY_URL, query: {}, headers: {} });

// ---------------------------------------------------------------------------

describe('splitTarget / parseQuery', () => {
  it('splits path and query', () => {
    expect(splitTarget('/a/b?x=1&y=2')).toEqual({ path: '/a/b', query: { x: '1', y: '2' } });
  });

  it('percent-decodes each path segment', () => {
    expect(splitTarget('/api/v0/en/calendars/us%2Dascension').path).toBe(
      '/api/v0/en/calendars/us-ascension',
    );
  });

  it('survives a malformed escape', () => {
    expect(splitTarget('/a/%zz').path).toBe('/a/%zz');
  });

  it('keeps an encoded slash encoded, so it cannot split a segment', () => {
    expect(splitTarget('/api/v0/en/calendars/us%2F2026').path).toBe(
      '/api/v0/en/calendars/us%2F2026',
    );
  });

  it('decodes + and %XX in values', () => {
    expect(parseQuery('q=of+the&d=2026%2F9%2F18')).toEqual({ q: 'of the', d: '2026/9/18' });
  });

  it('parses like Rack 1.6: last value wins, `;` separates, brackets nest, no `=` is nil', () => {
    expect(parseQuery('q=a&q=b')).toEqual({ q: 'b' });
    expect(parseQuery('q[]=a&q[]=b')).toEqual({ q: ['a', 'b'] });
    expect(parseQuery('q[]=a&q=b')).toEqual({ q: 'b' });
    expect(parseQuery('q[x]=1')).toEqual({ q: { x: '1' } });
    expect(parseQuery('a=1;b=2&  c=3')).toEqual({ a: '1', b: '2', c: '3' });
    expect(parseQuery('date')).toEqual({ date: null });
    expect(parseQuery('[date]=1&x]=2')).toEqual({ date: '1', x: '2' });
  });

  it('flags a query Rack refuses to parse', () => {
    expect(isUnparseableQuery(parseQuery('q=%'))).toBe(true);
    expect(isUnparseableQuery(parseQuery('q=%2'))).toBe(true);
    expect(isUnparseableQuery(parseQuery('q=a&q[]=b'))).toBe(true);
    expect(isUnparseableQuery(parseQuery('d=1&d[x]=2'))).toBe(true);
    expect(isUnparseableQuery(parseQuery(`${'a'}${'[b]'.repeat(100)}=1`))).toBe(true);
    expect(isUnparseableQuery(parseQuery('q[]=a&q=b&x=%20'))).toBe(false);
  });

  it('a nested key cannot reach Object.prototype', () => {
    parseQuery('__proto__[polluted]=1&constructor[prototype][polluted]=1');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops the fragment', () => {
    expect(splitTarget('/a?x=1#frag').query).toEqual({ x: '1' });
  });
});

// ---------------------------------------------------------------------------

describe('node adapter (over a real ephemeral port)', () => {
  let server: ReturnType<typeof createServer>;
  let port = 0;
  const logged: string[] = [];

  beforeAll(async () => {
    server = createServer({ log: (line) => logged.push(line) });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function get(
    path: string,
    options: { method?: string; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: options.headers },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
          );
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  it('serves a day byte-identically', async () => {
    const response = await get(DAY_URL);
    expect(response.status).toBe(200);
    expect(response.body).toBe(expected.body);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('max-age=3600');
    expect(response.headers['content-length']).toBe(String(Buffer.byteLength(expected.body)));
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the calendar list and the web root', async () => {
    expect((await get('/api/v0/en/calendars')).status).toBe(200);
    const root = await get('/');
    expect(root.status).toBe(200);
    expect(root.headers['content-type']).toBe('text/html');
  });

  it('propagates query strings', async () => {
    const response = await get('/api/v0/en/calendars/us/search?date=2026-09-18');
    expect(JSON.parse(response.body)[0].date).toBe('2026-09-18');
  });

  it('propagates request headers', async () => {
    const response = await get('/api/v0/en/calendars/us/today', {
      headers: { Date: 'Sat, 01 Jan 2000 01:00:00 GMT' },
    });
    expect(JSON.parse(response.body).date).toBe('2000-01-01');
  });

  it('answers 301, 400, 404 and 405 like the handler', async () => {
    expect((await get('/api/v0/en/today')).status).toBe(301);
    expect((await get('/api/v0/en/calendars/us/2026/9/0')).status).toBe(400);
    expect((await get('/api/unknown_route')).status).toBe(404);
    expect((await get(DAY_URL, { method: 'POST' })).status).toBe(405);
  });

  it('a redirect to a non-ASCII path is percent-encoded instead of killing the process', async () => {
    const response = await get('/api/v0/en/%E2%82%AC');
    expect(response.status).toBe(301);
    expect(response.headers.location).toBe('/api/v0/en/calendars/default/%E2%82%AC');
    expect((await get('/api/v0/en/calendars')).status).toBe(200);
  });

  it('OPTIONS is a bodyless 204 with no content-length', async () => {
    const response = await get(DAY_URL, { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.allow).toBe('OPTIONS, GET, HEAD');
    expect(response.headers['content-length']).toBeUndefined();
    expect(response.body).toBe('');
  });

  it('HEAD returns headers with no body', async () => {
    const response = await get(DAY_URL, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.body).toBe('');
  });

  it('logs one line per request', async () => {
    const before = logged.length;
    await get('/api/v0/en/calendars');
    expect(logged.length).toBe(before + 1);
    expect(logged[logged.length - 1]).toContain('GET /api/v0/en/calendars 200');
  });

  it('toHttpRequest lower-cases header names', () => {
    const converted = toHttpRequest({
      method: 'GET',
      url: '/api/v0/en/calendars?a=1',
      headers: { Origin: 'https://x.test', 'X-Thing': ['a', 'b'] },
    } as never);
    expect(converted.headers.origin).toBe('https://x.test');
    expect(converted.headers['x-thing']).toBe('a, b');
    expect(converted.query).toEqual({ a: '1' });
  });
});

describe('node adapter: a response node:http refuses to send', () => {
  it('becomes a 502 instead of taking the process down', async () => {
    const server = createServer(
      () => ({ status: 200, headers: { 'x-bad': 'a\nb' }, body: 'x' }),
      { log: null },
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const status = (): Promise<number> =>
      new Promise((resolve, reject) => {
        httpRequest({ host: '127.0.0.1', port, path: '/' }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        })
          .on('error', reject)
          .end();
      });
    try {
      expect(await status()).toBe(502);
      expect(await status()).toBe(502); // the server is still up
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

// ---------------------------------------------------------------------------

describe('lambda adapter', () => {
  const lambda = createLambdaHandler();

  function event(rawPath: string, rawQueryString = '', headers: Record<string, string> = {}, method = 'GET'): LambdaEventV2 {
    return {
      version: '2.0',
      rawPath,
      rawQueryString,
      headers,
      requestContext: { http: { method, path: rawPath }, stage: '$default' },
    };
  }

  it('serves a day', () => {
    const result = lambda(event(DAY_URL));
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe(expected.body);
    expect(result.isBase64Encoded).toBe(false);
    expect(result.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('parses rawQueryString', () => {
    const result = lambda(event('/api/v0/en/calendars/us/search', 'date=2026-09-18'));
    expect(JSON.parse(result.body)[0].date).toBe('2026-09-18');
  });

  it('falls back to queryStringParameters', () => {
    const result = lambda({
      ...event('/api/v0/en/calendars/us/search'),
      queryStringParameters: { date: '2026-09-18' },
    });
    expect(JSON.parse(result.body)[0].date).toBe('2026-09-18');
  });

  it('passes headers through', () => {
    const result = lambda(event('/api/v0/en/calendars/us/today', '', { date: 'Sat, 01 Jan 2000 01:00:00 GMT' }));
    expect(JSON.parse(result.body).date).toBe('2000-01-01');
  });

  it('honours the method', () => {
    expect(lambda(event(DAY_URL, '', {}, 'POST')).statusCode).toBe(405);
  });

  it('can strip an API Gateway stage', () => {
    const staged = createLambdaHandler({ stripStage: true });
    const result = staged({
      version: '2.0',
      rawPath: `/prod${DAY_URL}`,
      rawQueryString: '',
      headers: {},
      requestContext: { http: { method: 'GET', path: `/prod${DAY_URL}` }, stage: 'prod' },
    });
    expect(result.statusCode).toBe(200);
  });

  it('a redirect keeps its Location header', () => {
    const result = lambda(event('/api/v0/en/today'));
    expect(result.statusCode).toBe(301);
    expect(result.headers.location).toBe('/api/v0/en/calendars/default/today');
  });
});

// ---------------------------------------------------------------------------

describe('fetch adapter', () => {
  const fetchHandler = createFetchHandler();

  it('serves a day', async () => {
    const response = fetchHandler(new Request(`https://calendar.test${DAY_URL}`));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(expected.body);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('max-age=3600');
  });

  it('parses the query string', async () => {
    const response = fetchHandler(
      new Request('https://calendar.test/api/v0/en/calendars/us/search?date=2026-09-18'),
    );
    expect(JSON.parse(await response.text())[0].date).toBe('2026-09-18');
  });

  it('passes headers through', async () => {
    const response = fetchHandler(
      new Request('https://calendar.test/api/v0/en/calendars/us/today', {
        headers: { Date: 'Sat, 01 Jan 2000 01:00:00 GMT' },
      }),
    );
    expect(JSON.parse(await response.text()).date).toBe('2000-01-01');
  });

  it('HEAD has no body', async () => {
    const response = fetchHandler(new Request(`https://calendar.test${DAY_URL}`, { method: 'HEAD' }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('OPTIONS is a 204, which a Response may not give a body', async () => {
    const response = fetchHandler(new Request(`https://calendar.test${DAY_URL}`, { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('allow')).toBe('OPTIONS, GET, HEAD');
    expect(await response.text()).toBe('');
  });

  it('keeps an encoded slash inside its segment', async () => {
    const response = fetchHandler(new Request('https://calendar.test/api/v0/en/calendars/us%2F2026'));
    expect(response.status).toBe(400);
    expect(JSON.parse(await response.text()).error).toBe('calendar does not have a valid value');
  });

  it('CORS headers survive', () => {
    const response = fetchHandler(
      new Request(`https://calendar.test${DAY_URL}`, {
        headers: { Origin: 'https://example.com' },
      }),
    );
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('the swagger docs_url uses the request host', async () => {
    const response = fetchHandler(new Request('https://calendar.test/swagger.yml'));
    expect(await response.text()).toContain('url: https://calendar.test/api-doc');
  });
});

// ---------------------------------------------------------------------------

describe('express adapter', () => {
  const middleware = createExpressMiddleware();

  function run(
    req: ExpressLikeRequest,
    mw = middleware,
  ): { status: number; headers: Record<string, string>; body: string; nextCalled: unknown } {
    let status = 0;
    let headers: Record<string, string> = {};
    let body = '';
    let nextCalled: unknown = null;
    mw(
      req,
      {
        writeHead(s, h) {
          status = s;
          headers = h;
          return undefined;
        },
        end(b) {
          body = b ?? '';
          return undefined;
        },
      },
      (error) => {
        nextCalled = error ?? true;
      },
    );
    return { status, headers, body, nextCalled };
  }

  it('serves a day', () => {
    const result = run({ method: 'GET', url: DAY_URL, headers: {} });
    expect(result.status).toBe(200);
    expect(result.body).toBe(expected.body);
    expect(result.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(result.headers['content-length']).toBe(String(Buffer.byteLength(expected.body)));
  });

  it('prefers originalUrl and strips baseUrl when mounted', () => {
    const result = run({
      method: 'GET',
      originalUrl: `/calendar${DAY_URL}`,
      baseUrl: '/calendar',
      headers: {},
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe(expected.body);
  });

  it('honours an explicit basePath', () => {
    const mounted = createExpressMiddleware({ basePath: '/cal' });
    const result = run({ method: 'GET', originalUrl: `/cal${DAY_URL}`, headers: {} }, mounted);
    expect(result.status).toBe(200);
  });

  it('passes headers and query through', () => {
    const result = run({
      method: 'GET',
      url: '/api/v0/en/calendars/us/today',
      headers: { date: 'Sat, 01 Jan 2000 01:00:00 GMT' },
    });
    expect(JSON.parse(result.body).date).toBe('2000-01-01');
  });

  it('answers 404 itself by default', () => {
    const result = run({ method: 'GET', url: '/nope', headers: {} });
    expect(result.status).toBe(404);
    expect(result.nextCalled).toBeNull();
  });

  it('passThroughOnNotFound calls next() instead', () => {
    const passthrough = createExpressMiddleware({ passThroughOnNotFound: true });
    const result = run({ method: 'GET', url: '/nope', headers: {} }, passthrough);
    expect(result.nextCalled).toBe(true);
    expect(result.status).toBe(0);
  });
});
