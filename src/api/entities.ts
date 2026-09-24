// ruby: apps/api/v0/entities/day.rb and apps/api/v0/entities/celebration.rb
//
// `Grape::Entity` exposes fields in DECLARATION order, and that order survives
// into the JSON. It is part of the contract (clients diff responses), so
// the objects below are built key by key in the same order.
//
// The Ruby entity localizes `rank` through `I18n` at render time, so both
// functions must run inside the request's `i18n.withLocale(...)` block.

import type { Celebration, Day } from '../core/day.js';

/** `apps/api/v0/entities/day.rb`'s private `WDAYS` — never localized (Q19). */
export const WDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;

export type SerializedWeekday = (typeof WDAYS)[number];

/** `{title, colour, rank, rank_num, id}` — key order is significant. */
export interface SerializedCelebration {
  title: string;
  colour: string;
  /** ruby: `object.rank.short_desc || object.rank.desc`, localized. */
  rank: string;
  /** ruby: `object.rank.priority`. `COMMEMORATION` (4.0) serializes as `4`. */
  rank_num: number;
  /** ruby: `expose :symbol, as: :id` — `null` for temporale days with no symbol. */
  id: string | null;
}

/** `{date, season, season_week, cycle, cycle_sunday, cycle_ferial, celebrations, vespers, weekday}`. */
export interface SerializedDay {
  date: string;
  season: string;
  season_week: number | null;
  /** A STRING on Sundays (`'A'|'B'|'C'`) and a NUMBER (`1|2`) on every other day. */
  cycle: string | number;
  cycle_sunday: string;
  cycle_ferial: number;
  celebrations: SerializedCelebration[];
  vespers: SerializedCelebration | null;
  weekday: SerializedWeekday;
}

/** ruby: `ChurchCalendar::Celebration` (the Grape entity). */
export function serializeCelebration(celebration: Celebration): SerializedCelebration {
  const rank = celebration.rank;
  return {
    title: celebration.title,
    colour: celebration.colour.symbol,
    // `short_desc || desc`: ranks 1.1 and 1.2 have no short description, so they
    // fall back to the long one ("Easter triduum", "Primary liturgical days").
    rank: rank.shortDesc() ?? rank.desc() ?? '',
    rank_num: rank.priority,
    id: celebration.symbol ?? null,
  };
}

/** ruby: `ChurchCalendar::Day` (the Grape entity). */
export function serializeDay(day: Day): SerializedDay {
  return {
    date: day.date.toISO(),
    season: day.season === null ? '' : day.season.symbol,
    season_week: day.seasonWeek,
    cycle: day.cycle,
    cycle_sunday: day.cycleSunday,
    cycle_ferial: day.cycleFerial,
    celebrations: day.celebrations.map(serializeCelebration),
    vespers: day.vespers === null ? null : serializeCelebration(day.vespers),
    weekday: WDAYS[day.date.wday],
  };
}

/** ruby: `present days, with: ChurchCalendar::Day` for an Array. */
export function serializeDays(days: readonly Day[]): SerializedDay[] {
  return days.map(serializeDay);
}

/** ruby: `ChurchCalendar::CALENDAR_SYSTEM_DESC`. */
export const CALENDAR_PROMULGATED = 1969;

/** ruby: `CalendariumRomanum::Calendar::EFFECTIVE_FROM.year`. */
export const CALENDAR_START = 1970;

export interface SerializedCalendarSystem {
  promulgated: number;
  effective_since: number;
  desc: string;
}

export interface SerializedCalendarDescription {
  system: SerializedCalendarSystem;
  sanctorale: { title: string; language: string };
}

export const CALENDAR_SYSTEM_DESC: SerializedCalendarSystem = {
  promulgated: CALENDAR_PROMULGATED,
  effective_since: CALENDAR_START,
  desc:
    'promulgated by motu proprio Mysterii Paschalis of Paul VI. ' +
    '(AAS 61 (1969), pp. 222-226).',
};

/** ruby: the `get do ... end` of the `/:calendar` segment. */
export function serializeCalendarDescription(
  title: string,
  language: string,
): SerializedCalendarDescription {
  return {
    system: CALENDAR_SYSTEM_DESC,
    sanctorale: { title, language },
  };
}

export interface SerializedLectionaryYear {
  lectionary: string;
  ferial_lectionary: number;
}
