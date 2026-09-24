# church-calendar

A TypeScript library for the Roman Catholic liturgical calendar: the General Roman Calendar plus
the US and Czech propers, 25 calendars in all. It has **zero runtime dependencies** and also works
as a **drop-in replacement for the Ruby [`church-calendar-api`](https://github.com/Lumen-de-Lumine/church-calendar-api)
v0 JSON API**.

It is a faithful port of two Ruby projects, not a redesign:

| Ruby ([Lumen-de-Lumine](https://github.com/Lumen-de-Lumine) forks of [igneus](https://github.com/igneus)'s projects) | Role | TypeScript |
|---|---|---|
| [`calendarium-romanum`](https://github.com/Lumen-de-Lumine/calendarium-romanum) v2.1.0 (`713ebbb`) | liturgical computation | `src/core/` |
| [`church-calendar-api`](https://github.com/Lumen-de-Lumine/church-calendar-api) v2.7.0 (`e1ca5c4`) | Grape JSON API + Roda web UI | `src/api/`, `src/http/` |

Given the same request, the port returns the same response, byte for byte. That includes the Ruby
service's bugs, apart from six deliberate deviations (see [below](#deviations-from-the-ruby-service)).

Further reading:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): the contract and the layout.
- [`docs/BASELINE.md`](docs/BASELINE.md): what "current behaviour" means and how it was captured.
- [`docs/QUIRKS.md`](docs/QUIRKS.md): every place the Ruby does something surprising, and what this
  port does about it.

## Getting started

Requires Node >= 20. The package is not published to npm yet, so build it from source, or install
it from git (`npm install github:Lumen-de-Lumine/church-calendar`), where the `prepare` script
builds `dist/`:

```sh
npm install        # devDependencies only; the package itself has NO runtime deps
npm test           # 2 035 tests
npm run typecheck
npm run build      # -> dist/
```

## Using it

### As a library (no HTTP at all)

```ts
import { CalendarRepository, serializeDay } from 'church-calendar/api';
import { CalDate, i18n } from 'church-calendar/core';

const calendars = new CalendarRepository();
const us = calendars.get('us');

i18n.withLocale('en', () => {
  serializeDay(us.day(new CalDate(2026, 9, 18)));
  // { date: '2026-09-18', season: 'ordinary', season_week: 24, cycle: 2, ... }

  us.daysOfMonth(2026, 9);                       // Day[]
  us.daysBetween(CalDate.fromISO('2026-01-01'), CalDate.fromISO('2026-12-31'));
  us.searchTitle('advent', from, to);            // the `q=` search, quirks included
  us.year(2026).lectionary();                    // 'B'
});
```

`i18n.withLocale` matters, exactly as in Ruby: rank labels and most celebration titles are resolved
from the ambient locale when you read them, but Sunday and ferial titles are fixed in the locale that
is current when the day is computed. Compute and read inside the same `withLocale`.

In a browser bundle, import only from `church-calendar/core` and `church-calendar/api`. That leaves
the HTTP layer, the web UI and the Swagger template out of the bundle.

### As a server

```sh
npm run build
PORT=9292 node bin/server.mjs
```

The server reads `PORT` (default 9292), `HOST` (default `0.0.0.0`), `LOG=off` and
`ABSOLUTE_REDIRECTS=1`, and logs one line per request. Or use the container:

```sh
docker build -t church-calendar:0.1.0 .
docker run --rm -p 9292:80 church-calendar:0.1.0
```

The image listens on port 80 and answers the readiness probe at `/`, like the Ruby image. It runs as
uid 1000 with no added capabilities.

The handler is synchronous, and `search` has no range limit (neither has the Ruby service): a
1,000-year `startDate`/`endDate` range takes about 6 s of CPU and close to 1 GB of memory, and while
it runs, this server, or an Express/NestJS app that mounts the middleware, answers nothing else.
Where the API is public, cap the span of `search` or rate-limit it in front of the process. A Lambda
deployment keeps each request in its own invocation.

### As a Lambda

`npm run build`, then zip `dist/`, `lambda/` and `package.json`. The handler is
`lambda/handler.handler`, on runtime `nodejs22.x` or newer, with 256 MB. API Gateway HTTP API
(payload 2.0) and Function URLs share the event shape.

### The HTTP handler, framework-free

```ts
import { createHandler } from 'church-calendar/http';
const handle = createHandler();
handle({ method: 'GET', path: '/api/v0/en/calendars', query: {}, headers: {} });
// { status: 200, headers: { 'content-type': ..., 'cache-control': ... }, body: '...' }
```

Four adapters wrap it:

| Adapter | Export | Shape |
|---|---|---|
| `adapters/node.ts` | `createServer` | a `node:http` server |
| `adapters/express.ts` | `createExpressMiddleware` | `(req, res, next)` middleware for Express or NestJS (typed structurally, so there is no `express` import); `passThroughOnNotFound` lets it share a prefix |
| `adapters/lambda.ts` | `createLambdaHandler` | API Gateway v2 / Function URL |
| `adapters/fetch.ts` | `createFetchHandler` | `Request -> Response` |

## Routes

Everything the Ruby service serves, at the same paths:

```
GET /api/v0/:lang/calendars                              -> string[]
GET /api/v0/:lang/calendars/:cal                         -> { system, sanctorale }
GET /api/v0/:lang/calendars/:cal/(yesterday|today|tomorrow)   (honours the Date header)
GET /api/v0/:lang/calendars/:cal/search?date=|?q=&startDate=&endDate=
GET /api/v0/:lang/calendars/:cal/:year                   -> { lectionary, ferial_lectionary }
GET /api/v0/:lang/calendars/:cal/:year/:month            -> Day[]
GET /api/v0/:lang/calendars/:cal/:year/:month/:day       -> Day
GET /api/v0/:lang/(yesterday|today|tomorrow|:year[/:month[/:day]])  -> 301 to `default`
GET /  /browse  /browse/:cal  /browse/:cal/:year[/:month]  /api-doc  /about
GET /swagger.yml  /style.css
```

`:lang` is one of `cs`, `en`, `fr`, `it` or `la`. `:cal` is one of the 25 ids that `GET /calendars`
returns. Years start at 1970; the only upper bound is the one a JavaScript number imposes on exact
day arithmetic, year 24 660 873 954 865 (deviation 6).

## Parity status

Every response is compared against golden fixtures captured from the Ruby 2.7.0 service on
2026-09-18 (`test/fixtures/baseline/`, 868 files, 6.2 MB). **All green.**

| fixture group | files | what it covers | tests | passing |
|---|---:|---|---:|---:|
| `days/` | 587 | `search?startDate=&endDate=`: `us`, `us-ascension`, `general-en`, `general-la` × 1970–2100, plus all 25 calendars × 2025–2027 (6 of these are recorded 502s) | 588 | 588 |
| `lang/` | 10 | the same, in `cs`, `en`, `fr`, `it`, `la` | 11 | 11 |
| `month/` | 12 | `GET /:year/:month`, `us` 2026 | 13 | 13 |
| `day/` | 118 | `GET /:year/:month/:day`, 59 hand-picked dates × 2 calendars | 119 | 119 |
| `year/` | 131 | `GET /:year` (lectionary cycles), `us` 1970–2100 | 132 | 132 |
| `misc/calendars.json` | 1 | `GET /calendars`, parsed **and** raw text | 3 | 3 |
| `misc/calendar-descriptions.json` | 1 | `GET /calendars/:cal` × 25, parsed **and** raw | 26 | 26 |
| `misc/today.json` | 1 | `yesterday`/`today`/`tomorrow` × 5 `Date`-header forms | 16 | 16 |
| `misc/redirects.json` | 1 | the four 301s | 5 | 5 |
| `misc/errors.json` | 1 | 35 validation / routing cases | 36 | 36 |
| `misc/search-queries.json` | 1 | 15 `q` values, with `bytes` + `sha256` | 16 | 16 |
| `misc/headers.json` | 1 | CORS and cache headers, with and without `Origin`, plus the preflight | 12 | 12 |
| `misc/web.json` + the two body captures | 3 | the 11 Roda routes, `style.css` byte-identical, `swagger.yml` text | 15 | 15 |
| byte-level formatting | — | one route per JSON shape | 14 | 14 |
| deliberate deviations | — | multi-year vigils, no data mutation, no stdout | 11 | 11 |
| `fixtures-sanity` | — | manifest hashes, key order | 4 | 4 |
| **conformance total** | **868** | **216 326 serialized days compared** | **1 031** | **1 031** |

On top of the conformance suite, `test/core` has 757 tests for the library port, and `test/api` plus
`test/http` have 247 more: date parsing, ordinal spelling, entities, search, the repository, router
edge cases and all four adapters. That makes **2 035 tests in 31 suites, running in about 22 s.**

Parity here means bytes, not just parsed JSON. The suite asserts the exact `sha256` of the raw body
for `/calendars`, all 25 `/calendars/:cal`, the deterministic `today`/`yesterday`/`tomorrow`, the
four redirect bodies, all 35 error bodies, all 15 search results and `/style.css`. Spot checks
over HTTP against the Ruby service gave the same result: `/api/v0/en/calendars` (384 B),
`/api/v0/en/calendars/us/2026/2` (8 851 B) and `/api/v0/en/calendars/us/2026/9/18` (268 B) are all
byte-identical.

## Deviations from the Ruby service

Everything else is reproduced, bugs included. These six are on purpose:

| # | Ruby 2.7.0 | this port | why |
|---|---|---|---|
| 1 | a multi-year `search` **duplicates vigils**: `search?startDate=2025-08-13&endDate=2026-08-15` returns `["kolbe","assumption_vigil","assumption_vigil"]` for 2026-08-14, because `Calendar#day(vigils: true)` pushes into the `Sanctorale`'s own array | the vigil appears **once**, for every year and every range | this is memory corruption, not behaviour, and it hits any request spanning a year boundary. BASELINE L4, QUIRKS Q3 and Q33 |
| 2 | prints `ERROR: range error when generating vigils for date: …` to stdout on every request that touches the last day of a liturgical year | silent | a library has no business writing to stdout, and the response is identical. QUIRKS Q32 |
| 3 | `x-powered-by: Phusion Passenger(R)` | not emitted | it describes the Ruby web server, which the port does not have. QUIRKS Q17 |
| 4 | `Date.parse` accepts ISO ordinal/week dates, day-of-year, `--mm-dd`, era names, VMS/JIS forms, year-first `2026 Sep 18`, `2026-09-18Z`, `+2026-09-18` and a year-less `09/18` | those are `400 …does not have a valid value` | no fixture uses them; the implemented subset (which includes JavaScript's `Date#toString()` output) is listed and tested. QUIRKS Q21 |
| 5 | rack-cors emits `access-control-expose-headers: ""` | not emitted | it does not survive nginx, and the captured headers have no such field. QUIRKS Q30 |
| 6 | bignum dates serve any year: `/us/30000000000000` is a 200 | a year above 24 660 873 954 865 is a 502 (a 400 where the route parses a date itself) | past `Number.MAX_SAFE_INTEGER` days the date arithmetic is inexact and date loops never end, so one request would hang the process. QUIRKS Q36 |

Two more differences look like deviations but are not:

* The 502 body for the two unloadable calendars is a one-line HTML page rather than Passenger's full
  error page. Only the status is meant to match (QUIRKS Q24).
* The web UI's HTML is a transliteration of the Haml, not byte-identical. Statuses, content types,
  redirects and `/style.css` are exact (QUIRKS Q35a).

**`general-fr` and `general-es` still return 502.** Their data files list the `faustina_kowalska`
symbol twice. The port reproduces the load failure rather than silently fixing the gem's data.
Fixing it takes a one-line deletion in each file, and is left for a separate, deliberate change
(QUIRKS Q10).

## Re-capturing the fixtures

The Ruby image is public on Docker Hub, so the oracle can run locally:

```sh
docker run --rm -p 9292:80 sourceandsummit/church-calendar-api:2.7.0   # in another shell

npm run capture-baseline                   # fill in whatever is missing (idempotent)
npm run capture-baseline -- --force        # re-capture everything
npm run capture-baseline -- --only=misc,day
BASE_URL=https://calendar.example.com npm run capture-baseline   # another 2.7.0 deployment
```

`BASE_URL` defaults to `http://localhost:9292`. `CONCURRENCY` defaults to 2 and **must not go above
4**. Each full-year request makes the Passenger pool compute a whole liturgical year, and at 4 the
deployment the fixtures came from started answering nginx `503`s. The details, including the recorded 502s that the
script must not retry, are in [`test/fixtures/baseline/README.md`](test/fixtures/baseline/README.md).

## Running the Ruby baseline in Docker

The image is the oracle. To check any behaviour question yourself:

```sh
# the fork's own suite (444 runs, 3 failures + 2 errors against 2.7.0; see docs/BASELINE.md)
docker run --rm -e RACK_ENV=test sourceandsummit/church-calendar-api:2.7.0 \
  bash -lc 'cd /home/app/webapp && bundle exec rake test'

# drive the REAL Rack stack (Cors + ResponseHeaders + URLMap) in-process
cat > probe.rb <<'RUBY'
ENV['RACK_ENV'] = 'production'
require 'rack'; require 'rack/test'
app, = Rack::Builder.parse_file('/home/app/webapp/config.ru')
s = Rack::Test::Session.new(Rack::MockSession.new(app, 'calendar.example.com'))
s.get '/api/v0/en/calendars/us/2026/9/18'
puts s.last_response.status, s.last_response.headers.inspect, s.last_response.body
RUBY
docker run --rm -v "$PWD/probe.rb:/tmp/probe.rb" sourceandsummit/church-calendar-api:2.7.0 \
  bash -lc 'cd /home/app/webapp && bundle exec ruby /tmp/probe.rb'

# read a gem's source (this is how the ordinalize_full tables were extracted)
docker run --rm sourceandsummit/church-calendar-api:2.7.0 \
  bash -lc 'cat $(gem contents ordinalize_full | grep -v spec)'
```

A second, independent capture was made with a `rake baseline:dump` task on a local test branch of the
fork (rack-test, no network). 712 of its 718 files are identical to the HTTP capture. The other
6 are the two 502 calendars, where rack-test records the raw `ArgumentError` and the wire records
Passenger's page. Either capture can serve as the oracle.

## Regenerating the data

`src/data/` is generated from the Ruby repositories and must never be edited by hand. With clones of
both forks next to this repository, at `../calendarium-romanum` and `../church-calendar-api`, run:

```sh
npm run sync-data
```

Clones elsewhere can be named with `CALENDARIUM_ROMANUM_DIR` and `CHURCH_CALENDAR_API_DIR`.

## Layout

```
src/core/       port of calendarium-romanum (do not edit without a failing test)
src/data/       GENERATED by scripts/sync-data.mjs — never hand-edit
src/api/        calendars-config, calendar-repository, calendar-facade,
                entities, dates, ordinalize-full, errors
src/http/       router + json + web views + swagger, and adapters/
bin/server.mjs  standalone server        lambda/handler.mjs  AWS entry point
scripts/        sync-data.mjs, capture-baseline.mjs
test/           core/ api/ http/ conformance/ + fixtures/baseline/
docs/           ARCHITECTURE, BASELINE, QUIRKS
```

## License and credits

This repository is a port of other people's work:

* [calendarium-romanum](https://github.com/igneus/calendarium-romanum) by Jakub Pavlík. Its
  liturgical logic and sanctorale data are the basis of `src/core/` and `src/data/`. It is
  dual-licensed: GNU LGPL 3 or MIT, at the licensee's choice.
* [church-calendar-api](https://github.com/igneus/church-calendar-api) by Jakub Pavlík. It is the
  basis of `src/api/` and `src/http/`, including the web UI, `style.css` and `swagger.yml`. It is
  licensed under GNU LGPL 3 or later.
* The English ordinal tables in `src/api/ordinalize-full.ts` come from
  [ordinalize_full](https://github.com/infertux/ordinalize_full), © Cédric Félizard, MIT (see
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)).

Because `src/api/` and `src/http/` are derived from church-calendar-api, this package is licensed
under the **GNU Lesser General Public License, version 3 or (at your option) any later version**
(`LGPL-3.0-or-later`). The LGPL text is in [`LICENSE`](LICENSE), and the GPL it supplements is in
[`COPYING`](COPYING).
