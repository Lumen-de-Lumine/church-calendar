// ruby: lib/calendarium-romanum/transfers.rb

import { CalDate } from './cal-date.js';
import type { Celebration } from './day.js';
import { Ranks } from './enums.js';
import type { Sanctorale } from './sanctorale.js';
import type { Temporale } from './temporale.js';

/**
 * Internal {@link Calendar} component resolving transfers of conflicting
 * solemnities: when a temporale solemnity and a sanctorale solemnity fall on the
 * same day, the "loser" is moved forward to the first valid destination.
 */
export class Transfers {
  private readonly transferred = new Map<number, Celebration>();
  private readonly temporale: Temporale;
  private readonly sanctorale: Sanctorale;

  constructor(temporale: Temporale, sanctorale: Sanctorale) {
    this.temporale = temporale;
    this.sanctorale = sanctorale;

    // ruby: `sanctorale.solemnities.keys.collect { concretize }.sort` — the Hash
    // insertion order is irrelevant because Dates are totally ordered.
    const dates = [...sanctorale.solemnities.keys()]
      .map((key) => this.concretizeAbstractDate(Math.trunc(key / 100), key % 100))
      .sort((a, b) => a.dayNumber - b.dayNumber);

    for (const date of dates) {
      const tc = temporale.get(date);
      if (!tc.isSolemnity()) continue;

      const sc = sanctorale.get(date);
      if (!(sc.length === 1 && sc[0].isSolemnity())) continue;

      // ruby: `[tc, sc.first].sort_by(&:rank).first`
      //
      // `Rank#<=>` is inverted, so `sort_by(&:rank)` puts the *lower-ranked*
      // celebration last — and MRI's 2-element sort keeps the original order for
      // equal keys, which makes the TEMPORALE celebration the loser on a tie.
      const loser = tc.rank.compare(sc[0].rank) > 0 ? sc[0] : tc;

      let transferTo = date;
      do {
        transferTo = transferTo.succ();
      } while (!this.validDestination(transferTo));

      this.transferred.set(transferTo.dayNumber, loser);
    }
  }

  /** Retrieve the solemnity transferred to the specified day, if any. */
  get(date: CalDate): Celebration | undefined {
    return this.transferred.get(date.dayNumber);
  }

  private validDestination(day: CalDate): boolean {
    if (this.temporale.get(day).rank.gte(Ranks.FEAST_PROPER)) return false;

    const sc = this.sanctorale.get(day);
    if (sc.length > 0 && sc[0].rank.gte(Ranks.FEAST_PROPER)) return false;

    return true;
  }

  /**
   * Converts an AbstractDate to a CalDate in the given liturgical year.
   *
   * ruby: not guaranteed to work in the grey zone between the earliest and the
   * latest possible first Advent Sunday — which is fine as long as no sanctorale
   * solemnity falls in that range.
   */
  private concretizeAbstractDate(month: number, day: number): CalDate {
    const d = new CalDate(this.temporale.year + 1, month, day);
    if (this.temporale.dateRange().includes(d)) {
      return d;
    }
    return new CalDate(this.temporale.year, month, day);
  }
}
