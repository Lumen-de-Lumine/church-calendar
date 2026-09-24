# QUIRKS — behaviour reproduced on purpose

Every entry below is a place where **calendarium-romanum (Lumen-de-Lumine fork v2.1.0, `713ebbb`)**
does something surprising, wrong, or merely non-obvious, and where this port reproduces it rather than
fixing it. `docs/ARCHITECTURE.md` goal 4: *"Do not 'improve' liturgical logic in the port"* — the
Ruby 2.7.0 service is the spec, and the baseline fixtures in `test/fixtures/baseline/` are the
pass/fail criterion.

Each entry gives the Ruby file and line, what the TypeScript port does, and — where they differ — why.
Fixing any of these is a deliberate, tracked behaviour change, not a bug fix.

Legend: **REPRODUCED** = the TS behaves identically. **DEVIATION** = the TS deliberately differs
(always with a reason, and always invisible in the API response).

---

## Q1 — `Rank#<=>` is inverted: "greater" rank means smaller number — REPRODUCED

`lib/calendarium-romanum/rank.rb:45-47`

```ruby
def <=>(other)
  other.priority <=> priority
end
```

`Ranks::TRIDUUM` (1.1) is therefore *greater than* `Ranks::FERIAL` (3.13), and
`rank_a >= rank_b` reads as "a outranks or ties b". Every comparison in `Calendar`, `Transfers` and
`Temporale#ferial` depends on this.

**TS**: `Rank#compare(other)` returns `sign(other.priority - this.priority)`, with `gt/gte/lt/lte`
helpers named so the inversion cannot be applied twice by mistake (`src/core/rank.ts`).

Related: `Ranks::MEMORIAL_GENERAL` is written `Rank.new(3.10, ...)` in `enums.rb:110`, and the Ruby
literal `3.10` **is the number 3.1**. The API's `rank_num` for an obligatory memorial is `3.1`, not
`3.10`. `src/core/enums.ts` writes `new Rank(3.1, 'rank.3_10', ...)` to make that impossible to miss.

> **For the api layer:** `Ranks::COMMEMORATION.priority` is `4.0`, and the Ruby service
> serializes it **as `4.0`** — `Rank#priority` is a Ruby `Float` and `Float#to_json` always prints a
> decimal point. `JSON.stringify(4)` gives `4`, which is two bytes short, so `src/http/json.ts`
> formats `rank_num` itself. This corrects the note in `test/fixtures/baseline/README.md` ("Known
> defects and oddities", item 5), which was read off the *parsed* fixtures; see **Q18** for the
> evidence (`GET /us/1999/12/31` is 539 bytes, not 537) and for why `3.10` is NOT affected.

## Q2 — `Celebration#change` uses `||`, so `false`/`nil` keep the receiver's value — REPRODUCED

`lib/calendarium-romanum/day.rb:288-300`

```ruby
has_vigil || self.has_vigil,
has_evening || self.has_evening,
move_if_sunday || self.move_if_sunday,
```

`#change` can turn these flags **on** but never **off**. A vigil celebration derived from
`nativity` (`Calendar#vigil_on`) therefore still carries `has_vigil == true`. Note that `''` and `0`
are truthy in Ruby, so only `nil`/`false` fall through to the receiver's value.

**TS**: `src/core/day.ts` `keep()` treats exactly `undefined`, `null` and `false` as "keep", and
passes `''`/`0` through.

The kept title is `self.title`, which CALLS a Proc title: a copy made by `#change` (the
commemorations, the `immaculate_heart` optional memorials) carries a plain string in the locale
current when `#change` ran. The TS keeps `this.title`, the evaluated string, likewise.

## Q3 — `Sanctorale#[]` returns the stored array, and `Calendar#day` pushes onto it — DEVIATION

`lib/calendarium-romanum/sanctorale.rb:143-146` returns `@days[adate] || []` — the array itself, not a
copy. `Calendar#celebrations_for` (`calendar.rb:328`) can return that very array unchanged
(`return st`), and `Calendar#day` (`calendar.rb:208`) then does `celebrations.push(vigil)`.

In Ruby, **a request with `vigils: true` for a day whose sanctorale entry outranks the temporale and
whose next day has a vigil permanently appends the vigil to the stored sanctorale data**, so the
second request for the same date would return the vigil twice. (The Ruby service does not visibly
suffer from it: `Sanctorale#[]` only escapes uncopied through the `return st` branch, which requires
a strictly-higher-ranked, non-optional sanctorale celebration, and no such day is followed by a
vigil-bearing day in the General Roman or US calendars.)

**TS**: `Calendar#celebrationsFor` returns `st.slice()` in that branch, so stored arrays are never
mutated. `Sanctorale#at()` still returns the stored array, exactly like Ruby, and is documented as
read-only. This is the only deviation that changes anything about *how* the library behaves under
repeated calls; it cannot change a single response body.

## Q4 — `Calendar#celebrations_for`: the branch order is the specification — REPRODUCED

`lib/calendarium-romanum/calendar.rb:297-348`. In order:

1. a **transferred** solemnity short-circuits everything (`return [tr]`);
2. **Saturday** in Ordinary Time with nothing (or only optional memorials) and a temporale rank of
   MEMORIAL_OPTIONAL-or-lower gets the BVM memorial appended;
3. otherwise, on a **Sunday**, sanctorale celebrations with `move_if_sunday` are *rejected*;
4. otherwise, on a **Monday**, yesterday's `move_if_sunday` celebrations are appended;
5. a temporale celebration of rank MEMORIAL_OPTIONAL (Thanksgiving) is pushed into the sanctorale list
   and replaced by the ferial;
6. if the first sanctorale celebration outranks the temporale one, it wins — but an *optional*
   memorial gets the temporale celebration unshifted in front of it;
7. a FERIAL_PRIVILEGED temporale day turns memorials into **commemorations** in the ferial's colour;
8. the `immaculate_heart` special case demotes everything to optional memorials and prepends a ferial.

Steps 2–4 are an `if/elsif/elsif`: a Saturday can never also take the Monday branch, and the Sunday
rejection does not apply on any other day. `src/core/calendar.ts` mirrors it statement for statement.

## Q5 — `Transfers`: on equal ranks the TEMPORALE celebration is the loser — REPRODUCED

`lib/calendarium-romanum/transfers.rb:36`

```ruby
loser = [tc, sc.first].sort_by(&:rank).first
```

With `Rank#<=>` inverted (Q1), `sort_by(&:rank)` puts the *lower*-ranked celebration last, so
`.first` is the higher-ranked one — the code takes the **winner** and calls it the loser. For unequal
ranks this means the *lower*-ranked celebration stays put and the *higher*-ranked one is moved; for
equal ranks, MRI's sort of a 2-element array performs exactly one comparison and swaps only on a
positive result, so `[tc, sc]` order is preserved and `tc` (temporale) becomes the loser.

Verified against the Ruby service over HTTP, calendar `us`:

| date | what the service returns |
|---|---|
| 2022-06-24 | `[sacred_heart 1.3]` — the temporale solemnity keeps the day |
| 2022-06-25 | `[sacred_heart 1.3]` — **again**, as the transferred "loser" |
| — | `baptist_birth` (equal rank 1.3) disappears from 2022 entirely |

And the unequal-rank case, also `us`:

| date | what the service returns |
|---|---|
| 2024-03-25 | `lent_holy_monday` (1.2) — Monday of Holy Week |
| 2024-04-08 | `annunciation` (1.3) — the forward search skips the whole of Holy Week and the Easter octave |

`test/core/service-facts.test.ts` pins both. `src/core/transfers.ts` writes the tie as
`tc.rank.compare(sc[0].rank) > 0 ? sc[0] : tc`.

Two further details of the same class:

- the destination search is **forward only** — `begin transfer_to = transfer_to.succ end until
  valid_destination?` — and has no upper bound, so a solemnity can in principle walk out of the
  liturgical year and raise `RangeError` from `Temporale#get`;
- `concretize_abstract_date` (`transfers.rb:72-79`) tries `year + 1` first and falls back to `year`,
  which the Ruby comment itself admits "probably doesn't work well" in the grey zone between the
  earliest and latest possible first Advent Sunday (Nov 27 – Dec 3). No packaged calendar has a
  sanctorale solemnity there;
- `sanctorale.solemnities.keys` is a Ruby Hash in insertion order, but the list is `.sort`ed as
  `Date`s before use, so the resulting order is fully determined. The TS sorts by `dayNumber`.

## Q6 — `Calendar#day` with `vigils: true` mutates the celebration list and swallows RangeErrors — REPRODUCED (minus the stdout noise)

`lib/calendarium-romanum/calendar.rb:205-221`. The vigil is taken from **tomorrow's** celebrations
(the first one with `has_vigil`) and the evening Mass from **today's** (the first with `has_evening`),
retitled through a Proc:

```ruby
I18n.t("#{c.cycle.to_s}.solemnity.#{symbol}")
```

Note the **cycle prefix**: a temporale vigil resolves `temporale.solemnity.nativity_vigil`, a
sanctorale one `sanctorale.solemnity.assumption_vigil`, and only `en.yml` defines the `sanctorale`
scope at all — every other locale reaches those titles through the fallback to `:en` (Q11).

Ordering matters and is preserved: the day's own celebrations, then the vigil, then the evening Mass.
Vespers are computed **before** the vigil is appended, so the vigil never influences them.

`RangeError`s from either lookup are rescued and the day is returned without them. Ruby prints
`ERROR: range error when generating vigils for date: ...` to **stdout**; a library has no business
writing to stdout, so the TS swallows it silently (no observable difference — the message never
reached the HTTP response).

## Q7 — `first_vespers_on`, and the first-Advent-Sunday fallback — REPRODUCED

`lib/calendarium-romanum/calendar.rb:350-368`. First Vespers are offered only when tomorrow's first
celebration is a solemnity-or-higher, an unprivileged Sunday, or a feast of the Lord *falling on a
Sunday*; `ash_wednesday` and `good_friday` are then excluded by symbol, and the celebration must
either outrank today's first celebration or be `easter_sunday` (which is how Holy Saturday gets first
Vespers of Easter despite being a Triduum day itself).

On the **last day of the liturgical year**, `celebrations_for(date + 1)` raises `RangeError`;
`calendar.rb:199-203` catches it and substitutes `CelebrationFactory.first_advent_sunday` — title
"1st Sunday of Advent", rank `PRIMARY` (1.2), colour violet, **symbol `nil`**. Unlike every other
factory method, this one builds its title eagerly rather than through a Proc, so it is localized at
the moment `Calendar#day` calls it. Verified against the Ruby service for `us` 2026-11-28.

## Q8 — `Temporale#ferial`: ids, ranks and the arithmetic behind them — REPRODUCED

`lib/calendarium-romanum/temporale.rb:357-412`.

- **ids** (`Celebration#symbol`) are generated from the *English* weekday name regardless of the
  current locale (`I18n.t("weekday.#{date.wday}", locale: :en).downcase`):
  `advent_<weekday>_december<n>`, `christmas_octave_<n>`, `pre_epiphany_<weekday>_january<n>`,
  `post_epiphany_<weekday>_january<n>`, `lent_holy_<weekday>`. Every other ferial and every Sunday
  has `symbol == nil`, which the API serializes as `"id": null`.
- `post_epiphany_*` ids — and the FERIAL_PRIVILEGED rank and `ferial_with_day` title that come with
  them — are produced **only when Epiphany is not transferred to a Sunday**. With
  `transfer_to_sunday: [epiphany]` (every `us*` calendar) the days after Epiphany are plain FERIALs
  with no id. The Ruby spec `day_spec.rb`/`celebration_spec.rb` still expects the pre-fork title
  "Saturday after Epiphany", rank 3.13 and a nil symbol for 2000-01-08; the fork returns
  "Saturday after Epiphany: January 8", rank 2.9 and `post_epiphany_saturday_january8`.
- the Lent branch ends with `rank = FERIAL_PRIVILEGED unless rank > FERIAL_PRIVILEGED`, i.e. Holy Week
  keeps PRIMARY and every other Lenten weekday is promoted to 2.9.
- the ordinal is computed **before** the branch that decides whether it is used, so
  `Ordinalizer.ordinal(0)` is evaluated for Lent week 0 and Christmas week 0. In `:la`/`:it` that
  calls `RomanNumerals.to_roman(0)`, which returns an empty string. `src/core/ordinalizer.ts`
  reproduces that.
- `Temporale#season_week` (`temporale.rb:270-291`) relies on Ruby's **floored** integer division:
  `date_difference(date, week1_beginning) / WEEK` is negative before the season's first Sunday, and
  `-4 / 7 == -1` in Ruby (`0` in JavaScript), which is what puts Christmas Day and Ash Wednesday in
  week 0. Ordinary Time adds 1, and after Pentecost the week is counted **backwards** from the next
  first Advent Sunday (`week = 34 - weeks_after_date`, `week += 1 if date.sunday?`).
  `src/core/temporale.ts` uses `Math.floor` throughout.

## Q9 — `Sanctorale#update` raises `Duplicate celebration symbols: [nil]` for symbol-less celebrations — REPRODUCED

`lib/calendarium-romanum/sanctorale.rb:215-233`. `rebuild_symbols` adds `celebration.symbol` to the
registry without checking for `nil`, so **any two celebrations without a symbol anywhere in the data**
make `#update` (and therefore `SanctoraleFactory.create_layered`) fail. A known defect: it makes it
impossible to layer two calendars that each contain an anonymous celebration.

No packaged data file is affected — every record in all 17 files carries a symbol.

Also note the check runs **at the very end** of `#update`, so when it fires the receiver is already
half-merged and left in an inconsistent state (the Ruby spec asserts exactly that).

**TS**: same behaviour, message `Duplicate celebration symbols: [null]` (JSON spelling of the same
value; the Ruby message says `[nil]`). Ruby raises `ArgumentError`; the TS raises the
`ArgumentError` class added in `src/core/errors.ts`, since JavaScript has no equivalent built-in.

## Q10 — `universal-fr` and `universal-es` cannot be loaded at all — REPRODUCED

`data/universal-fr.txt` lines 183 and 185, `data/universal-es.txt` lines 183 and 185 both declare
`5 faustina_kowalska` twice under `= 10`. `Sanctorale#add` (`sanctorale.rb:66-72`) raises on the
duplicate symbol, and the error is *not* wrapped by `SanctoraleLoader` (the `rescue` only covers
`load_line`, not `dest.add`), so it propagates out of `Data['universal-fr'].load`.

The Ruby API surfaces this as an HTTP **502** for the `general-fr` and `general-es` calendars —
confirmed by `test/fixtures/baseline/days/general-fr/2026.json`:

```json
{ "status": 502, "body": "<h1>Incomplete response received from application</h1>" }
```

The data is deliberately **not** fixed. The TS raises `ArgumentError` with
`Attempted to add Celebration with duplicate symbol "faustina_kowalska"` (Ruby's message ends
`:faustina_kowalska`, the Symbol inspect form; the TS uses the JSON string form consistently
everywhere it prints a symbol).

## Q11 — i18n: fallbacks, missing keys, Procs and quoted numeric keys — REPRODUCED

- `lib/church-calendar.rb:12` mixes `I18n::Backend::Fallbacks` into the Simple backend, so a key
  missing in the requested locale falls back to `I18n.default_locale` (`:en`). **The gem alone does
  not do this** — `i18n_setup.rb` only extends the load path — so calendarium-romanum's own specs
  (and the regression dumps under `spec/regression_dumps/`) see `"translation missing: la.…"` where
  the service returns English. The service is the authority and it has the fallbacks: for
  `general-la` 2026-01-07 it returns `"Feria quarta after Epiphany: January 7"` — a Latin weekday
  interpolated into the English template — which is exactly what this port produces.
  This is not decoration:
  `la.yml` and `it.yml` have no `sanctorale:` scope at all, `la.yml` has no
  `christmas.after_epiphany.ferial_with_day` and no `extension.thanksgiving`, and only `la.yml` and
  `en.yml` have the Holy Thursday titles. Every one of those is served from `:en`.
- `I18n.t` of a key missing *everywhere* returns the string
  `"translation missing: <requested locale>.<key>"` — the **originally requested** locale, not the
  last fallback tried. (`i18n` 0.9.5, lowercase "translation missing".)
- Celebration titles built from a `Proc` (`celebration_factory.rb:35`) are evaluated on every
  `#title` call, which is what lets one `Celebration` instance — `Temporale.celebrations` builds them
  once at class-definition time and shares them across every `Temporale` — render in a different
  language per request. `CelebrationFactory.first_advent_sunday` is the one exception: its title is a
  plain String, localized when the factory method runs.
- Locale files use quoted numeric keys (`'1_1'`, `'0'`). Note the mismatch between the rank *number*
  and the *key*: `Ranks::MEMORIAL_GENERAL` has priority `3.1` but its description key is `rank.3_10`.

**TS**: `src/core/i18n.ts` — fallback chain `[locale, 'en']`, same placeholder string, `%{name}`
interpolation, `withLocale`. A key that resolves to a sub-tree rather than a string is treated as
missing (Ruby would return the Hash; nothing in either project does that).

## Q12 — temporale *extensions* produce **sanctorale**-cycle celebrations — REPRODUCED

`temporale/extensions/thanksgiving_us.rb:18-23` and
`temporale/extensions/christ_eternal_priest.rb:19-23` both call `Celebration.new(...)` directly
instead of `Temporale.create_celebration`, and `Celebration`'s `cycle` argument defaults to
`:sanctorale` (`day.rb:139`). So Thanksgiving and Christ Eternal Priest report `cycle == :sanctorale`
even though they live in the temporale.

Invisible in the API response (`cycle` is not serialized), but it *would* matter if either ever grew
a vigil, because `Calendar#vigil_on` builds its i18n key from `c.cycle` (Q6).

`temporale_spec.rb`'s "properly setting cycle" example only checks a `Temporale` built without
extensions, so it never catches this.

## Q13 — `Dates.easter_sunday` is the `easter` gem's algorithm, not the true computus — REPRODUCED

`temporale/dates.rb:63-87`, copied from <https://github.com/jrobertson/easter>. It disagrees with the
Gregorian computus in **32 years between 1583 and 2500**, always by moving an early Easter (March
22–28) to late April. The first divergence at or after 1900 is **Easter 2209** (the algorithm says
April 23; the true date is March 26); the next are 2228, 2247, 2266, 2285, 2315, 2334, 2353, 2372,
2391, 2418, 2437, 2456, 2475, 2494.

Between 1900 and 2208 the algorithm is correct, which is verified day-by-day in
`test/core/dates.test.ts` against the Meeus/Jones/Butcher algorithm.

Ported verbatim, including Ruby's floored `/` and floored `%` (`3 - 11*g + s - l` is negative, and
`-100 % 30` is `20` in Ruby but `-10` in JavaScript — getting this wrong moves Easter), and including
`difference += 7 if difference < 0`, which is dead code because `%` already floors.

## Q14 — `Celebration#==` is an assignment, not a comparison — REPRODUCED, with an escape hatch

`lib/calendarium-romanum/day.rb:230-241`

```ruby
def ==(b)
  self.class == b.class &&
    ...
    move_if_sunday = b.move_if_sunday   # `=`, not `==`
end
```

Ruby parses the last operand as `(move_if_sunday = b.move_if_sunday)`, so the whole expression
evaluates to `b.move_if_sunday` — **two otherwise identical celebrations are not equal unless the
right-hand operand has `move_if_sunday` set**, which is false for all but one record in the packaged
data (`us-en.txt`'s `unborn_children`). `Day#==` compares celebration arrays and inherits the bug.

Confirmed under `ruby 4.0.1`. This is the direct cause of several of the upstream suite's failures
(`celebration_spec.rb` "#== same content", `day_spec.rb` "#== same content", the
`an_object_eq_to(celfactory.saturday_memorial_bvm)` expectations in `calendar_spec.rb`).

Nothing in the API response path uses celebration equality, so it never shows in a response.

**TS**: `Celebration#equals` reproduces it exactly, and `Celebration#equalsStrict` (plus
`Day#equalsStrict`) provides the structural comparison the code clearly meant. The ported specs use
`equalsStrict` wherever the Ruby intent was structural, and pin the buggy behaviour explicitly in
`test/core/day.test.ts`.

## Q15 — `Day.new` can no longer be called without a date — REPRODUCED

`lib/calendarium-romanum/day.rb:16-31` documents every argument as nullable, but the fork added

```ruby
cycles = Calendar.lectionary_cycles_for_date date
...
if date.cwday == 7
```

to the constructor, so `Day.new` with no arguments raises `NoMethodError` on `nil`. `day_spec.rb`'s
"works without arguments" and "makes a shallow copy of celebrations" examples are stale.

**TS**: `DayArgs.date` is required. The ported spec asserts that a missing date throws.

## Q16 — small deliberate divergences with no observable effect

| # | Ruby | TypeScript | Why |
|---|---|---|---|
| a | `Date.new(2015, 2, 29)` raises `ArgumentError('invalid date')` | `new CalDate(2015, 2, 29)` throws `RangeError('invalid date')` | the Core API contract specifies `RangeError`; the message is identical, so the api layer can map it to the same Grape error. `calendar_spec.rb` asserts `ArgumentError` for `Calendar#day(2, 29)` |
| b | `Sanctorale#add` error text interpolates `#<CalendariumRomanum::AbstractDate:0x…>` | `#<AbstractDate 1/13>` via `AbstractDate#toString` | Ruby prints a useless object id; no spec or fixture checks the text |
| c | symbols print as `:antonius` (`Symbol#inspect`) | `"antonius"` (JSON string) | `Celebration#symbol` is a `string \| null` in TS; used consistently in every error message |
| d | `Util::DateParser` exists | not ported | only `lib/calendarium-romanum/cli.rb` uses it, and the CLI is out of scope. The api layer has its own date parsing |
| e | `Temporale.liturgical_year` constructs a whole `Temporale` just to read `#first_advent_sunday` | calls `Dates.firstAdventSunday(year)` directly | identical result (`first_advent_sunday` is not a transferable solemnity), without building 19 celebrations per call |
| f | movable-feast dates are recomputed on every call | memoized per `Temporale` instance | pure functions of `year` + `transfer_to_sunday`; a full year is ~40× fewer allocations |
| g | `Calendar#freeze`, `Sanctorale#freeze` | not ported | Ruby's `freeze` semantics have no JavaScript equivalent that buys anything; the port is immutable by construction |
| h | `Enum`, `#each`, `#to_s`, `#inspect`, `Enumerator` return values | TS iterables / `toString()` | Ruby-specific API surface; the ported specs skip these with a comment |
| i | `CelebrationFactory` defaults `fixed_date:` to **`false`**, so `Celebration#date` is `false` (not `nil`) for temporale celebrations without a fixed date | `date` is `null` | `celebration_factory.rb:32`. Only observable through `#to_s`/the regression dumper, which prints the literal `false` in the `<m/d>` column. `#change`'s `date \|\| self.date` and `#==`'s `date == b.date` behave identically for `false` and `nil`, and `date` is never serialized |

---

## Verification

`src/core` was checked against two independent sources of ground truth:

1. **The captured baseline** (`test/fixtures/baseline/`) — every serialized day of calendars `us`,
   `us-ascension`, `general-en` and `general-la` for **1970–2100**, all 23 loadable calendars for
   2025–2027, the `cs`/`en`/`fr`/`it`/`la` language captures, and the single-day and per-year
   captures. All ~212 000 days matched the Ruby service's JSON exactly.
2. **Ruby regression dumps** generated from the gem itself (`spec/regression_dumps/` on a local test
   branch of the fork) — `us` 2020–2030 and `general-la` 2029–2030 day dumps, and the `us` and `general-la`
   solemnity-transfer maps for **2000–2100** (101 liturgical years each). Identical apart from the two
   documented artefacts of running the gem outside church-calendar-api: the `false` date column
   (Q16i) and the absent i18n fallbacks (Q11).

Both checks were run as throwaway tests; the durable versions live in `test/core/service-facts.test.ts`
(the specific dates) and in the conformance suite (the full fixture sweep).

---

# API / HTTP layer (Q17+)

Q1–Q16 above are `src/core` (the calendarium-romanum port). What follows is
`src/api` and `src/http` — the port of **church-calendar-api 2.7.0** itself:
Grape, Roda, Oj/MultiJson, rack-cors, `Rack::ResponseHeaders` and the
`ordinalize_full` gem.

Same legend: **REPRODUCED** = the TypeScript behaves identically.
**DEVIATION** = it deliberately differs, always with a reason.

Everything here was verified against the shipped image, either by driving the
real Rack stack in-process —

```sh
docker run --rm -v ./probe.rb:/tmp/probe.rb sourceandsummit/church-calendar-api:2.7.0 \
  bash -lc 'cd /home/app/webapp && bundle exec ruby /tmp/probe.rb'
# probe.rb: Rack::Builder.parse_file('/home/app/webapp/config.ru') + Rack::Test
```

— or with `curl` against the same image run as a server
(`docker run --rm -p 9292:80 sourceandsummit/church-calendar-api:2.7.0`).

## Q17 — `x-powered-by: Phusion Passenger(R)` — DEVIATION (dropped)

The Ruby service advertises its application server on every response. The
port emits no such header (and no `server:` header either); `bin/server.mjs`
relies on `node:http`, which adds only `Date`, `Connection` and `Keep-Alive`.

It describes the web server, not the API, so
`test/fixtures/baseline/misc/headers.json` is asserted with the web-server
headers (`date`, `connection`, `status`, `transfer-encoding`,
`content-encoding`, `age`, `server`, `x-powered-by`) excluded.

## Q18 — `rank_num` is a Ruby **Float**, so a commemoration is `4.0` — REPRODUCED

`Rank#priority` is a Float and `Float#to_json` always prints a decimal point:

```
GET /api/v0/en/calendars/us/1999/12/31   ->   539 bytes
...,"rank":"commemoration","rank_num":4.0,"id":"sylvester_i"},...
```

With `4` instead of `4.0` the same body is **537** bytes. `JSON.stringify(4)`
produces `4`, so the naive formatter is two bytes short on every day that
carries a commemoration.

> **This corrects `docs/BASELINE.md` and `test/fixtures/baseline/README.md`**,
> both of which state that `COMMEMORATION` "serializes as `4`, not `4.0`". They
> were read off the *parsed* fixtures, where `JSON.parse('4.0')` is already `4`;
> the fixtures' `bytes`/`sha256` fields are the authority and they say `4.0`.
> The fixtures themselves are correct and were not edited.

`src/http/json.ts` keeps a `RUBY_FLOAT_KEYS` set (`rank_num`, and nothing else —
`season_week`, `cycle_ferial`, `promulgated`, `effective_since` and
`ferial_lectionary` are Ruby Integers) and formats those with `rubyFloat()`.
`3.10` is *not* affected: the Ruby literal `3.10` **is** 3.1, and `3.1.to_json`
is `"3.1"` (Q1).

`serializeCelebration` still returns the JavaScript number `4`, so a library
consumer sees exactly what `JSON.parse` of the HTTP response gave it.

## Q19 — `weekday` is never localized — REPRODUCED

`apps/api/v0/entities/day.rb` holds a private `WDAYS = %w{sunday monday ...}`
and indexes it with `object.date.wday`. `/api/v0/cs/...` therefore still answers
`"weekday":"friday"`. `src/api/entities.ts` exports the same frozen table.

## Q20 — `ordinalize_full` stops at 100, and raises above it — REPRODUCED

The gem (v1.5.0) is an i18n lookup of `ordinalize_full.n_<number>` and its
`en.yml` ends at `n_100`. `I18n.t(..., throw: true)` for a missing key throws
`:exception`, which surfaces as an `UncaughtThrowError` (an `ArgumentError`),
which the gem rescues and re-raises as
`NotImplementedError: Unknown locale <locale>`. Verified inside the image:

```
100 -> "one-hundredth"
101 -> NotImplementedError: Unknown locale en
199 -> NotImplementedError: Unknown locale en
  0 -> NotImplementedError: Unknown locale en
```

**There is no `one-hundred-and-first`.** A title containing `101st` would 502 the
Ruby service; none does — the largest ordinal in any packaged title is
`34th` (the 34th week in Ordinary Time), and the largest reachable through the
`\b(\d+)(?:th|st|nd|rd)` regex in any locale's data is the same.

`src/api/ordinalize-full.ts` ships the gem's `en`, `fr` and `it` tables verbatim
for 1..100 (including `it`'s `venticinque` for 25 and `ventiduesima` for 22, and
`fr`'s `vingt-et-unième`) and throws `OrdinalizeError('Unknown locale <locale>')`
outside that range, which `src/http/router.ts` turns into the same 502 Passenger
would produce.

`cs` and `la` have no table in the gem; because church-calendar-api mixes
`I18n::Backend::Fallbacks` into the Simple backend (Q11), they resolve through
`:en` — verified: with `I18n.locale = :la`, `24.ordinalize_in_full` is
`"twenty fourth"`. The port's `TABLES[locale] ?? EN` does the same.

The gem's `:es` branch (which *composes* `vigésimo` + `segundo` and applies
gender/plurality) is **not ported**: `es` is not an accepted `lang`
(`ChurchCalendar::LANGS = [:cs, :en, :fr, :it, :la]`), so it is unreachable.

## Q21 — `Date.parse` is much bigger than the API surface — DEVIATION (subset)

`search?date=` / `?startDate=` / `?endDate=` and the `Date` request header all go
through Ruby's `Date.parse`, whose grammar (`Date._parse`) covers ISO 8601
ordinal and week dates, `--mm-dd`, day-of-year, VMS/SLA/DOT/JIS formats, era
names, `bc` and more. `src/api/dates.ts` implements the subset that is (a)
exercised by the fixtures and (b) reachable from the two consumers, and rejects
the rest with the same error the route would produce.

**Implemented** (each verified against the image):

| input | result |
|---|---|
| `2026-09-18`, `2026-9-8` | 2026-09-18 / 2026-09-08 |
| `2026-09-18T14:00:00.000Z`, `...+02:00` | 2026-09-18 (time discarded) |
| `2026/9/18`, `2026.9.18` | 2026-09-18 |
| `20260918`, `20260918T140000Z` | 2026-09-18 |
| `18 Sep 2026`, `18th Sep 2026`, `Sept 18 2026`, `Sep 18 2026`, `September 18, 2026`, `Friday, September 18, 2026` | 2026-09-18 |
| `Fri Sep 18 2026 10:00:00 GMT+0000 (Coordinated Universal Time)` (JavaScript's `Date#toString()`) | 2026-09-18 |
| `18/09/2026`, `18-09-2026`, `1-1-1` | day first; `1-1-1` is 2001-01-01 |
| `Sep 2026` | 2026-09-01 |
| `Sat, 01 Jan 2000 01:00:00 GMT` (RFC 1123) | 2000-01-01 |
| `Saturday, 01-Jan-00 01:00:00 GMT` (RFC 850) | 2000-01-01 |
| `Sat Jan  1 01:00:00 2000` (asctime) | 2000-01-01 |

and the two-digit-year rule (`< 69` → 20xx, `>= 69` → 19xx).

**Rejected, exactly as Ruby does**: `garbage`, `not-a-date`, `2026-13-01`,
`2026-02-30`, `2026`, `2026-09`, `0`, `12/25/2025`, `09/18/2026`, `20260931`,
`''`, `'   '`.

**Not implemented** (no fixture, no consumer; a request using one gets
`400 {"error":"date does not have a valid value"}` where Ruby would answer 200):
ISO ordinal dates (`2026-261`), ISO week dates (`2026-W38-5`), day-of-year
(`26261`), `--09-18`, era-qualified years, and the VMS (`18-SEP-2026`, which
*does* parse here as `18-09-2026` would not), JIS and `Date.parse('now')`-style
inputs; also year-first `2026 Sep 18`, `2026-09-18Z`, a signed `+2026-09-18`,
an ordinal day next to a hyphen (`2nd-Feb-2026`, which Ruby reads as February
1st), and a year-less `09/18` (Ruby fills in the current year). If one ever
turns up in a log, add a rule to `RULES` and a row to the table in
`test/api/dates.test.ts`.

## Q22 — `/swagger.yml` is served as `content-type: text/html` — REPRODUCED

`apps/web/controllers/web.rb` renders the ERB through Roda's `render`, which
leaves the response's default content type alone. The port sets `text/html` too.
`misc/headers.json` and `misc/web.json` both record it.

The body is the ERB template verbatim with five substitutions — the contact
e-mail from `config/parameters.yml` (the image ships the unedited
`email@example.com`), `request.uri('api-doc')` (absolute, built from the
request's scheme and host — `x-forwarded-proto` is honoured, so a service behind a TLS proxy
advertises `https://`), `CALENDAR_START`, the calendar ids and the
langs. It ends **without** a trailing newline, because the `.erb` file does.

## Q23 — an array-valued query parameter is a 500 → 502 — REPRODUCED

`?q[]=advent` (or `?q[x]=advent`) makes Rack hand Grape an `Array` (a `Hash`),
and `CalendarFacade#search_title` calls `query.downcase` on it:

```
NoMethodError: undefined method `downcase' for ["advent"]:Array
```

`?date[]=...` fails the same way inside `Date.parse`. The port throws a
`TypeError` with the same message from `src/http/router.ts`, which becomes the
same 502.

A plain repeated key is NOT an array: Rack 1.6.8's `parse_nested_query(qs, '&;')`
keeps the LAST value (`?q=a&q=b` searches for `b`), splits on `;` as well as `&`,
and gives a key without `=` the value nil, which the routes treat as absent
(`search?date` is a plain search from today). A query Rack cannot parse at all —
a stray `%`, or clashing types such as `q=a&q[]=b` — raises while Grape builds
`params`, so it is a 502 on every matched API route (a 404 route never parses
it, and neither does the web UI). `src/http/adapters/common.ts` ports the parser.

## Q24 — an uncaught exception is a **502**, not a 500 — REPRODUCED (body differs)

Nothing in the Ruby app rescues at the top level. An exception escapes Rack,
Passenger notices the truncated response and answers

```
502  <h1>Incomplete response received from application</h1>
```

Three request paths reach it: the two unloadable calendars (Q10), a `search` range
that reaches before 1970 (`RangeError` out of `Calendar`), and Q23. The port
answers 502 with that same one-line HTML body. Byte parity of a 502 body is not
attempted — Passenger's real page is longer and carries a request id — and the
conformance suite asserts status only, per `docs/ARCHITECTURE.md`.

There is no `content-type` difference to worry about: both are `text/html`.

## Q25 — the 301 `Location` is **relative** — REPRODUCED (and `absoluteRedirects` opts out)

`docs/BASELINE.md` says "absolute `Location`". The wire disagrees, both over
HTTP and in-process:

```
$ curl -sSD- -o/dev/null http://localhost:9292/api/v0/en/today
HTTP/1.1 301 Moved Permanently
...
Location: /api/v0/en/calendars/default/today
```

Grape's `redirect` does `header 'Location', url` with the path it was given, and
neither nginx nor Passenger rewrites it. `test/fixtures/baseline/misc/redirects.json`
records the relative form, so that is what the port emits by default.

`createHandler({ absoluteRedirects: true })` builds
`<x-forwarded-proto|http>://<x-forwarded-host|host><path>` instead, for a
deployment that wants RFC 7231's older absolute-URI form. The **body** always
carries the path only, exactly like Grape.

The path is built from DECODED segments, so `/api/v0/en/%E2%82%AC` redirects to
`.../default/€`. Ruby puts those raw UTF-8 bytes in `Location`; `node:http`
refuses a header value outside Latin-1 (and `fetch` any outside a byte string),
so the port percent-encodes controls and non-ASCII in `Location` only
(`.../default/%E2%82%AC`, which a client follows to the same place). The body
keeps the decoded path.

## Q26 — trailing slashes: Grape is lenient, Roda is strict — REPRODUCED

| request | 2.7.0 | why |
|---|---|---|
| `/api/v0/en/calendars/us/today/` | 200 | Mustermann ignores the trailing `/` |
| `/api/v0/en/calendars/` | 200 | same |
| `/api/v0/en/calendars/us/search/` | 200 | same |
| `/browse/` | 404 | Roda's `r.is` needs an EMPTY remaining path |
| `/browse/us/` | 404 | same |
| `/about/`, `/api-doc/` | 404 | same |
| `/browse/us/2026/9/` | 404 | same |
| `/style.css/` | 200 | `r.public` drops empty segments (GET only: `/style.css/foo`, `POST` and `HEAD /style.css` are 404s) |

`src/http/router.ts` strips trailing slashes only under `/api`, rejects them in
the web app, and checks `style.css` before that rejection.

Grape is lenient in two more ways the router copies. Its router squeezes repeated
slashes (`/api/v0//en/calendars` is a 200), but the path versioner reads the raw
path, so `/api//v0/...` is `404 {"error":"404 API Version Not Found"}`. And every
route ends in an optional `(.:format)` while every capture is `[^/?#.]+`, so only
the LAST segment may carry a dot, as `<value>.<format>` with any format:
`/calendars.json` and `/calendars.xml` are the calendar list, `/us/2026.5` is year
2026, and `/us/2026/9.0/18` matches no route (a bare 404).

## Q27 — Grape concatenates every validator's message — REPRODUCED

Not just every validator of one parameter, but every parameter of the route:

```
/api/v0/en/calendars/nope/abc
  -> "calendar does not have a valid value, year is invalid, year must be numeric,
      year invalid, the calendar has been effective only since 1970"
/api/v0/xx/calendars/nope
  -> "lang does not have a valid value, calendar does not have a valid value"
/api/v0/en/calendars/us/search/x        (`search` is read as :year, `x` as :month)
  -> "year is invalid, year must be numeric, year invalid,
      the calendar has been effective only since 1970,
      month is invalid, month does not have a valid value"
```

Two details worth keeping: the `regexp` validator runs against the **coerced**
value, so `/us/0970` fails it (`970.to_s` is three digits) while `/us/12345`
passes it (there is no upper bound at all, short of Q36); and a coercion failure does **not**
stop the later validators, which is why `abc` produces three year messages.
`src/http/router.ts`'s `Validator` class mirrors the order statement for
statement.

The coercion itself is Virtus calling Coercible 1.0's `String#to_integer`: an
integer literal with an optional sign is `to_i`, and anything else that looks
numeric is `to_f.to_i`. So `/us/+2026` is 2026 and `/us/2e3/1/1` is 2000-01-01,
while `/us/%202026` (a leading space) and `/us/1e400` (an infinite float) are
"year is invalid".

## Q28 — an empty string is TRUTHY in Ruby — REPRODUCED

Three places where a JavaScript `if (value)` would be wrong:

| request | 2.7.0 |
|---|---|
| `Date:` header present but blank | `400 {"error":"invalid content of HTTP header Date"}` |
| `search?date=` | `400 {"error":"date does not have a valid value"}` |
| `search?q=` | 200 with **every** day of the range (the filter runs and `include?('')` is true) |

The port tests for *presence* (`!== undefined`) everywhere the Ruby tests for
truthiness, and `CalendarFacade#searchTitle` skips the filter only for
`null`/`undefined`.

## Q29 — `search` with no parameters is clock-dependent — REPRODUCED

`search_title(nil, nil, nil)` defaults `startDate` to today and `endDate` to
`startDate + 365`, so `GET .../search` answers `200` with 366 days ending a year
from now. Reproduced, and asserted by shape (never by date) in
`test/conformance/misc.test.ts`.

## Q30 — CORS details — REPRODUCED, minus one empty header

rack-cors covers `/api/*` and `/swagger.yml` only.

* `vary: Origin` is emitted on those paths **always**, Origin or not;
* `access-control-allow-origin: *`, `access-control-allow-methods: GET` and
  `access-control-max-age: 1728000` only when the request carries `Origin` —
  including on 400s, 404s and 301s;
* the preflight (`OPTIONS` + `Origin` + `Access-Control-Request-Method`) is
  answered by rack-cors, the OUTERMOST middleware, so it never reaches
  `Rack::ResponseHeaders`: `200`, `text/plain`, `content-length: 0`, and **no**
  `cache-control` and **no** `vary`;
* with `headers: :any`, the preflight echoes `Access-Control-Request-Headers`
  back verbatim as `access-control-allow-headers`; a requested method other
  than GET (case-insensitive) gets the bare `text/plain` 200 with no allow
  headers at all;
* an `OPTIONS` without `Access-Control-Request-Method` is not a preflight and
  falls through to Grape's generated handler, which answers `204` with
  `allow: OPTIONS, GET, HEAD`, no body and no validation — with `cache-control`
  and `vary` present. Grape's 405 carries the same `allow`;
* the web UI (`/`, `/about`, `/style.css`, `/browse/...`) gets no CORS at all.

**DEVIATION**: rack-cors also emits `access-control-expose-headers: ""` (an
empty value). It does not survive to the wire — `misc/headers.json`, captured
through nginx, has no such header — so the port does not emit it.

## Q31 — `Cache-Control: max-age=3600` really is unconditional — REPRODUCED

`use Rack::ResponseHeaders { |h| h['Cache-Control'] = 'max-age=3600' }` in
`config.ru` wraps everything: 200s, the 301s, the 400 validation errors, the
bare `404 Not Found`, the 502s, the HTML pages and `/style.css`. The only
exception is the CORS preflight (Q30). Asserted for eight routes in
`test/http/router.test.ts`.

## Q32 — the per-request stdout line is dropped — DEVIATION (see Q6)

`Calendar#day(vigils: true)` prints
`ERROR: range error when generating vigils for date: <date>` whenever it touches
the last day of a liturgical year. Since `CalendarFacade` always passes
`vigils: true`, the Ruby service writes that line on **every** request for
the Saturday before the First Sunday of Advent and on every `search` or month
listing that spans it — a `search?startDate=2026-01-01&endDate=2026-12-31` emits
it once per call. The port stays silent; the response is identical, and
`test/conformance/deviations.test.ts` asserts nothing is written to stdout.

## Q33 — no `Day` is cached across calls; the parsed **data** is — DEVIATION (invisible)

`CalendarRepository#[]` in Ruby re-reads and re-layers the sanctorale on every
request, and the `PerpetualCalendar` it wraps lives exactly as long as the
request. That is the only reason BASELINE L4 does not leak from one
request into the next: the mutated `Sanctorale` is thrown away before a later request can observe it.

`CalendarRepository.get()` keeps the per-call `PerpetualCalendar`, so no `Day`
and no `Calendar` is shared between two calls. What it *does* keep is a
per-process cache of the parsed `Sanctorale` per siglum (`universal-en`,
`us-en`, ...), because:

* `SanctoraleFactory.createLayered` builds a new `Sanctorale` and copies every
  celebration array through `Sanctorale#replace` (`celebrations.slice()`), and
* `Calendar#celebrationsFor` returns `st.slice()` in the one branch where Ruby
  returns the stored array itself (Q3),

so nothing downstream can write to a cached instance. **Measured**: reloading
`universal-en` + `us-en` costs ~2 ms, against ~0.3 ms for the single-day request
that follows; over 20 `get('us')` calls the cache is consistently faster, which
`test/api/repository.test.ts` asserts. `new CalendarRepository({ cacheSanctorale: false })`
turns it off, and `test/conformance/deviations.test.ts` proves the two produce
identical output for a whole year and that a cached instance's arrays are
unchanged after a four-year sweep.

## Q34 — `file:` sanctorale sources are not supported — DEVIATION

`CalendarRepository#load_data` accepts `{'file' => 'name.txt'}` and reads it from
`data/`. This package embeds its data and has no filesystem, so a `file:` source
raises. No entry in `config/calendars.yml` uses one, and the Ruby path is
broken anyway for any file whose lines carry no ids (`docs/BASELINE.md`, fork suite failure #5).

## Q35 — small deliberate divergences with no observable effect

| # | Ruby | TypeScript | Why |
|---|---|---|---|
| a | the web UI is Haml + Bootstrap 3, byte-for-byte stable | hand-written HTML with the same links, headings and classes | `docs/ARCHITECTURE.md`: "Port the HTML minimally ... exact markup parity NOT required". Statuses, content types and redirects ARE asserted (`misc/web.json`), and `/style.css` is byte-identical |
| b | `/browse/:cal` shows `Time.now.year - 5 .. +10` | same | clock-dependent by design; not pinned |
| c | `config/parameters.yml` is read at boot | inlined as `PARAMETERS` in `src/http/web.ts` | the image ships the file unedited (`Example Joe` / `email@example.com`) and nothing writes it |
| d | Grape answers `OPTIONS` with `204` and no content-type | same | see Q30 |
| e | `HEAD /` is a 404 (Roda's `r.root` is GET-only) while `HEAD /api/...` is a 200 with no body (Rack::Head) | same | both asserted in `test/http/router.test.ts` |
| f | `POST /browse` 302s (`r.on` is not method-constrained) | same | asserted |
| g | Passenger/nginx gzip the HTML and YAML responses | no compression in `bin/server.mjs` | compression belongs in a reverse proxy in front of the server, not the app; `content-length` is then the uncompressed length, which the fixtures' `bytes` fields already are for the non-gzipped routes |
| h | `MultiJson.dump(obj, pretty: true)` via Oj | `src/http/json.ts`'s `formatPlain` / `formatEntity` / `formatEntityArray` / `formatError` | the same four shapes, byte for byte; see the module header and `test/conformance/json-bytes.test.ts` |

## Q36 — a year past 24 660 873 954 865 is refused — DEVIATION

Ruby's `Date` is a bignum, so any year of digits is served:
`/api/v0/en/calendars/us/30000000000000` answers 200. `CalDate` counts days in a
JavaScript number, which is exact only up to `Number.MAX_SAFE_INTEGER`; beyond
that `succ()` stops advancing, so the `Transfers` search and every date loop
would spin for ever and hang the (synchronous) process on one request.

`CalDate` therefore throws `RangeError('invalid date')` for a date whose day
number is not a safe integer. `/us/:year` and `/us/:year/:month` answer 502 for
such a year (an exception escaping the app, as in Q24); `/us/:year/:month/:day`
and `search?date=` answer the 400 they give any date that cannot be built. The
last year `/us/:year` serves is 24 660 873 954 865.
