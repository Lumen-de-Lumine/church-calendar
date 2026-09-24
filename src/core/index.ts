// ruby: lib/calendarium-romanum.rb — the module's public surface.

export { CalDate, DateRange } from './cal-date.js';
export { AbstractDate } from './abstract-date.js';

export { ArgumentError, InvalidDataError, InvalidLocaleError } from './errors.js';

export { AVAILABLE_LOCALES, DEFAULT_LOCALE, LOCALES, i18n } from './i18n.js';
export type { InterpolationValues, Locale, LocaleTree, TranslateOptions } from './i18n.js';

export { Ordinalizer, toRoman } from './ordinalizer.js';

export { createEnum } from './enum.js';
export type { EnumSet } from './enum.js';

export { Rank } from './rank.js';
export {
  Colour,
  Colours,
  Colors,
  LECTIONARY_CYCLES,
  Ranks,
  Season,
  Seasons,
} from './enums.js';
export type {
  ColourSymbol,
  FerialLectionaryCycle,
  LectionaryCycle,
  SeasonSymbol,
} from './enums.js';

export { DateEnumerator, Month, Util, Year } from './util.js';

export {
  Celebration,
  Day,
  lectionaryCycleFerial,
  lectionaryCycleSunday,
  lectionaryCyclesForDate,
} from './day.js';
export type { CelebrationArgs, CelebrationCycle, DayArgs, LectionaryCycles } from './day.js';

export { Dates, WEEK } from './temporale/dates.js';
export { CelebrationFactory } from './temporale/celebration-factory.js';
export {
  ChristEternalPriest,
  Extensions,
  ThanksgivingUS,
} from './temporale/extensions/index.js';
export type {
  TemporaleExtension,
  TemporaleExtensionEntry,
} from './temporale/extensions/types.js';

export { SUNDAY_TRANSFERABLE_SOLEMNITIES, Temporale } from './temporale.js';
export type {
  CreateCelebrationOptions,
  TemporaleOptions,
  TransferableSolemnity,
} from './temporale.js';

export { Sanctorale } from './sanctorale.js';
export type { ReplaceOptions, SanctoraleMetadata } from './sanctorale.js';
export { SanctoraleLoader, parseFrontMatter } from './sanctorale-loader.js';
export { SanctoraleFactory } from './sanctorale-factory.js';
export { Data, DataAll, DataSigla, SanctoraleFile } from './data.js';

export { Transfers } from './transfers.js';
export { Calendar, EFFECTIVE_FROM } from './calendar.js';
export type { CalendarOptions } from './calendar.js';
export { PerpetualCalendar } from './perpetual-calendar.js';
export type { PerpetualCalendarOptions } from './perpetual-calendar.js';
