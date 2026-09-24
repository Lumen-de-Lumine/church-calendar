// ruby: lib/calendarium-romanum/temporale.rb

import { CalDate, DateRange } from './cal-date.js';
import { Celebration } from './day.js';
import type { CelebrationCycle } from './day.js';
import type { AbstractDate } from './abstract-date.js';
import type { Colour, Season } from './enums.js';
import { Ranks, Seasons } from './enums.js';
import type { Rank } from './rank.js';
import { i18n } from './i18n.js';
import { Ordinalizer } from './ordinalizer.js';
import { CelebrationFactory } from './temporale/celebration-factory.js';
import { Dates, WEEK } from './temporale/dates.js';
import type { TemporaleExtension } from './temporale/extensions/types.js';

export { WEEK };

/** Which solemnities can be transferred to Sunday. */
export const SUNDAY_TRANSFERABLE_SOLEMNITIES = ['epiphany', 'ascension', 'corpus_christi'] as const;
export type TransferableSolemnity = (typeof SUNDAY_TRANSFERABLE_SOLEMNITIES)[number];

/** Seasons when Sundays have a higher rank. */
const SEASONS_SUNDAY_PRIMARY: readonly Season[] = [Seasons.ADVENT, Seasons.LENT, Seasons.EASTER];

export interface TemporaleOptions {
  extensions?: TemporaleExtension[];
  transferToSunday?: (TransferableSolemnity | string)[];
}

export interface CreateCelebrationOptions {
  symbol?: string | null;
  date?: AbstractDate | null;
  hasVigil?: boolean;
  hasEvening?: boolean;
  moveIfSunday?: boolean;
}

/**
 * ruby: the class-level `Temporale.celebrations` list — `[date_method, celebration]`
 * pairs, built once and shared by every `Temporale` instance.
 */
type DateMethod =
  | 'nativity'
  | 'holyFamily'
  | 'motherOfGod'
  | 'epiphany'
  | 'baptismOfLord'
  | 'ashWednesday'
  | 'holyThursday'
  | 'goodFriday'
  | 'holySaturday'
  | 'palmSunday'
  | 'easterSunday'
  | 'ascension'
  | 'pentecost'
  | 'holyTrinity'
  | 'corpusChristi'
  | 'motherOfChurch'
  | 'sacredHeart'
  | 'christKing'
  | 'immaculateHeart';

interface TemporaleCelebration {
  dateMethod: DateMethod;
  celebration: Celebration;
}

let CELEBRATIONS: TemporaleCelebration[] | null = null;

function temporaleCelebrations(): TemporaleCelebration[] {
  if (CELEBRATIONS === null) {
    // Immaculate Heart of Mary and Mary, Mother of the Church are actually
    // movable *sanctorale* feasts, handled in temporale for convenience.
    CELEBRATIONS = [
      { dateMethod: 'nativity', celebration: CelebrationFactory.nativity() },
      { dateMethod: 'holyFamily', celebration: CelebrationFactory.holyFamily() },
      { dateMethod: 'motherOfGod', celebration: CelebrationFactory.motherOfGod() },
      { dateMethod: 'epiphany', celebration: CelebrationFactory.epiphany() },
      { dateMethod: 'baptismOfLord', celebration: CelebrationFactory.baptismOfLord() },
      { dateMethod: 'ashWednesday', celebration: CelebrationFactory.ashWednesday() },
      { dateMethod: 'holyThursday', celebration: CelebrationFactory.holyThursday() },
      { dateMethod: 'goodFriday', celebration: CelebrationFactory.goodFriday() },
      { dateMethod: 'holySaturday', celebration: CelebrationFactory.holySaturday() },
      { dateMethod: 'palmSunday', celebration: CelebrationFactory.palmSunday() },
      { dateMethod: 'easterSunday', celebration: CelebrationFactory.easterSunday() },
      { dateMethod: 'ascension', celebration: CelebrationFactory.ascension() },
      { dateMethod: 'pentecost', celebration: CelebrationFactory.pentecost() },
      { dateMethod: 'holyTrinity', celebration: CelebrationFactory.holyTrinity() },
      { dateMethod: 'corpusChristi', celebration: CelebrationFactory.corpusChristi() },
      { dateMethod: 'motherOfChurch', celebration: CelebrationFactory.motherOfChurch() },
      { dateMethod: 'sacredHeart', celebration: CelebrationFactory.sacredHeart() },
      { dateMethod: 'christKing', celebration: CelebrationFactory.christKing() },
      { dateMethod: 'immaculateHeart', celebration: CelebrationFactory.immaculateHeart() },
    ];
  }
  return CELEBRATIONS;
}

/**
 * One of the two main {@link Calendar} components. Handles seasons and
 * celebrations of the temporale cycle for a given liturgical year.
 */
export class Temporale {
  readonly year: number;
  private readonly extensions: TemporaleExtension[];
  private readonly transferToSunday: string[];

  private readonly solemnities = new Map<number, Celebration>();
  private readonly feasts = new Map<number, Celebration>();
  private readonly memorials = new Map<number, Celebration>();

  /**
   * Memoizes the movable-feast dates. Ruby recomputes them on every call; since
   * they are pure functions of `year` + `transfer_to_sunday` this is purely an
   * optimization and changes no behaviour.
   */
  private readonly dateCache = new Map<string, CalDate>();
  private rangeCache: DateRange | null = null;

  private cached(key: string, compute: () => CalDate): CalDate {
    let value = this.dateCache.get(key);
    if (value === undefined) {
      value = compute();
      this.dateCache.set(key, value);
    }
    return value;
  }

  /**
   * @param year the civil year when the liturgical year *begins*
   * @throws {Error} when `transferToSunday` names an unsupported solemnity
   */
  constructor(year: number, opts: TemporaleOptions = {}) {
    this.year = year;
    this.extensions = opts.extensions ?? [];
    this.transferToSunday = (opts.transferToSunday ?? []).slice().sort();
    this.validateSundayTransfer();

    this.prepareSolemnities();
  }

  /** ruby: `Temporale.liturgical_year` */
  static liturgicalYear(date: CalDate): number {
    const year = date.year;
    if (date.isBefore(Dates.firstAdventSunday(year))) {
      return year - 1;
    }
    return year;
  }

  /** ruby: `Temporale.for_day` */
  static forDay(date: CalDate): Temporale {
    return new Temporale(Temporale.liturgicalYear(date));
  }

  /** ruby: `Temporale.create_celebration` — temporale {@link Celebration}s with sensible defaults. */
  static createCelebration(
    title: string | (() => string),
    rank: Rank,
    colour: Colour,
    opts: CreateCelebrationOptions = {},
  ): Celebration {
    return new Celebration({
      title,
      rank,
      colour,
      symbol: opts.symbol ?? null,
      date: opts.date ?? null,
      cycle: 'temporale' as CelebrationCycle,
      hasVigil: opts.hasVigil ?? false,
      hasEvening: opts.hasEvening ?? false,
      moveIfSunday: opts.moveIfSunday ?? false,
    });
  }

  /** Does this instance transfer the specified solemnity to Sunday? */
  transferredToSunday(solemnity: string): boolean {
    return this.transferToSunday.includes(solemnity);
  }

  // ------------------------------------------------------------ feast dates

  firstAdventSunday(): CalDate {
    return this.cached('firstAdventSunday', () => Dates.firstAdventSunday(this.year));
  }

  nativity(): CalDate {
    return this.cached('nativity', () => Dates.nativity(this.year));
  }

  holyFamily(): CalDate {
    return this.cached('holyFamily', () => Dates.holyFamily(this.year));
  }

  motherOfGod(): CalDate {
    return this.cached('motherOfGod', () => Dates.motherOfGod(this.year));
  }

  epiphany(): CalDate {
    return this.cached('epiphany', () =>
      Dates.epiphany(this.year, { sunday: this.transferredToSunday('epiphany') }),
    );
  }

  baptismOfLord(): CalDate {
    return this.cached('baptismOfLord', () =>
      Dates.baptismOfLord(this.year, { epiphanyOnSunday: this.transferredToSunday('epiphany') }),
    );
  }

  ashWednesday(): CalDate {
    return this.cached('ashWednesday', () => Dates.ashWednesday(this.year));
  }

  holyThursday(): CalDate {
    return this.cached('holyThursday', () => Dates.holyThursday(this.year));
  }

  goodFriday(): CalDate {
    return this.cached('goodFriday', () => Dates.goodFriday(this.year));
  }

  holySaturday(): CalDate {
    return this.cached('holySaturday', () => Dates.holySaturday(this.year));
  }

  palmSunday(): CalDate {
    return this.cached('palmSunday', () => Dates.palmSunday(this.year));
  }

  easterSunday(): CalDate {
    return this.cached('easterSunday', () => Dates.easterSunday(this.year));
  }

  ascension(): CalDate {
    return this.cached('ascension', () =>
      Dates.ascension(this.year, { sunday: this.transferredToSunday('ascension') }),
    );
  }

  pentecost(): CalDate {
    return this.cached('pentecost', () => Dates.pentecost(this.year));
  }

  holyTrinity(): CalDate {
    return this.cached('holyTrinity', () => Dates.holyTrinity(this.year));
  }

  corpusChristi(): CalDate {
    return this.cached('corpusChristi', () =>
      Dates.corpusChristi(this.year, { sunday: this.transferredToSunday('corpus_christi') }),
    );
  }

  motherOfChurch(): CalDate {
    return this.cached('motherOfChurch', () => Dates.motherOfChurch(this.year));
  }

  sacredHeart(): CalDate {
    return this.cached('sacredHeart', () => Dates.sacredHeart(this.year));
  }

  christKing(): CalDate {
    return this.cached('christKing', () => Dates.christKing(this.year));
  }

  immaculateHeart(): CalDate {
    return this.cached('immaculateHeart', () => Dates.immaculateHeart(this.year));
  }

  // ---------------------------------------------------------------- the year

  /** First day of the liturgical year. */
  startDate(): CalDate {
    return this.firstAdventSunday();
  }

  /** Last day of the liturgical year. */
  endDate(): CalDate {
    return this.cached('endDate', () => Dates.firstAdventSunday(this.year + 1).addDays(-1));
  }

  dateRange(): DateRange {
    if (this.rangeCache === null) {
      this.rangeCache = new DateRange(this.startDate(), this.endDate());
    }
    return this.rangeCache;
  }

  /** @throws {RangeError} if the date does not belong to this liturgical year */
  rangeCheck(date: CalDate): void {
    if (!this.dateRange().includes(date)) {
      throw new RangeError(`Date out of range ${date.toISO()}`);
    }
  }

  // ----------------------------------------------------------------- seasons

  /** @throws {RangeError} if the date does not belong to this liturgical year */
  season(date: CalDate): Season {
    this.rangeCheck(date);

    if (this.firstAdventSunday().isOnOrBefore(date) && this.nativity().isAfter(date)) {
      return Seasons.ADVENT;
    }
    if (this.nativity().isOnOrBefore(date) && this.baptismOfLord().isOnOrAfter(date)) {
      return Seasons.CHRISTMAS;
    }
    if (this.ashWednesday().isOnOrBefore(date) && this.easterSunday().isAfter(date)) {
      return Seasons.LENT;
    }
    if (this.easterSunday().isOnOrBefore(date) && this.pentecost().isOnOrAfter(date)) {
      return Seasons.EASTER;
    }
    return Seasons.ORDINARY;
  }

  /** When the specified liturgical season begins. */
  seasonBeginning(s: Season): CalDate {
    switch (s) {
      case Seasons.ADVENT:
        return this.firstAdventSunday();
      case Seasons.CHRISTMAS:
        return this.nativity();
      case Seasons.LENT:
        return this.ashWednesday();
      case Seasons.EASTER:
        return this.easterSunday();
      case Seasons.ORDINARY:
        return this.baptismOfLord().addDays(1);
      default:
        throw new Error('unsupported season');
    }
  }

  /**
   * Determine the week of a season for a given date.
   *
   * ruby: the division is Ruby's **floored** integer division, which is what
   * makes Christmas Day and Ash Wednesday land in week 0.
   */
  seasonWeek(season: Season, date: CalDate): number {
    const seasonBeginning = this.seasonBeginning(season);
    const week1Beginning = seasonBeginning.isSunday()
      ? seasonBeginning
      : Dates.sundayAfter(seasonBeginning);

    let week = Math.floor(date.diffDays(week1Beginning) / WEEK) + 1;

    if (season === Seasons.ORDINARY) {
      // Ordinary Time does not begin with a Sunday, but the first week is week 1, not 0.
      week += 1;

      if (date.isAfter(this.pentecost())) {
        const weeksAfterDate = Math.floor(
          Dates.firstAdventSunday(this.year + 1).diffDays(date) / WEEK,
        );
        week = 34 - weeksAfterDate;
        if (date.isSunday()) week += 1;
      }
    }

    return week;
  }

  // ------------------------------------------------------------ celebrations

  /** ruby: `Temporale#[]` and `Temporale#get` */
  get(date: CalDate): Celebration;
  get(month: number, day: number): Celebration;
  get(dateOrMonth: CalDate | number, day?: number): Celebration {
    let date: CalDate;
    if (dateOrMonth instanceof CalDate) {
      date = dateOrMonth;
    } else {
      const month = dateOrMonth;
      date = new CalDate(this.year, month, day as number);
      if (!this.dateRange().includes(date)) {
        date = new CalDate(this.year + 1, month, day as number);
      }
    }

    const key = date.dayNumber;
    return (
      this.solemnities.get(key) ??
      this.feasts.get(key) ??
      this.sunday(date) ??
      this.memorials.get(key) ??
      this.ferial(date)
    );
  }

  /** ruby: the private `Temporale#sunday`. */
  sunday(date: CalDate): Celebration | null {
    if (!date.isSunday()) return null;

    const seas = this.season(date);
    const rank = SEASONS_SUNDAY_PRIMARY.includes(seas) ? Ranks.PRIMARY : Ranks.SUNDAY_UNPRIVILEGED;

    const week = Ordinalizer.ordinal(this.seasonWeek(seas, date));
    const title = i18n.t(`temporale.${seas.symbol}.sunday`, { week });

    return Temporale.createCelebration(title, rank, seas.colour);
  }

  /**
   * ruby: the private `Temporale#ferial` — exposed here because
   * `Calendar#celebrations_for` reaches into it (`temporale.send :ferial, date`).
   */
  ferial(date: CalDate): Celebration {
    const seas = this.season(date);
    const week = this.seasonWeek(seas, date);
    const weekOrd = Ordinalizer.ordinal(week);
    const weekday = i18n.t(`weekday.${date.wday}`);
    const weekdayEn = i18n.t(`weekday.${date.wday}`, undefined, { locale: 'en' }).toLowerCase();

    let rank: Rank = Ranks.FERIAL;
    let title: string | null = null;
    let id: string | null = null;

    switch (seas) {
      case Seasons.ADVENT: {
        if (date.isOnOrAfter(new CalDate(this.year, 12, 17))) {
          rank = Ranks.FERIAL_PRIVILEGED;
          const nth = Ordinalizer.ordinal(date.day);
          title = i18n.t('temporale.advent.before_christmas', {
            day: nth,
            week: weekOrd,
            weekday,
          });
          id = `advent_${weekdayEn}_december${date.day}`;
        }
        break;
      }
      case Seasons.CHRISTMAS: {
        if (date.isBefore(this.motherOfGod())) {
          rank = Ranks.FERIAL_PRIVILEGED;

          const dayOfOctave = date.day - this.nativity().day + 1; // 1-based counting
          const nth = Ordinalizer.ordinal(dayOfOctave);
          title = i18n.t('temporale.christmas.nativity_octave.ferial', { day: nth });
          id = `christmas_octave_${dayOfOctave}`;
        } else if (date.isAfter(this.epiphany())) {
          if (this.transferredToSunday('epiphany')) {
            title = i18n.t('temporale.christmas.after_epiphany.ferial', { weekday });
          } else {
            title = i18n.t('temporale.christmas.after_epiphany.ferial_with_day', {
              weekday,
              day: date.day,
            });
            rank = Ranks.FERIAL_PRIVILEGED;
            id = `post_epiphany_${weekdayEn}_january${date.day}`;
          }
        } else {
          // > mother_of_god && < epiphany
          rank = Ranks.FERIAL_PRIVILEGED;
          title = i18n.t('temporale.christmas.ferial', { weekday, day: date.day });
          id = `pre_epiphany_${weekdayEn}_january${date.day}`;
        }
        break;
      }
      case Seasons.LENT: {
        if (week === 0) {
          title = i18n.t('temporale.lent.after_ashes.ferial', { weekday });
        } else if (date.isAfter(this.palmSunday())) {
          rank = Ranks.PRIMARY;
          title = i18n.t('temporale.lent.holy_week.ferial', { weekday });
          id = `lent_holy_${weekdayEn}`;
        }
        if (!rank.gt(Ranks.FERIAL_PRIVILEGED)) {
          rank = Ranks.FERIAL_PRIVILEGED;
        }
        break;
      }
      case Seasons.EASTER: {
        if (week === 1) {
          rank = Ranks.PRIMARY;
          title = i18n.t('temporale.easter.octave.ferial', { weekday });
        }
        break;
      }
      default:
        break;
    }

    if (title === null) {
      title = i18n.t(`temporale.${seas.symbol}.ferial`, { week: weekOrd, weekday });
    }

    return Temporale.createCelebration(title, rank, seas.colour, { symbol: id });
  }

  /** ruby: `Temporale#==` — order of transfers and extensions does not matter. */
  equals(other: unknown): boolean {
    if (!(other instanceof Temporale)) return false;
    if (this.year !== other.year) return false;
    if (this.transferToSunday.length !== other.transferToSunday.length) return false;
    if (!this.transferToSunday.every((s, i) => s === other.transferToSunday[i])) return false;

    const a = new Set(this.extensions);
    const b = new Set(other.extensions);
    if (a.size !== b.size) return false;
    for (const extension of a) {
      if (!b.has(extension)) return false;
    }
    return true;
  }

  // --------------------------------------------------------------- internals

  private prepareSolemnities(): void {
    for (const { dateMethod, celebration } of temporaleCelebrations()) {
      this.prepareCelebrationDate(this[dateMethod](), celebration);
    }

    for (const extension of this.extensions) {
      for (const [dateFn, celebration] of extension.eachCelebration()) {
        this.prepareCelebrationDate(dateFn(this.year), celebration);
      }
    }
  }

  private prepareCelebrationDate(date: CalDate, celebration: Celebration): void {
    const addTo = celebration.isFeast()
      ? this.feasts
      : celebration.isMemorial()
        ? this.memorials
        : this.solemnities;
    addTo.set(date.dayNumber, celebration);
  }

  private validateSundayTransfer(): void {
    const supported = SUNDAY_TRANSFERABLE_SOLEMNITIES as readonly string[];
    const unsupported = this.transferToSunday.filter((s) => !supported.includes(s));
    if (unsupported.length > 0) {
      throw new Error(
        `Transfer of ${JSON.stringify(unsupported)} to a Sunday not supported. ` +
          `Only ${JSON.stringify(supported)} are allowed.`,
      );
    }
  }
}

export { CelebrationFactory, Dates };
