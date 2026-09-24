// ruby: lib/calendarium-romanum/day.rb (both `Day` and `Celebration`)

import type { AbstractDate } from './abstract-date.js';
import { CalDate } from './cal-date.js';
import type { Colour, LectionaryCycle, FerialLectionaryCycle, Season } from './enums.js';
import { Colours, LECTIONARY_CYCLES, Ranks } from './enums.js';
import { i18n } from './i18n.js';
import type { Rank } from './rank.js';
import { Dates } from './temporale/dates.js';

export type CelebrationCycle = 'temporale' | 'sanctorale';

export interface CelebrationArgs {
  /**
   * Celebration title/name. A function is called every time {@link Celebration.title}
   * is read, which is how titles stay localized under the *current* locale
   * (ruby: the `Proc` form of the `title` argument).
   */
  title?: string | (() => string);
  rank?: Rank;
  colour?: Colour;
  symbol?: string | null;
  date?: AbstractDate | null;
  cycle?: CelebrationCycle;
  hasVigil?: boolean;
  hasEvening?: boolean;
  moveIfSunday?: boolean;
}

/**
 * ruby: `Celebration#change` uses `value || self.value`, so **`false`, `nil` and
 * `undefined` keep the receiver's value** — which matters for `has_vigil`,
 * `has_evening` and `move_if_sunday`: they can never be turned off by `#change`.
 */
function keep<T>(supplied: T | null | undefined | false, current: T): T {
  if (supplied === undefined || supplied === null || (supplied as unknown) === false) {
    return current;
  }
  return supplied as T;
}

/**
 * One particular celebration of the liturgical year (a Sunday, feast or memorial).
 */
export class Celebration {
  private readonly _title: string | (() => string);
  readonly rank: Rank;
  readonly colour: Colour;
  /** ruby: `Symbol, nil` — a plain string here. */
  readonly symbol: string | null;
  /** Normal fixed date of the celebration. Only set for celebrations with a fixed date. */
  readonly date: AbstractDate | null;
  readonly cycle: CelebrationCycle;
  readonly hasVigil: boolean;
  readonly hasEvening: boolean;
  readonly moveIfSunday: boolean;

  constructor(args: CelebrationArgs = {}) {
    this._title = args.title ?? '';
    this.rank = args.rank ?? Ranks.FERIAL;
    this.colour = args.colour ?? Colours.GREEN;
    this.symbol = args.symbol ?? null;
    this.date = args.date ?? null;
    this.cycle = args.cycle ?? 'sanctorale';
    this.hasVigil = args.hasVigil ?? false;
    this.hasEvening = args.hasEvening ?? false;
    this.moveIfSunday = args.moveIfSunday ?? false;
  }

  /** Feast title/name, evaluated under the current locale. */
  get title(): string {
    return typeof this._title === 'function' ? this._title() : this._title;
  }

  /** ruby: `Celebration#color` alias */
  get color(): Colour {
    return this.colour;
  }

  isSolemnity(): boolean {
    return this.rank.isSolemnity();
  }

  isFeast(): boolean {
    return this.rank.isFeast();
  }

  isMemorial(): boolean {
    return this.rank.isMemorial();
  }

  isSunday(): boolean {
    return this.rank.isSunday();
  }

  isFerial(): boolean {
    return this.rank.isFerial();
  }

  isTemporale(): boolean {
    return this.cycle === 'temporale';
  }

  isSanctorale(): boolean {
    return this.cycle === 'sanctorale';
  }

  /** ruby: `Celebration#has_vigil?` */
  hasVigilP(): boolean {
    return this.hasVigil;
  }

  /** ruby: `Celebration#has_evening?` */
  hasEveningP(): boolean {
    return this.hasEvening;
  }

  /** ruby: `Celebration#move_if_sunday?` */
  moveIfSundayP(): boolean {
    return this.moveIfSunday;
  }

  /**
   * Build a new instance using the receiver's attributes for all properties for
   * which a truthy value was not passed.
   *
   * ruby: `Celebration#change` — see {@link keep}: `false`/`null` keep the old value.
   * The kept title is `self.title`, i.e. the Proc is CALLED: the copy's title is a
   * string fixed in the locale current at the time of the call.
   */
  change(partial: CelebrationArgs): Celebration {
    return new Celebration({
      title: keep(partial.title, this.title),
      rank: keep(partial.rank, this.rank),
      colour: keep(partial.colour, this.colour),
      symbol: keep(partial.symbol, this.symbol),
      date: keep(partial.date, this.date),
      cycle: keep(partial.cycle, this.cycle),
      hasVigil: keep(partial.hasVigil, this.hasVigil),
      hasEvening: keep(partial.hasEvening, this.hasEvening),
      moveIfSunday: keep(partial.moveIfSunday, this.moveIfSunday),
    });
  }

  /**
   * ruby: `Celebration#==` — **faithful port of a fork bug.**
   *
   * The last clause of the Ruby `&&` chain is `move_if_sunday = b.move_if_sunday`
   * (an assignment, not a comparison, day.rb:240), so the whole expression
   * evaluates to `b.move_if_sunday`. Two otherwise identical celebrations are
   * therefore **not** equal unless the right-hand side has `move_if_sunday` set.
   *
   * Use {@link equalsStrict} for the structural comparison the code intended.
   */
  equals(other: unknown): boolean {
    if (!(other instanceof Celebration)) return false;
    return (
      this.title === other.title &&
      this.rank.equals(other.rank) &&
      this.colour === other.colour &&
      this.symbol === other.symbol &&
      abstractDateEq(this.date, other.date) &&
      this.cycle === other.cycle &&
      this.hasVigil === other.hasVigil &&
      this.hasEvening === other.hasEvening &&
      // ruby: `move_if_sunday = b.move_if_sunday` — the value of the assignment
      other.moveIfSunday
    );
  }

  /** The structural equality Ruby's `#==` was meant to implement. */
  equalsStrict(other: unknown): boolean {
    if (!(other instanceof Celebration)) return false;
    return (
      this.title === other.title &&
      this.rank.equals(other.rank) &&
      this.colour === other.colour &&
      this.symbol === other.symbol &&
      abstractDateEq(this.date, other.date) &&
      this.cycle === other.cycle &&
      this.hasVigil === other.hasVigil &&
      this.hasEvening === other.hasEvening &&
      this.moveIfSunday === other.moveIfSunday
    );
  }

  toString(): string {
    return (
      `#<Celebration @title=${JSON.stringify(this.title)} @rank=${this.rank} ` +
      `@colour=${this.colour} symbol=${JSON.stringify(this.symbol)} ` +
      `date=${this.date === null ? 'nil' : this.date} cycle=${this.cycle} ` +
      `has_vigil=${this.hasVigil} has_evening=${this.hasEvening} move_if_sunday=${this.moveIfSunday}>`
    );
  }
}

function abstractDateEq(a: AbstractDate | null, b: AbstractDate | null): boolean {
  if (a === null || b === null) return a === b;
  return a.month === b.month && a.day === b.day;
}

// ---------------------------------------------------------------------------
// Lectionary cycles
//
// ruby: these three live on `Calendar` (calendar.rb) and are re-exposed there as
// statics; they are defined here so that `Day` does not have to import
// `Calendar` (which imports `Day`).
// ---------------------------------------------------------------------------

/** ruby: `Calendar.lectionary_cycle_sunday` */
export function lectionaryCycleSunday(year: number): LectionaryCycle {
  return LECTIONARY_CYCLES[((year % 3) + 3) % 3];
}

/** ruby: `Calendar.lectionary_cycle_ferial` */
export function lectionaryCycleFerial(year: number): FerialLectionaryCycle {
  return ((((year % 2) + 2) % 2) + 1) as FerialLectionaryCycle;
}

export interface LectionaryCycles {
  cycleSunday: LectionaryCycle;
  cycleFerial: FerialLectionaryCycle;
}

/**
 * ruby: `Calendar.lectionary_cycles_for_date` — note it uses the **civil** year
 * of the date together with `Dates.first_advent_sunday(year)`.
 */
export function lectionaryCyclesForDate(date: CalDate): LectionaryCycles {
  let year = date.year;
  if (date.isBefore(Dates.firstAdventSunday(year))) {
    year -= 1;
  }

  return {
    cycleSunday: lectionaryCycleSunday(year),
    cycleFerial: lectionaryCycleFerial(year),
  };
}

export interface DayArgs {
  date: CalDate;
  season?: Season | null;
  seasonWeek?: number | null;
  celebrations?: Celebration[] | null;
  vespers?: Celebration | null;
}

/** Information on one particular day of the liturgical year. */
export class Day {
  readonly date: CalDate;
  readonly season: Season | null;
  readonly seasonWeek: number | null;
  /** ruby: `celebrations ? celebrations.dup : []` — a shallow copy. */
  readonly celebrations: Celebration[];
  /**
   * {@link Celebration} whose first Vespers are celebrated in place of Vespers
   * of the day's celebration(s). Only populated when opted in.
   */
  readonly vespers: Celebration | null;
  readonly cycleSunday: LectionaryCycle;
  readonly cycleFerial: FerialLectionaryCycle;
  /** ruby: `date.cwday == 7 ? cycle_sunday : cycle_ferial` */
  readonly cycle: LectionaryCycle | FerialLectionaryCycle;

  constructor(args: DayArgs) {
    // ruby: all constructor arguments are nullable, but since the fork added the
    // lectionary cycles (which dereference `date`), `Day.new` without a date
    // raises NoMethodError. `date` is therefore required here.
    this.date = args.date;
    this.season = args.season ?? null;
    this.seasonWeek = args.seasonWeek ?? null;
    this.celebrations = args.celebrations ? args.celebrations.slice() : [];
    this.vespers = args.vespers ?? null;

    const cycles = lectionaryCyclesForDate(this.date);
    this.cycleSunday = cycles.cycleSunday;
    this.cycleFerial = cycles.cycleFerial;
    this.cycle = this.date.cwday === 7 ? this.cycleSunday : this.cycleFerial;
  }

  /** Weekday as integer (Sunday is 0). */
  weekday(): number {
    return this.date.wday;
  }

  /** Weekday as internationalized string. */
  weekdayName(): string {
    return i18n.t(`weekday.${this.date.wday}`);
  }

  /** Are the day's Vespers suppressed in favour of first Vespers of the next day? */
  vespersFromFollowing(): boolean {
    return this.vespers !== null;
  }

  /** ruby: `Day#==` — inherits the {@link Celebration.equals} quirk through the array. */
  equals(other: unknown): boolean {
    return this.compareTo(other, false);
  }

  /** Structural equality, using {@link Celebration.equalsStrict}. */
  equalsStrict(other: unknown): boolean {
    return this.compareTo(other, true);
  }

  private compareTo(other: unknown, strict: boolean): boolean {
    if (!(other instanceof Day)) return false;
    const celEq = (a: Celebration, b: Celebration): boolean =>
      strict ? a.equalsStrict(b) : a.equals(b);

    if (!this.date.equals(other.date)) return false;
    if (this.season !== other.season) return false;
    if (this.seasonWeek !== other.seasonWeek) return false;
    if (this.celebrations.length !== other.celebrations.length) return false;
    for (let i = 0; i < this.celebrations.length; i += 1) {
      if (!celEq(this.celebrations[i], other.celebrations[i])) return false;
    }
    if (this.vespers === null || other.vespers === null) {
      return this.vespers === other.vespers;
    }
    return celEq(this.vespers, other.vespers);
  }

  toString(): string {
    const celebrations = this.celebrations.map((c) => c.toString()).join(', ');
    return (
      `#<Day @date=${this.date} @season=${this.season} @season_week=${this.seasonWeek} ` +
      `celebrations=[${celebrations}] vespers=${this.vespers === null ? 'nil' : this.vespers}>`
    );
  }
}
