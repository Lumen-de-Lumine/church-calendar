// ruby: lib/church-calendar/services/calendar_repository.rb
//
// The Ruby repository is deliberately stateless: `CalendarRepository#[]` loads
// the sanctorale data, layers it, builds a `PerpetualCalendar` and wraps it in a
// `CalendarFacade` **on every single request**. Nothing about a computed `Day`
// survives a request, which is exactly why the Ruby service never shows the
// vigil-duplication bug (BASELINE L4) that a long-lived
// process would.
//
// This port keeps that: `get(key)` always returns a FRESH `PerpetualCalendar`,
// so its per-liturgical-year `Calendar` cache lives and dies with the facade and
// no `Day` is ever shared between two calls.
//
// What it does NOT repeat is the parsing. See `SANCTORALE CACHE` below.

import { Data } from '../core/data.js';
import { PerpetualCalendar } from '../core/perpetual-calendar.js';
import { Sanctorale } from '../core/sanctorale.js';
import { SanctoraleFactory } from '../core/sanctorale-factory.js';
import { Extensions } from '../core/temporale/extensions/index.js';
import type { TemporaleExtension } from '../core/temporale/extensions/types.js';
import type { TemporaleOptions } from '../core/temporale.js';
import { CalendarFacade } from './calendar-facade.js';
import {
  CALENDAR_ENTRIES,
  CALENDAR_IDS,
  CALENDARS_METADATA,
  calendarConfig,
  hasCalendar,
} from './calendars-config.js';
import type { CalendarConfig, SanctoraleSource } from './calendars-config.js';
import { UnknownCalendarError } from './errors.js';

/*
 * SANCTORALE CACHE
 * ----------------
 * Parsing `universal-en.txt` + `us-en.txt` is ~2 ms; doing it on every request
 * would put a fixed 2 ms tax on a handler whose whole job (a single day) is
 * ~0.3 ms. A per-process cache keyed by siglum removes it.
 *
 * It is safe ONLY because nothing downstream mutates a loaded `Sanctorale`:
 *
 *   * `SanctoraleFactory.createLayered` builds a NEW `Sanctorale` and feeds it
 *     through `Sanctorale#update` -> `#replace`, which stores
 *     `celebrations.slice()` — a copy of every array (src/core/sanctorale.ts);
 *   * `Calendar#celebrationsFor` returns `st.slice()` in the one branch where
 *     Ruby returns the stored array itself, so `Calendar#day(vigils: true)` can
 *     no longer `push` a vigil into sanctorale-owned state (docs/QUIRKS.md Q3).
 *
 * Both are asserted in `test/conformance/deviations.test.ts` ("the repository and
 * facade never mutate src/data state"), which calls the same date repeatedly
 * through one and two facades and compares, and by its multi-year vigil tests.
 * If either invariant is ever broken, set `cacheSanctorale: false`.
 *
 * `general-fr` / `general-es` throw on load (Q10); the thrown error is cached
 * too, so the 502 is reproduced on every call without re-parsing 200 lines.
 */

export interface CalendarRepositoryOptions {
  /** Cache parsed sanctorale data per process (default `true`). */
  cacheSanctorale?: boolean;
}

type LoadResult = { ok: true; value: Sanctorale } | { ok: false; error: unknown };

const EXTENSIONS: Readonly<Record<string, TemporaleExtension>> = Extensions;

/** ruby: `ChurchCalendar::CalendarRepository`. */
export class CalendarRepository {
  private readonly cacheSanctorale: boolean;
  private readonly sanctoraleCache = new Map<string, LoadResult>();

  constructor(options: CalendarRepositoryOptions = {}) {
    this.cacheSanctorale = options.cacheSanctorale ?? true;
  }

  /** ruby: `def_delegators :@calendars, :keys` — config-file order. */
  keys(): readonly string[] {
    return CALENDAR_IDS;
  }

  /** ruby: `def_delegators :@calendars, :has_key?` */
  has(key: string): boolean {
    return hasCalendar(key);
  }

  /** ruby: `CalendarRepository#metadata` — the whole parsed `calendars.yml`. */
  get metadata(): Readonly<Record<string, CalendarConfig>> {
    return CALENDARS_METADATA;
  }

  /** Calendar definitions in config-file order (the web UI's picker needs both). */
  entries(): readonly { key: string; config: CalendarConfig }[] {
    return CALENDAR_ENTRIES;
  }

  /**
   * ruby: `CalendarRepository#[]`
   *
   * @throws {UnknownCalendarError} for an unknown id (ruby: `KeyError`)
   * @throws {ArgumentError} when the sanctorale data cannot be loaded — the
   *   `general-fr` / `general-es` 502 (docs/QUIRKS.md Q10)
   */
  get(key: string): CalendarFacade {
    const config = calendarConfig(key);
    if (config === undefined) throw new UnknownCalendarError(key);

    const data = config.sanctorale.map((spec) => this.loadData(spec));
    const sanctorale = SanctoraleFactory.createLayered(...data);
    const temporaleOptions = buildTemporaleOptions(config);

    const factory = new PerpetualCalendar({ sanctorale, temporaleOptions });
    return new CalendarFacade(factory, config);
  }

  /** Drops the per-process sanctorale cache (tests; a data hot-reload). */
  clearCache(): void {
    this.sanctoraleCache.clear();
  }

  /** ruby: the private `#load_data`. */
  private loadData(spec: SanctoraleSource): Sanctorale {
    if (spec.file !== undefined) {
      // ruby: `@sanctorale_loader.load_from_file File.join(@path, filename)`.
      // This package embeds its data and has no filesystem, so a `file:` source
      // cannot be honoured. No packaged calendar uses one.
      throw new Error(
        `Invalid data source specification ${JSON.stringify(spec)}: ` +
          'this package embeds its sanctorale data, so `file:` sources are not supported; ' +
          'use `packaged:`',
      );
    }

    const packaged = spec.packaged;
    if (packaged === undefined) {
      // ruby: `raise RuntimeError.new("Invalid data source specification ...")`
      throw new Error(`Invalid data source specification ${JSON.stringify(spec)}`);
    }

    if (!this.cacheSanctorale) return loadPackaged(packaged);

    let cached = this.sanctoraleCache.get(packaged);
    if (cached === undefined) {
      try {
        cached = { ok: true, value: loadPackaged(packaged) };
      } catch (error) {
        cached = { ok: false, error };
      }
      this.sanctoraleCache.set(packaged, cached);
    }
    if (!cached.ok) throw cached.error;
    return cached.value;
  }
}

function loadPackaged(siglum: string): Sanctorale {
  const file = Data[siglum];
  if (file === undefined) {
    throw new Error(`Unknown packaged sanctorale data file ${JSON.stringify(siglum)}`);
  }
  return file.load();
}

/** ruby: the private `#build_temporale_options`. */
export function buildTemporaleOptions(config: CalendarConfig): TemporaleOptions | undefined {
  const options: TemporaleOptions = {};

  const extensionNames = config.temporale_extensions;
  if (extensionNames) {
    options.extensions = extensionNames.map((name) => {
      // ruby: `"CalendariumRomanum::Temporale::Extensions::#{name}".constantize`
      const extension = EXTENSIONS[name];
      if (extension === undefined) {
        throw new Error(`Unknown temporale extension ${JSON.stringify(name)}`);
      }
      return extension;
    });
  }

  const transfers = config.transfer_to_sunday;
  if (transfers) {
    options.transferToSunday = transfers.slice();
  }

  // ruby: returns nil when nothing was configured; `PerpetualCalendar` treats
  // nil and {} identically, but keep the distinction visible.
  return Object.keys(options).length > 0 ? options : undefined;
}

/** The process-wide repository, matching Ruby's `@@calendars_repository`. */
export const calendars = new CalendarRepository();
