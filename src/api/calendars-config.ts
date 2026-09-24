// ruby: config/calendars.yml + lib/church-calendar/services/calendar_repository.rb
//       (`CalendarRepository.load_from`, `#metadata`)
//
// A typed, read-only view over the GENERATED `src/data/calendars-config.ts`.
// The generated module already has the YAML anchors and `<<` merge keys resolved
// and preserves the top-level key order of config/calendars.yml, which is what
// `GET /api/v0/:lang/calendars` returns.

import {
  CALENDARS_BY_KEY,
  CALENDARS_CONFIG,
  CALENDAR_KEYS,
} from '../data/calendars-config.js';
import type {
  CalendarConfig,
  CalendarConfigEntry,
  SanctoraleSource,
} from '../data/calendars-config.js';

export type { CalendarConfig, CalendarConfigEntry, SanctoraleSource };

/**
 * Calendar ids in config-file order.
 *
 * ruby: `ChurchCalendar.calendars.keys` — a Ruby Hash preserves insertion order,
 * so this is literally the order the keys appear in `config/calendars.yml`.
 */
export const CALENDAR_IDS: readonly string[] = CALENDAR_KEYS;

/** Every calendar definition, in config-file order. */
export const CALENDAR_ENTRIES: readonly CalendarConfigEntry[] = CALENDARS_CONFIG;

/** ruby: `@calendars.has_key?(key)` */
export function hasCalendar(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(CALENDARS_BY_KEY, key);
}

/** ruby: `@calendars[key]`; `undefined` (not an exception) for an unknown key. */
export function calendarConfig(key: string): CalendarConfig | undefined {
  return hasCalendar(key) ? CALENDARS_BY_KEY[key] : undefined;
}

/**
 * ruby: `CalendarRepository#metadata` — the whole parsed YAML, which the Roda web
 * UI iterates over to build its calendar picker.
 */
export const CALENDARS_METADATA: Readonly<Record<string, CalendarConfig>> = CALENDARS_BY_KEY;

/** The `sanctorale:` layers of a calendar, in file order. */
export function sanctoraleSources(key: string): readonly SanctoraleSource[] {
  return calendarConfig(key)?.sanctorale ?? [];
}

/** ruby constant names of the temporale extensions (`ThanksgivingUS`, ...). */
export function temporaleExtensionNames(key: string): readonly string[] {
  return calendarConfig(key)?.temporale_extensions ?? [];
}

/** Solemnities transferred to the nearest Sunday (`epiphany`, `ascension`, `corpus_christi`). */
export function transferToSunday(key: string): readonly string[] {
  return calendarConfig(key)?.transfer_to_sunday ?? [];
}

/** `sanctorale.title` of `GET /calendars/:cal`. */
export function calendarTitle(key: string): string | undefined {
  return calendarConfig(key)?.title;
}

/** `sanctorale.language` of `GET /calendars/:cal`; also the locale the web UI switches to. */
export function calendarLanguage(key: string): string | undefined {
  return calendarConfig(key)?.language;
}

/**
 * Free-text note from the YAML (only `us-ascension` and its clones have one).
 * It is NOT part of any API response — `GET /calendars/:cal` exposes only
 * `title` and `language`.
 */
export function calendarDescription(key: string): string | undefined {
  return calendarConfig(key)?.description;
}
