# `src/core` — port of calendarium-romanum

TypeScript port of the **Lumen-de-Lumine fork of `calendarium-romanum`, v2.1.0 (`713ebbb`)**, kept
close enough to the Ruby that the two can be read side by side. Every file starts with a
`// ruby: <path>` comment, and individual methods carry `ruby:` notes where the translation is not
obvious.

Zero runtime dependencies. No `Date` object is used anywhere except inside `CalDate.today()`.

## Ruby → TypeScript file map

| Ruby (`lib/calendarium-romanum/`) | TypeScript (`src/core/`) | Notes |
|---|---|---|
| — | `cal-date.ts` | `CalDate` + `DateRange`, replacing Ruby's stdlib `Date` and `Range<Date>` |
| `abstract_date.rb` | `abstract-date.ts` | |
| `errors.rb` | `errors.ts` | plus `ArgumentError` and `InvalidLocaleError`, which Ruby gets from the stdlib / the `i18n` gem |
| `i18n_setup.rb` (+ the `i18n` gem, + `church-calendar-api`'s `Fallbacks`) | `i18n.ts` | `i18n.t` / `locale` / `withLocale`, `%{}` interpolation, fallback to `:en` |
| `ordinalizer.rb` (+ the `roman-numerals` gem) | `ordinalizer.ts` | `toRoman` is inlined |
| `enum.rb` | `enum.ts` | `createEnum()` replaces the class-body `values(index_by:)` DSL |
| `rank.rb` | `rank.ts` | the inverted comparison, with `gt/gte/lt/lte` helpers |
| `enums.rb` | `enums.ts` | `Colour(s)`, `Season(s)`, `Ranks`, `LECTIONARY_CYCLES` |
| `util.rb` | `util.ts` | `DateEnumerator`, `Year`, `Month`. `DateParser` is **not** ported (CLI-only) |
| `day.rb` | `day.ts` | `Day` **and** `Celebration`, as in Ruby, plus the lectionary-cycle helpers `Calendar` re-exposes |
| `temporale/dates.rb` | `temporale/dates.ts` | |
| `temporale/celebration_factory.rb` | `temporale/celebration-factory.ts` | |
| `temporale/extensions/*.rb` | `temporale/extensions/*.ts` | `+ types.ts` for the `#each_celebration` duck type, `+ index.ts` for the name→extension lookup `CalendarRepository` needs |
| `temporale.rb` | `temporale.ts` | `#ferial` is public here — `Calendar` reaches into it with `send` in Ruby |
| `sanctorale.rb` | `sanctorale.ts` | |
| `sanctorale_loader.rb` | `sanctorale-loader.ts` | `+ parseFrontMatter`, a dependency-free stand-in for `YAML.load` |
| `sanctorale_factory.rb` | `sanctorale-factory.ts` | filesystem paths become file *contents* |
| `data.rb` | `data.ts` | reads `src/data/sanctorale-files.ts` instead of `data/*.txt` |
| `transfers.rb` | `transfers.ts` | |
| `calendar.rb` | `calendar.ts` | |
| `perpetual_calendar.rb` | `perpetual-calendar.ts` | |
| `calendarium-romanum.rb` | `index.ts` | re-exports everything |
| `cli.rb`, `version.rb` | — | out of scope |

## Naming conventions

- Ruby `snake_case` → TS `camelCase`; `#foo?` → `isFoo()` (or `fooP()` where a property of the same
  name already exists, e.g. `Celebration#hasVigil` / `#hasVigilP()`).
- Ruby `#[]` → `at()` (`Sanctorale`, `Calendar`, `PerpetualCalendar`); `Temporale#[]` and
  `Temporale#get` are both `get()`.
- Ruby `Symbol` → TS `string` throughout (`Celebration#symbol`, `Colour#symbol`, `Season#symbol`,
  `Celebration#cycle`).
- `#==` → `equals()`. `Celebration`/`Day` additionally have `equalsStrict()`, because Ruby's `#==`
  carries a bug — see `docs/QUIRKS.md` Q14.
- `Hash` keyed by `AbstractDate` → `Map` keyed by `AbstractDate#key` (`month * 100 + day`); `Hash`
  keyed by `Date` → `Map` keyed by `CalDate#dayNumber`. Insertion order is preserved either way.

## Where the data comes from

`src/data/` is **generated** by `scripts/sync-data.mjs` from the read-only Ruby clones next to this
package, and must never be hand-edited:

- `sanctorale-files.ts` — verbatim text of all 17 `data/*.txt` files, keyed by siglum;
- `locales.ts` — the six `config/locales/*.yml` tables plus the `Locale` type;
- `calendars-config.ts` — `church-calendar-api`'s `config/calendars.yml` with anchors and `<<` merge
  keys resolved and the top-level key order preserved (`GET /calendars` returns exactly that order).

## Reading order

`cal-date.ts` → `enums.ts`/`rank.ts` → `day.ts` (`Celebration`) → `temporale/dates.ts` →
`temporale.ts` → `sanctorale.ts` → `transfers.ts` → `calendar.ts`. `Calendar#celebrationsFor` is
where the two cycles meet and is the single most quirk-dense method in the library.
