# Baseline fixtures — captured from the Ruby service

Golden output of **`sourceandsummit/church-calendar-api:2.7.0`**, captured with
[`scripts/capture-baseline.mjs`](../../../scripts/capture-baseline.mjs) from a deployment of that
image on **2026-09-18**.

On **2026-09-24** the whole set was re-captured from the same image run locally and compared. Every
file matched (the gzipped ones after decompression) except the clock-dependent entries listed below
and two files, which were replaced with the local capture:

- `misc/swagger.yml.txt` (and its hash in `misc/web.json`): its `docs_url` echoes the request host
  and now reads `url: http://localhost:9292/api-doc`, so a `--force` re-capture with the default
  `BASE_URL` reproduces it.
- `misc/headers.json`: re-captured with `Origin: https://example.com`. The local image also sends
  `server: nginx + Phusion Passenger(R)`, which the conformance test ignores along with the other
  web-server headers.

`manifest.json` is the authoritative index: it carries the service version, the capture window, the
request count and `{path, bytes, sha256}` for every file here. Its `base_url` was set to
`http://localhost:9292` at the 2026-09-24 re-check; the capture window and request counts are still
those of the original 2026-09-18 capture.

These fixtures are the **pass/fail criterion** for `test/conformance/`. They record what 2.7.0 *does*,
including its bugs (see "Known defects" below) — not what it ought to do. When the TypeScript port
deliberately diverges, the divergence gets an issue and a note in `docs/QUIRKS.md`; it does not get a
quietly edited fixture.

**At a glance:** 868 files, 5.94 MiB on disk, 212 193 serialized days, 559 recorded requests.
`days/` holds 581 gzipped full-year files averaging ~9.7 KB each (~123 KB raw), which is why they are
gzipped; everything small is plain `.json` so it stays diffable in review.

## Re-capturing

```sh
docker run --rm -p 9292:80 sourceandsummit/church-calendar-api:2.7.0   # the Ruby oracle, in another shell
npm run capture-baseline                      # fill in whatever is missing (idempotent)
npm run capture-baseline -- --force           # re-capture everything
npm run capture-baseline -- --only=misc,day   # one or more groups: days lang month day year misc
npm run capture-baseline -- --dry-run         # list what would be fetched
BASE_URL=https://calendar.example.com npm run capture-baseline   # against another 2.7.0 deployment
```

Environment: `BASE_URL` (default `http://localhost:9292`), `CONCURRENCY` (default 2, max 4), `THROTTLE_MS` (default 200),
`REQUEST_TIMEOUT_MS`, `SERVICE_VERSION`. The script sends
`User-Agent: church-calendar-baseline/1.0`, retries network errors and 5xx three times
with backoff, and skips files that already exist.

> **Keep concurrency low against a shared deployment.** Each full-year request makes the Passenger pool
> compute a whole liturgical year. At 4 concurrent full-year requests the deployment this was first
> captured from started answering `503 Service Temporarily Unavailable` from nginx; the first pass lost
> 133 files that way. The image run locally takes `CONCURRENCY=4` without trouble. A recorded `5xx`
> body is treated as a *failed* capture, so simply re-running the script repairs it (a recorded `502`
> from the two known-broken calendars is treated as the fixture and is not retried).

## Layout

| Path | Route | Format |
|---|---|---|
| `days/<cal>/<year>.json.gz` | `search?startDate=<year>-01-01&endDate=<year>-12-31`, lang `en` | gzipped `BaselineDay[]` |
| `lang/<lang>/<cal>-<year>.json.gz` | same, per language | gzipped `BaselineDay[]` |
| `month/<cal>/<year>-<mm>.json` | `/:year/:month` | `BaselineDay[]` |
| `day/<cal>/<YYYY-MM-DD>.json` | `/:year/:month/:day` | `BaselineDay` |
| `year/<cal>/<year>.json` | `/:year` | `{lectionary, ferial_lectionary}` |
| `misc/*.json`, `misc/*.txt` | everything else (see below) | aggregates |
| `manifest.json` | — | index + hashes |

Coverage:

- `days/`: **1970–2100** for `us`, `us-ascension`, `general-en`, `general-la`, plus **2025, 2026, 2027**
  for all 25 calendars. 1970 is the first year the calendar system is effective
  (`CalendariumRomanum::Calendar::EFFECTIVE_FROM`); the service serves it without complaint even
  though Advent of liturgical year 1970 begins on 1969-11-30.
- `lang/`: `cs`, `en`, `fr`, `it`, `la` × (`us`, `general-la`) × 2026. `es` is **not** an accepted lang.
- `month/`: `us` 2026, all twelve months.
- `day/`: 59 hand-picked dates × (`us`, `us-ascension`) — vigils, transfers, octaves, Ascension
  Thursday vs Sunday, Annunciation in Holy Week, Immaculate Conception on a Sunday of Advent,
  Sacred Heart vs John the Baptist (2022-06-22..25), Thanksgiving, plus plain ferial/Sunday controls.
- `year/`: `us` 1970–2100.

`misc/`:

| File | Contents |
|---|---|
| `calendars.json` | `GET /calendars` — parsed body **and** the raw text (the pretty-printing matters, see below) |
| `calendar-descriptions.json` | `GET /calendars/:cal` for all 25 calendars |
| `today.json` | `yesterday`/`today`/`tomorrow` × `Date` header in RFC 1123, RFC 850, asctime, invalid, absent. Entries with `deterministic: false` depend on the server clock — assert shape only |
| `redirects.json` | the four `/api/v0/en/...` → `default` calendar redirects, **not** followed |
| `errors.json` | 36 validation / routing cases: status, content-type, body |
| `search-queries.json` | 15 `q` values over `us` 2026. `dates` is always present; `body` is inlined only for small results — join `dates` against `days/us/2026.json.gz` for the rest |
| `headers.json` | full response headers with and without `Origin`, plus CORS preflight |
| `web.json` | status / content-type / bytes / sha256 for the Roda web UI routes |
| `swagger.yml.txt`, `browse-us-2026-9.html.txt` | full bodies of those two |

### Clock-dependent entries — do not pin these

Three recorded responses depend on the server's clock at capture time and **will** differ on the next
capture. Assert their shape, never their dates:

- `misc/today.json` entries with `"deterministic": false` (the `Date` header absent);
- `misc/errors.json` → `search-no-params` (`GET .../search` with no parameters), which returned 366
  days from 2026-09-18 to 2027-09-18 — see defect 8 below;
- `misc/headers.json` → the `date` response header.

### Useful anchors

- `day/us/2026-05-14.json` = *Saint Matthias, Apostle* (feast) while
  `day/us-ascension/2026-05-14.json` = *The Ascension of the Lord* — the cleanest single-date proof
  that `transfer_to_sunday` is wired up.
- `days/us/2026.json.gz` 2026-04-02 and 2026-04-04 each carry **two** celebrations (Chrism Mass +
  Evening Mass; Holy Saturday + Easter Vigil), all `rank: "Easter triduum"`, `rank_num: 1.1` — the
  facade requests `vigils: true`.
- `day/us/2023-01-23.json` shows the *Day of Prayer for the Legal Protection of Unborn Children*
  moved off the Sunday onto the Monday as a fourth optional memorial.

## Day shape

```jsonc
{"date":"2026-09-19","season":"ordinary","season_week":24,"cycle":2,"cycle_sunday":"A",
 "cycle_ferial":2,
 "celebrations":[{"title":"Saturday of the 24th Week in Ordinary Time","colour":"green",
                  "rank":"ferial","rank_num":3.13,"id":null}, ...],
 "vespers":{"title":"25th Sunday in Ordinary Time","colour":"green","rank":"Sunday",
            "rank_num":2.6,"id":null},
 "weekday":"saturday"}
```

Key order is part of the contract (`apps/api/v0/entities/day.rb`, `celebration.rb`) and is asserted by
`test/conformance/fixtures-sanity.test.ts`. Types live in
[`test/helpers/fixtures.ts`](../../helpers/fixtures.ts).

## Known defects and oddities recorded in these fixtures

Everything below is **actual behaviour of 2.7.0**, reproduced verbatim in the fixtures.

1. **`general-fr` and `general-es` return HTTP 502 for every day request.** Their sanctorale data
   files duplicate the `faustina_kowalska` symbol, the calendar fails to build, and Passenger reports
   *"Incomplete response received from application"*. Recorded as
   `days/general-fr/<year>.json` = `{"status":502,"body":"<h1>Incomplete response received from application</h1>"}`.
   `GET /calendars/general-fr` (the description route) 502s too.
2. **Responses are NOT uniformly compact.** Grape's formatter is
   `MultiJson.dump(obj, pretty: true)`; Oj indents real Ruby `Hash`/`Array` objects but falls back to
   `#to_json` for a `Grape::Entity`, which ignores the indent. So:
   - plain hashes/arrays (`/calendars`, `/calendars/:cal`, `/:year`) are **pretty**, 2-space indent,
     and — unlike `JSON.pretty_generate` — with **no space after `:`** (`"system":{`);
   - a single day (`/:y/:m/:d`, `today`) is **fully compact**;
   - a day *array* (`/:y/:m`, `search`) is a **pretty array of compact objects**:
     `[\n  {"date":...},\n  {"date":...}\n]`.
   Byte-for-byte parity requires reproducing all three. (The fixtures store *parsed* JSON, so this is
   invisible in them; `misc/calendars.json` keeps the raw text as evidence.)
3. **`rank` is `short_desc || desc`,** so privileged days carry a long, plural, sentence-like label:
   Sundays of Advent/Lent/Easter, Christmas and the like report `"rank":"Primary liturgical days"`
   (`rank_num` 1.2) and the Triduum reports `"Easter triduum"`. Everything else gets a short label
   (`ferial`, `memorial`, `optional memorial`, `feast`, `solemnity`, `Sunday`, `commemoration`).
4. **`id` is `null` for temporale days without a symbol** — every ordinary ferial and every Sunday in
   Ordinary Time. Consumers typically derive `${season}_${season_week}_${weekday}` from the
   other fields; any TS replacement must keep emitting `null`, not a synthesized id.
5. **`rank_num` is a JSON number, and `COMMEMORATION` serializes as `4.0` on the wire** (these fixtures hold *parsed* JSON, so they show `4`; corrected 2026-09-18 after a raw curl). `JSON.stringify`
   would emit `4`, so the TS serializer special-cases Float-typed keys (`RUBY_FLOAT_KEYS`) to write `4.0`.
6. **`weekday` is never localized.** The entity uses a hard-coded English `WDAYS` table, so
   `/api/v0/cs/...` still returns `"weekday":"friday"`.
7. **`vespers` (fork-only, present since 2.7.0) is emitted for every route**, including inside
   `search` results — and inside a `q=` search the vespers celebration is copied from the original day
   **even when it does not match the query** (`CalendarFacade#search_title` rebuilds the `Day` with
   filtered `celebrations` but the untouched `vespers`).
8. **`search` with no parameters returns 200 and ~366 days**, not an error:
   `search_title(nil, nil, nil)` defaults `startDate` to *today* and `endDate` to *today + 365*.
   That makes the endpoint's default response clock-dependent.
9. **Search is byte-wise and Unicode-naive.** `q="'"` (ASCII apostrophe) matches 0 days in 2026 while
   `q="’"` (U+2019, which the titles actually use) matches 2. `spell_out_ordinals` rewrites only the
   **first** ordinal in a title, so `q="1st"` matches 25 days but `q="first"` matches 27.
10. **CORS headers appear only when the request carries `Origin`.** With `Origin` a `/api/*` response
    adds `access-control-allow-origin: *`, `access-control-allow-methods: GET`,
    `access-control-max-age: 1728000`; without it, only `vary: Origin`. The `OPTIONS` preflight
    answers `200 text/plain`, zero-length, and **without** `cache-control`. The web UI routes get no
    CORS headers at all (rack-cors only covers `/api/*` and `/swagger.yml`).
11. **`/swagger.yml` is served as `content-type: text/html`,** not `application/x-yaml` or `text/yaml`.
12. **Unknown `/api/*` routes return a bare `404 Not Found` with no content-type and no JSON body**,
    while a wrong method on a valid route returns `405` with `{"error":"405 Not Allowed"}`.
13. **Grape concatenates validator messages.** `/:cal/abc` →
    `{"error":"year is invalid, year must be numeric, year invalid, the calendar has been effective only since 1970"}`;
    `/:cal/0` →
    `{"error":"year must be numeric, year invalid, the calendar has been effective only since 1970"}`.
    Reproduce the strings exactly, commas and all.
14. **The year upper bound is unenforced.** `/:cal/12345` returns `200 {"lectionary":"A","ferial_lectionary":2}`.
    Only `year >= 1970` and `/^\d{4,}$/` are checked.
15. **`Date.parse` leniency is part of the API surface.** `search?date=` accepts `2026-09-18`,
    `2026-09-18T14:00:00.000Z`, `2026/9/18`, `20260918`, `18 Sep 2026`, `Sep 18 2026` and `2026-9-8`;
    `garbage` and `2026-13-01` are 400 `{"error":"date does not have a valid value"}`.
16. **Redirect bodies are JSON-encoded strings served as `text/plain`**, e.g.
    `"This resource has been moved permanently to /api/v0/en/calendars/default/today."`, with a 301
    and a relative `Location` (e.g. `/api/v0/en/calendars/default/today`; corrected 2026-09-18 after a raw curl).
17. **`/browse` and `/browse/:cal/:year` are 302s**, `/browse/<unknown>` is a bodyless 404 and
    `/browse/us/1900/1` a bodyless 400 — all `content-type: text/html` with zero bytes.
