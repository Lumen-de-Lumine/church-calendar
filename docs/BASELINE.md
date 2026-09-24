# Baseline of the Ruby service (church-calendar-api 2.7.0) — what "current behaviour" means

Captured 2026-09-18. Two independent captures exist and must agree:

1. **HTTP capture** of a deployment of the public image `sourceandsummit/church-calendar-api:2.7.0`
   → `test/fixtures/baseline/**` (see its README). Re-verified on 2026-09-24 against the same image
   run locally: every fixture that does not depend on the clock or the request host was identical.
2. **Docker dump** of the same image with the fork clone mounted (`rake baseline:dump`, a task on a local test
   branch of the fork; rack-test, no network). The dump itself is not committed.

## The fork's own test suite against 2.7.0 (unmodified)

Run inside the shipped image (`docker run --rm -e RACK_ENV=test sourceandsummit/church-calendar-api:2.7.0 bash -lc 'cd /home/app/webapp && bundle exec rake test'`):

```
444 runs, 583 assertions, 3 failures, 2 errors, 0 skips
```

| # | Example | Kind | Cause |
|---|---|---|---|
| 1 | `/calendars/:cal returns calendar description` | stale test | `default` is `general-la` (Latin), the test expects `general-en` |
| 2 | `/calendars returns list of calendars available` | stale test | list grew (`general-es`, `us`, `us-*`) |
| 3 | `/calendars all calendars work` | **real defect** | `general-fr`/`general-es` raise `duplicate symbol :faustina_kowalska` (duplicated line in `universal-fr.txt`/`universal-es.txt`) → HTTP 502 from the service |
| 4 | `/:year/:month/:day memorial has sanctorale celebrations` | stale test | expects English title, default calendar is Latin |
| 5 | `CalendarRepository sanctorale data from file` | **real latent defect** | `Sanctorale#rebuild_symbols` treats several `nil` symbols as duplicates, so `file:` data sources without ids cannot be layered (unused by the shipped `config/calendars.yml`) |

The calendarium-romanum fork has **no tests at all** for its fork-only features (vigils, evening celebrations, `+1sunday`, cycles, Thanksgiving, ferial ids).

## Output facts worth knowing (verified with curl on 2026-09-18)

- JSON comes in three shapes (pretty 2-space objects/arrays with no space after `:`; a single Day compact; Day arrays as a pretty array of compact objects); `Cache-Control: max-age=3600`; `x-powered-by: Phusion Passenger(R)`; CORS via rack-cors (`*`) on `/api/*`.
- Day keys, in order: `date, season, season_week, cycle, cycle_sunday, cycle_ferial, celebrations, vespers, weekday`.
  Celebration keys: `title, colour, rank, rank_num, id`.
- `id` is `null` for temporale days without a symbol (ordinary ferials and Sundays); consumers typically derive `${season}_${season_week}_${weekday}`.
- `rank` is the localized *short* description when one exists (`ferial`, `optional memorial`, `memorial`, `feast`, `solemnity`, `Sunday`, `commemoration`) and otherwise the *long* description: privileged Sundays/days show `Primary liturgical days`, Triduum days `Easter triduum`.
- Example, `us` 2026-11-28: two celebrations (ferial + `saturday_memorial_bvm`) and `vespers` = `{"title":"1st Sunday of Advent","colour":"violet","rank":"Primary liturgical days","rank_num":1.2,"id":null}`.

## HTTP capture

`scripts/capture-baseline.mjs` (Node 24, zero deps) captured `test/fixtures/baseline/**` from a
deployment of the 2.7.0 image on 2026-09-18. Layout, per-file coverage and the
re-capture commands are in [the fixture README](../test/fixtures/baseline/README.md); `manifest.json`
carries `{path, bytes, sha256}` for every file.

| Group | Files | Route | Coverage |
|---|---:|---|---|
| `days/` | 587 | `search?startDate=&endDate=` | `us`, `us-ascension`, `general-en`, `general-la` × **1970–2100**; all 25 calendars × 2025–2027 |
| `year/` | 131 | `/:year` | `us` 1970–2100 (lectionary cycles) |
| `day/` | 118 | `/:y/:m/:d` | 59 hand-picked dates × (`us`, `us-ascension`) |
| `month/` | 12 | `/:y/:m` | `us` 2026, all months |
| `lang/` | 10 | `search?startDate=&endDate=` | cs, en, fr, it, la × (`us`, `general-la`) × 2026 |
| `misc/` | 10 | everything else | calendars list + descriptions, today/yesterday/tomorrow × 5 `Date` header forms, redirects, 36 error cases, 15 search queries, CORS/header probes, web UI, full `swagger.yml` and one `/browse` page |
| **total** | **868** | | 212 193 day objects, 5.94 MiB on disk (581 gzipped year files, ~9.7 KB each) |

559 requests over the two recorded runs (the aborted first pass, see below, is not counted); the
successful pass took 182 s for 445 files with zero retries.

Re-run with `npm run capture-baseline` (idempotent — it only fetches what is missing). It targets
`BASE_URL`, which defaults to `http://localhost:9292` — the Ruby image run locally with
`docker run --rm -p 9292:80 sourceandsummit/church-calendar-api:2.7.0`.

### Capture note: a small Passenger pool cannot take 4-way concurrency

Each `search?startDate=…&endDate=…` makes the Passenger pool compute a whole liturgical year
(~1.2 s, ~123 KB). At `CONCURRENCY=4` the server captured from began answering nginx
`503 Service Temporarily Unavailable` and **133 of the first ~700 requests were lost**. The default is
now `CONCURRENCY=2` with a 200 ms per-worker throttle, which completed 445 tasks with **zero** retries.
The script treats a recorded `5xx` body as a failed capture and re-fetches it on the next run, so a
resume repairs the damage; a recorded `502` from the two known-broken calendars is treated as the
fixture and is never retried. (`total_requests` in the manifest counts only the runs listed in its
`runs` field — the aborted first pass is not included.)

Run locally, the image has no such limit: on 2026-09-24 a full `--force` capture with
`CONCURRENCY=4 THROTTLE_MS=0` fetched all 868 files in 75 s with zero retries.

### Corrections and additions to the notes above

- **"JSON is compact" is only true for entity-presented single objects.** Grape's formatter is
  `MultiJson.dump(obj, pretty: true)`; Oj indents real `Hash`/`Array` objects but falls back to
  `#to_json` for a `Grape::Entity`, which ignores the indent. Three distinct shapes result:
  - plain hash/array routes (`/calendars`, `/calendars/:cal`, `/:year`) → **pretty**, 2-space indent,
    and **no space after `:`** (`"system":{`) — this is Oj's pretty form, not `JSON.pretty_generate`'s;
  - a single day (`/:y/:m/:d`, `today`/`yesterday`/`tomorrow`) → **fully compact**;
  - a day array (`/:y/:m`, `search`) → **pretty array of compact objects**.
  Byte-for-byte parity needs all three; parsed-equality (the conformance criterion) does not.
- `rank_num` for `COMMEMORATION` serializes as `4.0` on the wire (Oj prints Floats with a decimal; verified with curl on `us` 2026-12-21). The fixtures hold parsed JSON, so they show `4`; the TS serializer re-emits `4.0` (see `RUBY_FLOAT_KEYS`).
- `weekday` is never localized — the entity uses a hard-coded English `WDAYS` table, so
  `/api/v0/cs/...` still returns `"weekday":"friday"`.
- 1970 is served normally (365 days, `1970-01-01` = Mary, Mother of God, `cycle_sunday` `B`); the
  boundary the code enforces is `year >= 1970`, and there is **no upper bound** — `/:cal/12345`
  returns `200 {"lectionary":"A","ferial_lectionary":2}`.

### Defects observed over HTTP (beyond the two 502 calendars)

| # | Behaviour | Where |
|---|---|---|
| A | `search` with **no parameters** returns 200 and ~366 days — `search_title(nil, nil, nil)` defaults `startDate` to *today* and `endDate` to *today + 365*, so the default response is clock-dependent | `misc/errors.json` → `search-no-params` |
| B | In a `q=` search the `vespers` celebration is copied from the original day **even when it does not match the query** (`search_title` rebuilds `Day` with filtered `celebrations` but untouched `vespers`) | `lib/church-calendar/services/calendar_facade.rb` |
| C | Search is Unicode-naive: `q="'"` matches **0** days of 2026, `q="’"` (U+2019, what the titles use) matches **2** | `misc/search-queries.json` |
| D | `spell_out_ordinals` rewrites only the **first** ordinal in a title → `q="1st"` matches 25 days, `q="first"` matches 27 | `misc/search-queries.json` |
| E | `/swagger.yml` is served as `content-type: text/html` | `misc/web.json`, `misc/headers.json` |
| F | Unknown `/api/*` route → bare `404 Not Found`, **no content-type, no JSON body**; wrong method on a valid route → `405 {"error":"405 Not Allowed"}` | `misc/errors.json` |
| G | CORS headers are emitted **only** when the request carries `Origin`; the `OPTIONS` preflight answers `200 text/plain`, zero-length, and **without** `cache-control` | `misc/headers.json` |
| H | Grape concatenates validator messages, e.g. `/:cal/abc` → `"year is invalid, year must be numeric, year invalid, the calendar has been effective only since 1970"` | `misc/errors.json` |
| I | `/browse/<unknown>` → bodyless `404 text/html`; `/browse/us/1900/1` → bodyless `400 text/html` | `misc/web.json` |

### What the TypeScript port must not "fix" silently

`id: null` on temporale days, `rank` falling back to the long description (`"Primary liturgical days"`,
`"Easter triduum"`), the three JSON formatting shapes, the exact Grape error strings, the lenient
`Date.parse` inputs clients may rely on (`2026-09-18T14:00:00.000Z`, `2026/9/18`, `20260918`,
`18 Sep 2026`, `Sep 18 2026`, `2026-9-8`), and the 301 redirect bodies
(`"This resource has been moved permanently to …"`, `text/plain`, relative `Location` such as `/api/v0/en/calendars/default/today`).
Each is asserted by the conformance fixtures; a deliberate change needs an issue and a
`docs/QUIRKS.md` entry, not a fixture edit.

## Defects confirmed over HTTP (2026-09-18)

| # | Defect | Evidence | Port decision |
|---|---|---|---|
| L1 | `general-fr` / `general-es` → HTTP 502 (duplicated `faustina_kowalska` line in the gem's fr/es data) | `days/general-fr/2026.json` fixture = `{status: 502}` | reproduce the load failure (same calendars unusable) until the data is fixed |
| L2 | Equal-rank solemnity collision: `us` 2022-06-24 AND 2022-06-25 both show `sacred_heart`; `baptist_birth` and its vigil vanish for the year | `day/us/2022-06-2{2,3,4,5}.json` | reproduce (parity); fix separately |
| L3 | A second impeded solemnity overwrites the first at the same transfer target (St Joseph lost when Joseph + Annunciation are both impeded: LY2007, next 2035) | computed over 2000–2100 | reproduce (parity) |
| L4 | **Multi-year requests duplicate vigils.** `Calendar#celebrations_for` returns the Sanctorale's own array for days whose sanctorale celebration outranks the temporale one, and `Calendar#day(vigils: true)` pushes the vigil into it, so the Sanctorale is mutated; the same `AbstractDate` in a later year then carries the vigil twice. Verified: `search?startDate=2025-08-13&endDate=2026-08-15` on `us` returns `["kolbe","assumption_vigil","assumption_vigil"]` for 2026-08-14 while the single-year request returns it once. Affects any consumer that requests a range spanning more than one liturgical year | curl | **do NOT reproduce** (memory-corruption bug, not behaviour): the port must return `["kolbe","assumption_vigil"]` for every year; covered by a dedicated multi-year test and documented in `docs/QUIRKS.md` as a deliberate deviation |

## Cross-check: Docker dump vs HTTP capture (2026-09-18)

718 dump files (`days/*` 1970–2100 for us / us-ascension / general-en / general-la, 2025–2027 for all 25 calendars, `year/us/*`)
compared as parsed JSON against the same paths under `test/fixtures/baseline/`: **712 identical, 6 differ, 0 missing**. The 6 are the
`general-fr` / `general-es` 502 entries, where the dump records the raw `ArgumentError` from rack-test and the capture records
Passenger's HTML error page. So the fork clone at `e1ca5c4` (2.7.0) with the gem at `713ebbb` is exactly what the 2.7.0 image serves, and
either capture can serve as the oracle for the TypeScript conformance suite.
