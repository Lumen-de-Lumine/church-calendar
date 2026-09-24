// ruby: lib/calendarium-romanum/sanctorale.rb

import { AbstractDate } from './abstract-date.js';
import { CalDate } from './cal-date.js';
import type { Celebration } from './day.js';
import { Ranks } from './enums.js';
import { ArgumentError } from './errors.js';

export type SanctoraleMetadata = Record<string, unknown> | null;

export interface ReplaceOptions {
  /** Internal feature, not intended for use by client code. */
  symbolUniqueness?: boolean;
}

interface DayEntry {
  date: AbstractDate;
  celebrations: Celebration[];
}

/**
 * One of the two main {@link Calendar} components: celebrations with a fixed
 * date, mostly feasts of saints.
 *
 * Basically a mapping {@link AbstractDate} => `Celebration[]` which additionally
 * enforces that a day either holds a single celebration or any number of
 * optional memorials, and that celebration symbols are unique.
 */
export class Sanctorale {
  /** Keyed by `AbstractDate#key`; insertion-ordered, like Ruby's Hash. */
  private readonly days = new Map<number, DayEntry>();
  private readonly solemnitiesMap = new Map<number, Celebration>();
  private symbols = new Set<string>();

  /**
   * Sanctorale metadata: the YAML front matter of the data file it was loaded
   * from, if any.
   */
  metadata: SanctoraleMetadata = null;

  /** Content subset — only celebrations in the rank(s) of solemnity. */
  get solemnities(): Map<number, Celebration> {
    return this.solemnitiesMap;
  }

  /**
   * Adds a new {@link Celebration}.
   *
   * @throws {ArgumentError} when the operation would break the object's invariant
   */
  add(month: number, day: number, celebration: Celebration): void {
    const date = new AbstractDate(month, day);
    const key = date.key;

    const existing = this.days.get(key);
    if (existing !== undefined && existing.celebrations.length > 0) {
      const present = existing.celebrations[0];
      if (!present.rank.equals(Ranks.MEMORIAL_OPTIONAL)) {
        throw new ArgumentError(
          `On ${date} there is already a ${present.rank}. No more celebrations can be added.`,
        );
      } else if (!celebration.rank.equals(Ranks.MEMORIAL_OPTIONAL)) {
        throw new ArgumentError(
          `Celebration of rank ${celebration.rank} cannot be grouped, ` +
            `but there is already another celebration on ${date}`,
        );
      }
    }

    if (celebration.symbol !== null) {
      if (this.symbols.has(celebration.symbol)) {
        throw new ArgumentError(
          `Attempted to add Celebration with duplicate symbol ${JSON.stringify(celebration.symbol)}`,
        );
      }
      this.symbols.add(celebration.symbol);
    }

    let entry = this.days.get(key);
    if (entry === undefined) {
      entry = { date, celebrations: [] };
      this.days.set(key, entry);
    }

    if (celebration.isSolemnity()) {
      this.solemnitiesMap.set(key, celebration);
    }

    entry.celebrations.push(celebration);
  }

  /**
   * Replaces content of the given day by the given celebrations.
   *
   * @throws {ArgumentError} when the operation would break the object's invariant
   */
  replace(
    month: number,
    day: number,
    celebrations: Celebration[],
    opts: ReplaceOptions = {},
  ): void {
    const symbolUniqueness = opts.symbolUniqueness ?? true;
    const date = new AbstractDate(month, day);
    const key = date.key;

    let symbolsWithoutDay = this.symbols;
    const existing = this.days.get(key);
    if (existing !== undefined) {
      const oldSymbols = new Set(
        existing.celebrations.map((c) => c.symbol).filter((s): s is string => s !== null),
      );
      symbolsWithoutDay = new Set([...this.symbols].filter((s) => !oldSymbols.has(s)));
    }

    const newSymbols = celebrations.map((c) => c.symbol).filter((s): s is string => s !== null);
    const duplicate = newSymbols.filter((s) => symbolsWithoutDay.has(s));
    if (symbolUniqueness && duplicate.length > 0) {
      throw new ArgumentError(
        `Attempted to add Celebrations with duplicate symbols ${JSON.stringify(
          [...new Set(duplicate)],
        )}`,
      );
    }

    this.symbols = symbolsWithoutDay;
    for (const symbol of newSymbols) this.symbols.add(symbol);

    if (celebrations[0].isSolemnity()) {
      this.solemnitiesMap.set(key, celebrations[0]);
    } else if (this.solemnitiesMap.has(key)) {
      this.solemnitiesMap.delete(key);
    }

    this.days.set(key, { date, celebrations: celebrations.slice() });
  }

  /**
   * Updates the receiver with celebrations from another instance: for each date
   * contained in `other`, the content of `self` is *replaced*.
   *
   * @throws {ArgumentError} (from `rebuildSymbols`) — note the check happens at
   *   the very end, so on failure the instance is left in an inconsistent state.
   */
  update(other: Sanctorale): void {
    other.eachDay((date, celebrations) => {
      this.replace(date.month, date.day, celebrations, { symbolUniqueness: false });
    });
    this.rebuildSymbols();
  }

  /**
   * ruby: `Sanctorale#[]` — **returns the stored array itself**, not a copy.
   * Callers must not mutate it (see docs/QUIRKS.md, Q3).
   */
  at(date: CalDate | AbstractDate): Celebration[] {
    const adate = date instanceof AbstractDate ? date : AbstractDate.fromDate(date);
    const entry = this.days.get(adate.key);
    return entry === undefined ? [] : entry.celebrations;
  }

  /** ruby: `Sanctorale#get(date)` / `#get(month, day)` */
  get(date: CalDate | AbstractDate): Celebration[];
  get(month: number, day: number): Celebration[];
  get(dateOrMonth: CalDate | AbstractDate | number, day?: number): Celebration[] {
    if (typeof dateOrMonth === 'number') {
      return this.at(new AbstractDate(dateOrMonth, day as number));
    }
    if (dateOrMonth instanceof AbstractDate) {
      return this.at(dateOrMonth);
    }
    return this.at(new AbstractDate(dateOrMonth.month, dateOrMonth.day));
  }

  /** Enumerates dates for which any celebrations are available. */
  eachDay(fn?: (date: AbstractDate, celebrations: Celebration[]) => void): [AbstractDate, Celebration[]][] {
    const pairs: [AbstractDate, Celebration[]][] = [];
    for (const entry of this.days.values()) {
      pairs.push([entry.date, entry.celebrations]);
      if (fn) fn(entry.date, entry.celebrations);
    }
    return pairs;
  }

  /** Count of *days* with celebrations filled. */
  get size(): number {
    return this.days.size;
  }

  isEmpty(): boolean {
    return this.days.size === 0;
  }

  /** ruby: `Sanctorale#==` — compares the `days` mapping. */
  equals(other: unknown): boolean {
    if (!(other instanceof Sanctorale)) return false;
    if (this.days.size !== other.days.size) return false;
    for (const [key, entry] of this.days) {
      const otherEntry = other.days.get(key);
      if (otherEntry === undefined) return false;
      if (entry.celebrations.length !== otherEntry.celebrations.length) return false;
      for (let i = 0; i < entry.celebrations.length; i += 1) {
        if (!entry.celebrations[i].equalsStrict(otherEntry.celebrations[i])) return false;
      }
    }
    return true;
  }

  /**
   * Builds the registry of celebration symbols anew, raising if any duplicates
   * are found.
   *
   * ruby: symbol-less celebrations have `symbol == nil`, and `nil` participates
   * in the duplicate check — two of them anywhere in the data raise
   * `Duplicate celebration symbols: [nil]`. Reproduced (see docs/QUIRKS.md, Q9).
   */
  private rebuildSymbols(): void {
    const seen = new Set<string | null>();
    const duplicates: (string | null)[] = [];

    for (const entry of this.days.values()) {
      for (const celebration of entry.celebrations) {
        if (seen.has(celebration.symbol) && !duplicates.includes(celebration.symbol)) {
          duplicates.push(celebration.symbol);
        }
        seen.add(celebration.symbol);
      }
    }

    if (duplicates.length > 0) {
      throw new ArgumentError(
        `Duplicate celebration symbols: ${JSON.stringify(duplicates)}`,
      );
    }

    this.symbols = new Set([...seen].filter((s): s is string => s !== null));
  }
}
