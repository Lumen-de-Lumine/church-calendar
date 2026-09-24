// ruby: config.ru (Rack::Cors + Rack::ResponseHeaders + Rack::URLMap),
//       apps/api/v0/controllers/api_v0.rb (Grape) and
//       apps/web/controllers/web.rb (Roda).
//
// One synchronous function reproduces the whole Rack stack. Reading order:
//
//   createHandler -> handle            the Rack::URLMap + the two middlewares
//                 -> handleApi         Grape: routing, validation, endpoints
//                 -> handleWeb         Roda
//
// Everything surprising is either commented here or numbered in docs/QUIRKS.md.

import { CalDate } from '../core/cal-date.js';
import { i18n } from '../core/i18n.js';
import type { Locale } from '../core/i18n.js';
import { CalendarRepository, calendars as defaultRepository } from '../api/calendar-repository.js';
import type { CalendarFacade } from '../api/calendar-facade.js';
import { parseDateHeader, parseDateParam } from '../api/dates.js';
import {
  CALENDAR_START,
  serializeCalendarDescription,
  serializeDay,
  serializeDays,
} from '../api/entities.js';
import type { SerializedLectionaryYear } from '../api/entities.js';
import { ApiError, DateParseError, UnknownCalendarError } from '../api/errors.js';
import {
  formatEntity,
  formatEntityArray,
  formatError,
  formatPlain,
  formatString,
} from './json.js';
import { isUnparseableQuery } from './adapters/common.js';
import { renderSwaggerYml } from './swagger.js';
import {
  LANGS,
  PARAMETERS,
  STYLE_CSS,
  aboutView,
  apiDocView,
  browseView,
  indexView,
  monthView,
} from './web.js';
import type { Handler, HandlerOptions, HttpRequest, HttpResponse } from './types.js';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const CACHE_CONTROL = 'max-age=3600';

/** ruby: `rack-cors` — `resource '/api/*'` and `resource '/swagger.yml'`. */
function corsCovered(path: string): boolean {
  return path.startsWith('/api/') || path === '/swagger.yml';
}

// ---------------------------------------------------------------------------
// small response builders
// ---------------------------------------------------------------------------

function json(status: number, body: string): HttpResponse {
  return { status, headers: { 'content-type': JSON_CONTENT_TYPE }, body };
}

function html(status: number, body: string): HttpResponse {
  return { status, headers: { 'content-type': 'text/html' }, body };
}

/** ruby: Grape's default JSON error formatter — compact, no trailing newline. */
function apiError(status: number, message: string): HttpResponse {
  return json(status, formatError(message));
}

/**
 * ruby: Grape's 404 — a bare `404 Not Found` with NO content-type and no JSON
 * (docs/BASELINE.md defect F).
 */
function notFoundBare(): HttpResponse {
  return { status: 404, headers: {}, body: '404 Not Found' };
}

/**
 * ruby: the handlers Grape generates for every route — `OPTIONS` answers 204 with
 * `Allow` and no body, any other method 405, which carries the same `Allow`.
 */
function notGet(method: string): HttpResponse {
  const allow = 'OPTIONS, GET, HEAD';
  if (method === 'OPTIONS') return { status: 204, headers: { allow }, body: '' };
  const response = apiError(405, '405 Not Allowed');
  response.headers.allow = allow;
  return response;
}

/**
 * Percent-encodes, as UTF-8, what cannot travel in a header value: controls, DEL
 * and anything beyond ASCII. A redirect path is built from DECODED segments, so
 * `/api/v0/en/%E2%82%AC` would otherwise put a raw `€` in `location`, which
 * `node:http` refuses to send. (Ruby sends the raw UTF-8 bytes; a client follows
 * either form to the same place.)
 */
function headerSafe(value: string): string {
  return value.replace(/[^\x20-\x7e]+/g, (run) =>
    Array.from(new TextEncoder().encode(run), (byte) =>
      `%${byte.toString(16).toUpperCase().padStart(2, '0')}`,
    ).join(''),
  );
}

/**
 * ruby: Grape appends `(.:format)` to every route, and Mustermann's grape captures
 * are `[^/?#.]+`. So only the LAST segment may hold a dot, as `<value>.<format>`
 * (any format: `/calendars.json`, `/2026.5` is year 2026), and a dot anywhere else
 * matches no route. `null` for no route.
 */
function stripFormat(segments: string[]): string[] | null {
  const last = segments.length - 1;
  if (segments.slice(0, last).some((s) => s.includes('.'))) return null;
  if (last < 0 || !segments[last].includes('.')) return segments;
  const m = /^([^.]+)\.[^.]+$/.exec(segments[last]);
  return m === null ? null : [...segments.slice(0, last), m[1]];
}

// ---------------------------------------------------------------------------
// Grape parameter validation
// ---------------------------------------------------------------------------

/**
 * ruby: Grape's `type: Integer` coercion — Virtus calls Coercible 1.0's
 * `String#to_integer`: an integer literal is `to_i`, anything else matching
 * `NUMERIC_REGEXP` is `to_f.to_i` (`+2026` and `2e3` are fine; ` 2026` is not),
 * and an infinite float raises, which Grape reports as "is invalid".
 */
function coerceInteger(raw: string): number | null {
  if (/^[-+]?[0-9]\d*$/.test(raw)) return Number(raw);
  if (!/^(?:[-+]?[0-9]\d*(?:\.\d+)?(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)$/.test(raw)) {
    return null;
  }
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) ? n : null;
}

/**
 * ruby: the `params do ... end` blocks of api_v0.rb, in declaration order.
 *
 * Grape runs EVERY declared validator of EVERY declared param and concatenates
 * the failures with `", "` into one `error` string, so a request can carry five
 * messages at once:
 *
 *     /api/v0/en/calendars/nope/abc
 *       -> "calendar does not have a valid value, year is invalid,
 *           year must be numeric, year invalid,
 *           the calendar has been effective only since 1970"
 *
 * Verified in-process against 2.7.0 (rack-test over config.ru) on 2026-09-18.
 */
interface ValidatedParams {
  lang?: string;
  calendar?: string;
  year?: number;
  month?: number;
  day?: number;
}

class Validator {
  private readonly messages: string[] = [];
  readonly values: ValidatedParams = {};

  /** `requires :lang, type: Symbol, values: LANGS` */
  lang(raw: string): void {
    if (LANGS.includes(raw)) this.values.lang = raw;
    else this.messages.push('lang does not have a valid value');
  }

  /** `requires :calendar, type: String, values: ->(v) { calendars.has_key?(v) }` */
  calendar(raw: string, repository: CalendarRepository): void {
    if (repository.has(raw)) this.values.calendar = raw;
    else this.messages.push('calendar does not have a valid value');
  }

  /**
   * ```ruby
   * requires :year, type: Integer,
   *          regexp: { value: /^\d{4,}$/, message: 'must be numeric' },
   *          values: { value: ->(v) { v >= CALENDAR_START },
   *                    message: "invalid, the calendar has been effective only since 1970" }
   * ```
   *
   * The regexp validator runs against `params[:year].to_s`, i.e. the COERCED
   * value — which is why `/us/0970` fails ("970" is three digits) and `/us/12345`
   * passes (there is no upper bound at all, BASELINE oddity 14).
   */
  year(raw: string): void {
    const coerced = coerceInteger(raw);
    if (coerced === null) this.messages.push('year is invalid');
    const forRegexp = coerced === null ? raw : String(coerced);
    if (!/^\d{4,}$/.test(forRegexp)) this.messages.push('year must be numeric');
    if (coerced === null || coerced < CALENDAR_START) {
      this.messages.push(
        `year invalid, the calendar has been effective only since ${CALENDAR_START}`,
      );
    } else {
      this.values.year = coerced;
    }
  }

  /** `requires :month, type: Integer, values: 1..12` */
  month(raw: string): void {
    const coerced = coerceInteger(raw);
    if (coerced === null) this.messages.push('month is invalid');
    if (coerced === null || coerced < 1 || coerced > 12) {
      this.messages.push('month does not have a valid value');
    } else {
      this.values.month = coerced;
    }
  }

  /** `requires :day, type: Integer, values: 1..31` */
  day(raw: string): void {
    const coerced = coerceInteger(raw);
    if (coerced === null) this.messages.push('day is invalid');
    if (coerced === null || coerced < 1 || coerced > 31) {
      this.messages.push('day does not have a valid value');
    } else {
      this.values.day = coerced;
    }
  }

  /** `null` when everything validated; otherwise the single concatenated 400. */
  failure(): HttpResponse | null {
    if (this.messages.length === 0) return null;
    return apiError(400, this.messages.join(', '));
  }
}

// ---------------------------------------------------------------------------
// the handler
// ---------------------------------------------------------------------------

export interface CreateHandlerOptions extends HandlerOptions {
  /** Defaults to the process-wide {@link CalendarRepository}. */
  repository?: CalendarRepository;
}

/**
 * Builds the request handler. The result is synchronous — nothing in the stack
 * does I/O — but it is safe to `await`, so the async adapters need no branch.
 */
export function createHandler(options: CreateHandlerOptions = {}): Handler {
  const repository = options.repository ?? defaultRepository;
  const absoluteRedirects = options.absoluteRedirects ?? false;

  function origin(request: HttpRequest): string {
    const proto =
      request.headers['x-forwarded-proto']?.split(',')[0].trim() ||
      options.defaultScheme ||
      'http';
    const host =
      request.headers['x-forwarded-host']?.split(',')[0].trim() ||
      request.headers.host ||
      options.defaultHost ||
      'localhost';
    return `${proto}://${host}`;
  }

  // -- Grape endpoints ------------------------------------------------------

  function calendarList(): HttpResponse {
    return json(200, formatPlain(repository.keys()));
  }

  function calendarDescription(facade: CalendarFacade): HttpResponse {
    return json(
      200,
      formatPlain(
        serializeCalendarDescription(facade.metadata.title, facade.metadata.language),
      ),
    );
  }

  /**
   * ruby: the `parse_date` helper. NOTE it is `if date` in Ruby, and an empty
   * string is TRUTHY there: `Date: ` (present but blank) is a 400, not "today".
   */
  function requestDate(request: HttpRequest): CalDate {
    const header = request.headers.date;
    if (header === undefined) return CalDate.today();
    try {
      return parseDateHeader(header);
    } catch (error) {
      if (error instanceof DateParseError) {
        throw new ApiError(400, 'invalid content of HTTP header Date');
      }
      throw error;
    }
  }

  /** ruby: `get 'search'`. */
  function search(facade: CalendarFacade, request: HttpRequest): HttpResponse {
    const raw = (name: string): string | undefined => {
      const value = request.query[name];
      // ruby: `if params[:x]` — a key without `=` is nil, i.e. absent.
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'string') {
        // ruby: `Date.parse` / `query.downcase` on an Array or a Hash raise
        // -> 502. Reproduced (docs/QUIRKS.md Q23).
        throw new TypeError(`undefined method \`downcase' for ${JSON.stringify(value)}`);
      }
      return value;
    };

    const parse = (name: string, value: string): CalDate => {
      try {
        return parseDateParam(value);
      } catch (error) {
        if (error instanceof DateParseError) {
          throw new ApiError(400, `${name} does not have a valid value`);
        }
        throw error;
      }
    };

    const rawDate = raw('date');
    const rawStart = raw('startDate');
    const rawEnd = raw('endDate');

    const date = rawDate === undefined ? null : parse('date', rawDate);
    const startDate = rawStart === undefined ? null : parse('startDate', rawStart);
    let endDate: CalDate | null = null;
    if (rawEnd !== undefined) {
      endDate = parse('endDate', rawEnd);
      if (rawStart === undefined) {
        throw new ApiError(400, 'endDate cannot be given without startDate');
      }
      if (startDate !== null && endDate.isBefore(startDate)) {
        throw new ApiError(400, 'endDate cannot precede start date');
      }
    }

    // ruby: `if date ... else @calendar.search_title params[:q], startDate, endDate`
    const days =
      date !== null ? [facade.day(date)] : facade.searchTitle(raw('q') ?? null, startDate, endDate);
    return json(200, formatEntityArray(serializeDays(days)));
  }

  /** ruby: `get do ... end` inside `segment '/:year'`. */
  function lectionaryYear(facade: CalendarFacade, year: number): HttpResponse {
    const calendar = facade.year(year);
    const body: SerializedLectionaryYear = {
      lectionary: calendar.lectionary(),
      ferial_lectionary: calendar.ferialLectionary(),
    };
    return json(200, formatPlain(body));
  }

  /** ruby: `get '/:day'` — the `Date.new` guard for 31 April and 29 February. */
  function singleDay(
    facade: CalendarFacade,
    year: number,
    month: number,
    day: number,
  ): HttpResponse {
    let date: CalDate;
    try {
      date = new CalDate(year, month, day);
    } catch {
      // ruby: "year and month is already validated, so the error is definitely
      // about day"
      throw new ApiError(400, 'day does not have a valid value');
    }
    return json(200, formatEntity(serializeDay(facade.day(date))));
  }

  /** ruby: `redirect build_path(...), permanent: true`. */
  function redirect(request: HttpRequest, path: string): HttpResponse {
    const location = absoluteRedirects ? `${origin(request)}${path}` : path;
    return {
      status: 301,
      headers: { 'content-type': 'text/plain', location: headerSafe(location) },
      body: formatString(`This resource has been moved permanently to ${path}.`),
    };
  }

  // -- Grape routing --------------------------------------------------------

  function handleApi(request: HttpRequest, method: string, path: string): HttpResponse {
    // `/api` is mounted by Rack::URLMap; Grape sees the rest, and its router
    // squeezes repeated slashes.
    const segments = stripFormat(path.split('/').filter((s) => s !== ''));
    if (segments === null || segments[0] !== 'v0' || segments.length < 2) return notFoundBare();

    const lang = segments[1];
    const rest = segments.slice(2);

    // Redirect routes: `/v0/:lang/(yesterday|today|tomorrow)` and the
    // unconstrained `/:year(/:month(/:day))`. Grape declares `resource :calendars`
    // first, so `calendars` never reaches them; anything else does, which is why
    // `/api/v0/en/foo` 301s to `/calendars/default/foo` (verified).
    const isRedirect = rest.length >= 1 && rest.length <= 3 && rest[0] !== 'calendars';
    const isCalendars = rest.length >= 1 && rest.length <= 5 && rest[0] === 'calendars';
    if (!isRedirect && !isCalendars) return notFoundBare();

    // ruby: the matched endpoint's path versioner reads the RAW path, where
    // `//v0/...` puts '' in the version slot.
    if (path.split('/')[1] !== 'v0') return apiError(404, '404 API Version Not Found');
    // ruby: the endpoint then builds `params`, and Rack raises on a query it
    // cannot parse -> 502, whatever the method or route (docs/QUIRKS.md Q23).
    if (isUnparseableQuery(request.query)) throw new TypeError('invalid query string');
    if (method !== 'GET') return notGet(method);

    // ruby: the redirects sit inside `segment '/:lang'`, so `lang` is validated first.
    const validator = new Validator();
    validator.lang(lang);

    if (isRedirect) {
      return (
        validator.failure() ??
        redirect(request, `/api/v0/${lang}/calendars/default/${rest.join('/')}`)
      );
    }

    const tail = rest.slice(1);

    // `GET /calendars`
    if (tail.length === 0) {
      const failure = validator.failure();
      return failure ?? withLocale(validator, calendarList);
    }

    validator.calendar(tail[0], repository);

    const named = tail[1];
    const isNamedRoute =
      tail.length === 2 &&
      (named === 'yesterday' || named === 'today' || named === 'tomorrow' || named === 'search');

    if (!isNamedRoute) {
      if (tail.length >= 2) validator.year(tail[1]);
      if (tail.length >= 3) validator.month(tail[2]);
      if (tail.length >= 4) validator.day(tail[3]);
    }

    const failure = validator.failure();
    if (failure) return failure;

    return withLocale(validator, () => {
      const facade = repository.get(validator.values.calendar as string);

      if (tail.length === 1) return calendarDescription(facade);

      if (isNamedRoute) {
        if (named === 'search') return search(facade, request);
        const base = requestDate(request);
        const date =
          named === 'yesterday' ? base.addDays(-1) : named === 'tomorrow' ? base.addDays(1) : base;
        return json(200, formatEntity(serializeDay(facade.day(date))));
      }

      const year = validator.values.year as number;
      if (tail.length === 2) return lectionaryYear(facade, year);
      const month = validator.values.month as number;
      if (tail.length === 3) {
        return json(200, formatEntityArray(serializeDays(facade.daysOfMonth(year, month))));
      }
      return singleDay(facade, year, month, validator.values.day as number);
    });
  }

  /** ruby: `after_validation { I18n.locale = params[:lang] }`. */
  function withLocale(validator: Validator, fn: () => HttpResponse): HttpResponse {
    return i18n.withLocale(validator.values.lang as Locale, fn);
  }

  // -- Roda -----------------------------------------------------------------

  function handleWeb(request: HttpRequest, method: string, path: string): HttpResponse {
    const segments = path.split('/').filter((s) => s !== '');

    // ruby: Roda's `r.public` serves GET only and drops empty segments, so
    // `/style.css/` serves the stylesheet but `/style.css/foo`, `POST /style.css`
    // and `HEAD /style.css` are 404s (verified).
    if (method === 'GET' && segments.length === 1 && segments[0] === 'style.css') {
      return { status: 200, headers: { 'content-type': 'text/css' }, body: STYLE_CSS };
    }

    // Unlike Grape, Roda is STRICT about a trailing slash: `r.is` and `r.root`
    // only match an empty remaining path, so `/browse/`, `/about/`, `/api-doc/`
    // and `/browse/us/2026/9/` are all 404s (verified against 2.7.0).
    if (path.length > 1 && path.endsWith('/')) return html(404, '');

    // ruby: `r.root do view :index end` — Roda's `r.root` is GET-only, so
    // `HEAD /` (before Rack::Head rewrites it) and `POST /` are 404s.
    if (segments.length === 0) {
      return method === 'GET' ? html(200, indexView()) : html(404, '');
    }

    if (segments[0] === 'browse') {
      // `r.on 'browse'` is not method-constrained: `POST /browse` 302s too.
      if (segments.length === 1) {
        return { status: 302, headers: { 'content-type': 'text/html', location: '/browse/default' }, body: '' };
      }
      const cal = segments[1];
      if (!repository.has(cal)) return html(404, ''); // ruby: `r.halt 404`

      let facade: CalendarFacade;
      try {
        facade = repository.get(cal);
      } catch (error) {
        if (error instanceof UnknownCalendarError) return html(404, '');
        throw error; // the two broken calendars: 502, like the API
      }
      const language = facade.metadata.language as Locale;

      if (segments.length === 2) {
        const now = CalDate.today();
        const startYear = now.year - 5;
        return i18n.withLocale(language, () =>
          html(
            200,
            browseView({
              startYear,
              endYear: startYear + 10,
              todayYear: now.year,
              todayMonth: now.month,
              cal,
              calendars: repository.metadata,
            }),
          ),
        );
      }

      // ruby: `r.on Integer` — a non-numeric segment simply does not match.
      const year = /^\d+$/.test(segments[2]) ? Number(segments[2]) : null;
      if (year === null) return html(404, '');
      if (segments.length === 3) {
        return { status: 302, headers: { 'content-type': 'text/html', location: `/browse/${cal}/${year}/1` }, body: '' };
      }
      if (segments.length > 4) return html(404, '');
      const month = /^\d+$/.test(segments[3]) ? Number(segments[3]) : null;
      if (month === null) return html(404, '');

      // ruby: `I18n.locale` is set BEFORE the days are computed, which matters:
      // Sunday and ferial titles are fixed strings built in that locale.
      // `Util::Month.new(year, month)` raises ArgumentError -> `r.halt 400`
      // and `@cal.day(date)` raises RangeError -> `r.halt 400`.
      return i18n.withLocale(language, () => {
        let entries;
        try {
          entries = facade.daysOfMonth(year, month);
        } catch (error) {
          if (error instanceof RangeError) return html(400, '');
          throw error;
        }
        return html(200, monthView({ year, month, entries, cal, calendars: repository.metadata }));
      });
    }

    if (segments.length === 1 && segments[0] === 'api-doc') return html(200, apiDocView());

    if (segments.length === 1 && segments[0] === 'about') {
      return html(200, aboutView(PARAMETERS.contact.name, PARAMETERS.contact.email));
    }

    if (segments.length === 1 && segments[0] === 'swagger.yml') {
      // ruby: `render :'swagger.yml', engine: :erb` — served as text/html (Q22).
      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: renderSwaggerYml({
          email: PARAMETERS.contact.email,
          docsUrl: `${origin(request)}/api-doc`,
          effectivenessYear: CALENDAR_START,
          calendarIds: repository.keys(),
          langs: LANGS,
        }),
      };
    }

    return html(404, '');
  }

  // -- the Rack stack --------------------------------------------------------

  return function handle(request: HttpRequest): HttpResponse {
    const method = (request.method || 'GET').toUpperCase();
    const path = request.path || '/';
    const covered = corsCovered(path);
    const requestOrigin = request.headers.origin;

    // rack-cors is the OUTERMOST middleware, so a preflight it answers never
    // reaches Rack::ResponseHeaders — hence no `cache-control` and no `vary`
    // on the preflight (docs/BASELINE.md defect G).
    const requestMethod = request.headers['access-control-request-method'];
    if (method === 'OPTIONS' && covered && requestOrigin !== undefined && requestMethod !== undefined) {
      // ruby: rack-cors answers a method other than GET with `text/plain` alone,
      // and (`headers: :any`) echoes Access-Control-Request-Headers verbatim; an
      // empty value, like the empty expose-headers, never reaches the wire (Q30).
      const headers: Record<string, string> = { 'content-type': 'text/plain', 'content-length': '0' };
      if (requestMethod.toLowerCase() === 'get') {
        headers['access-control-allow-origin'] = '*';
        headers['access-control-allow-methods'] = 'GET';
        headers['access-control-max-age'] = '1728000';
        const requestHeaders = request.headers['access-control-request-headers'];
        if (requestHeaders) headers['access-control-allow-headers'] = requestHeaders;
      }
      return { status: 200, headers, body: '' };
    }

    // ruby: Rack::Head — HEAD is routed as GET and the body is dropped.
    const routedMethod = method === 'HEAD' ? 'GET' : method;

    let response: HttpResponse;
    try {
      if (path === '/api' || path.startsWith('/api/')) {
        // Grape/Mustermann DOES tolerate a trailing slash: `/calendars/us/today/`
        // and `/calendars/` are both hits (verified).
        const apiPath = path.slice('/api'.length).replace(/\/+$/, '') || '/';
        response = handleApi(request, routedMethod, apiPath);
      } else {
        response = handleWeb(request, method === 'HEAD' ? 'HEAD' : routedMethod, path);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        response = apiError(error.status, error.message);
      } else {
        // Every uncaught Ruby exception (the two 502 calendars, a RangeError
        // from a pre-1970 search, `q[]=`) escapes the app and Passenger answers
        // 502 "Incomplete response received from application". Reproduced.
        response = {
          status: 502,
          headers: { 'content-type': 'text/html' },
          body: '<h1>Incomplete response received from application</h1>',
        };
      }
    }

    // ruby: `use Rack::ResponseHeaders { |h| h['Cache-Control'] = 'max-age=3600' }`
    // — unconditional, including 400s, 404s, 301s and the HTML pages.
    response.headers['cache-control'] = CACHE_CONTROL;

    if (covered) {
      response.headers.vary = 'Origin';
      if (requestOrigin !== undefined) {
        response.headers['access-control-allow-origin'] = '*';
        response.headers['access-control-allow-methods'] = 'GET';
        response.headers['access-control-max-age'] = '1728000';
      }
    }

    if (method === 'HEAD') {
      response = { ...response, body: '' };
    }

    return response;
  };
}
