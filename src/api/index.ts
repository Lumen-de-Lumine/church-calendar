// ruby: lib/church-calendar.rb + apps/api/v0/entities/*
//
// The api layer: everything between `src/core` (the liturgical computation) and
// `src/http` (routing, validation, formatting). Import it directly to embed the
// calendar in a NestJS service or a browser bundle without any HTTP at all.

export {
  CALENDARS_METADATA,
  CALENDAR_ENTRIES,
  CALENDAR_IDS,
  calendarConfig,
  calendarDescription,
  calendarLanguage,
  calendarTitle,
  hasCalendar,
  sanctoraleSources,
  temporaleExtensionNames,
  transferToSunday,
} from './calendars-config.js';
export type { CalendarConfig, CalendarConfigEntry, SanctoraleSource } from './calendars-config.js';

export {
  CalendarRepository,
  buildTemporaleOptions,
  calendars,
} from './calendar-repository.js';
export type { CalendarRepositoryOptions } from './calendar-repository.js';

export {
  CalendarFacade,
  DateRangeEnumerator,
  spellOutOrdinals,
  titleIncludesQuery,
} from './calendar-facade.js';

export {
  ORDINALIZE_MAX,
  ORDINALIZE_MIN,
  ordinalizeInFull,
} from './ordinalize-full.js';

export {
  CALENDAR_PROMULGATED,
  CALENDAR_START,
  CALENDAR_SYSTEM_DESC,
  WDAYS,
  serializeCalendarDescription,
  serializeCelebration,
  serializeDay,
  serializeDays,
} from './entities.js';
export type {
  SerializedCalendarDescription,
  SerializedCalendarSystem,
  SerializedCelebration,
  SerializedDay,
  SerializedLectionaryYear,
  SerializedWeekday,
} from './entities.js';

export { parseDateHeader, parseDateParam, today } from './dates.js';

export {
  ApiError,
  DateParseError,
  OrdinalizeError,
  UnknownCalendarError,
  validationError,
} from './errors.js';
