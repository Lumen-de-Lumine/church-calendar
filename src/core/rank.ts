// ruby: lib/calendarium-romanum/rank.rb

import { i18n } from './i18n.js';

/**
 * Celebration rank.
 *
 * **The comparison is inverted** (ruby: `def <=>(other); other.priority <=> priority; end`):
 * the *lower* the priority number, the *higher* the rank. `Ranks::TRIDUUM`
 * (1.1) is therefore "greater than" `Ranks::FERIAL` (3.13).
 */
export class Rank {
  /** Number in the Table of Liturgical Days. */
  readonly priority: number;
  private readonly _desc: string | null;
  private readonly _shortDesc: string | null;

  constructor(priority: number, desc: string | null = null, shortDesc: string | null = null) {
    this.priority = priority;
    this._desc = desc;
    this._shortDesc = shortDesc;
  }

  /** ruby: `Rank#to_f` */
  toF(): number {
    return this.priority;
  }

  /** Full description — internationalized human-readable string. */
  desc(): string | null {
    return this._desc === null ? null : i18n.t(this._desc);
  }

  /** Short name — internationalized human-readable string. */
  shortDesc(): string | null {
    return this._shortDesc === null ? null : i18n.t(this._shortDesc);
  }

  /**
   * ruby: `Rank#<=>` — `other.priority <=> priority`.
   *
   * Positive when `this` outranks `other`. Note the inversion.
   */
  compare(other: Rank): number {
    if (other.priority < this.priority) return -1;
    if (other.priority > this.priority) return 1;
    return 0;
  }

  /** ruby: `Rank#==` (via `Comparable`) — equal priority means equal rank. */
  equals(other: Rank): boolean {
    return this.compare(other) === 0;
  }

  /** ruby: `rank > other` */
  gt(other: Rank): boolean {
    return this.compare(other) > 0;
  }

  /** ruby: `rank >= other` */
  gte(other: Rank): boolean {
    return this.compare(other) >= 0;
  }

  /** ruby: `rank < other` */
  lt(other: Rank): boolean {
    return this.compare(other) < 0;
  }

  /** ruby: `rank <= other` */
  lte(other: Rank): boolean {
    return this.compare(other) <= 0;
  }

  /** ruby: `Rank#solemnity?` — `priority.to_i == 1` */
  isSolemnity(): boolean {
    return Math.trunc(this.priority) === 1;
  }

  /** ruby: `Rank#sunday?` */
  isSunday(): boolean {
    return this.priority === 2.6;
  }

  /** ruby: `Rank#feast?` — `priority.to_i == 2` */
  isFeast(): boolean {
    return Math.trunc(this.priority) === 2;
  }

  /** ruby: `Rank#memorial?` — `priority.to_i == 3 && priority <= 3.12` */
  isMemorial(): boolean {
    return Math.trunc(this.priority) === 3 && this.priority <= 3.12;
  }

  /** ruby: `Rank#ferial?` — FERIAL or FERIAL_PRIVILEGED */
  isFerial(): boolean {
    return this.priority === 3.13 || this.priority === 2.9;
  }

  toString(): string {
    return `#<Rank @priority=${this.priority} desc=${JSON.stringify(this.desc())}>`;
  }
}
