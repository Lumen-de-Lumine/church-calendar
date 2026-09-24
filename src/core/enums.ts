// ruby: lib/calendarium-romanum/enums.rb

import { createEnum } from './enum.js';
import type { EnumSet } from './enum.js';
import { i18n } from './i18n.js';
import { Rank } from './rank.js';

export type ColourSymbol = 'green' | 'violet' | 'white' | 'red';
export type SeasonSymbol = 'advent' | 'christmas' | 'lent' | 'easter' | 'ordinary';

/** ruby: `module ValueObjectInterface` */
abstract class ValueObject<S extends string> {
  /** Machine-readable internal representation of the value (ruby: `#symbol` / `#to_sym`). */
  readonly symbol: S;
  protected readonly i18nKey: string;

  protected constructor(symbol: S, i18nKey: string) {
    this.symbol = symbol;
    this.i18nKey = i18nKey;
  }

  /** ruby: `#to_sym` */
  toSym(): S {
    return this.symbol;
  }

  /** Internationalized, human-readable name. */
  name(): string {
    return i18n.t(this.i18nKey);
  }
}

/** Represents a liturgical colour. */
export class Colour extends ValueObject<ColourSymbol> {
  constructor(symbol: ColourSymbol) {
    super(symbol, `colour.${symbol}`);
  }

  override toString(): string {
    return `#<Colour ${this.symbol}>`;
  }
}

const GREEN = new Colour('green');
const VIOLET = new Colour('violet');
const WHITE = new Colour('white');
const RED = new Colour('red');

const colourEnum: EnumSet<Colour, ColourSymbol> = createEnum(
  [GREEN, VIOLET, WHITE, RED],
  (c) => c.symbol,
);

/** Standard set of liturgical colours. */
export const Colours = {
  GREEN,
  VIOLET,
  WHITE,
  RED,
  all: colourEnum.all,
  each: colourEnum.each,
  /** ruby: `Colours[:red]` */
  bySymbol(symbol: ColourSymbol | string): Colour | undefined {
    return colourEnum.get(symbol as ColourSymbol);
  },
};

/** Convenience alias (American English spelling). ruby: `Colors = Colours` */
export const Colors = Colours;

/** Liturgical season. */
export class Season extends ValueObject<SeasonSymbol> {
  /** Liturgical colour of the season's Sundays and ferials. */
  readonly colour: Colour;

  constructor(symbol: SeasonSymbol, colour: Colour) {
    super(symbol, `temporale.season.${symbol}`);
    this.colour = colour;
  }

  override toString(): string {
    return `#<Season ${this.symbol}>`;
  }
}

const ADVENT = new Season('advent', VIOLET);
const CHRISTMAS = new Season('christmas', WHITE);
const LENT = new Season('lent', VIOLET);
const EASTER = new Season('easter', WHITE);
const ORDINARY = new Season('ordinary', GREEN);

const seasonEnum: EnumSet<Season, SeasonSymbol> = createEnum(
  [ADVENT, CHRISTMAS, LENT, EASTER, ORDINARY],
  (s) => s.symbol,
);

/** Standard set of liturgical seasons. */
export const Seasons = {
  ADVENT,
  CHRISTMAS,
  LENT,
  EASTER,
  ORDINARY,
  all: seasonEnum.all,
  each: seasonEnum.each,
  /** ruby: `Seasons[:lent]` */
  bySymbol(symbol: SeasonSymbol | string): Season | undefined {
    return seasonEnum.get(symbol as SeasonSymbol);
  },
};

/** Sunday lectionary cycles. Values returned by `Calendar#lectionary`. */
export const LECTIONARY_CYCLES = ['A', 'B', 'C'] as const;
export type LectionaryCycle = (typeof LECTIONARY_CYCLES)[number];
export type FerialLectionaryCycle = 1 | 2;

// Celebration ranks as specified in the Table of Liturgical Days.
// NOTE: Ruby writes MEMORIAL_GENERAL's priority as `3.10`, which is the
// *number* 3.1 — it serializes as `3.1` in the API's `rank_num`.
const TRIDUUM = new Rank(1.1, 'rank.1_1');
const PRIMARY = new Rank(1.2, 'rank.1_2');
const SOLEMNITY_GENERAL = new Rank(1.3, 'rank.1_3', 'rank.short.solemnity');
const SOLEMNITY_PROPER = new Rank(1.4, 'rank.1_4', 'rank.short.solemnity');

const FEAST_LORD_GENERAL = new Rank(2.5, 'rank.2_5', 'rank.short.feast');
const SUNDAY_UNPRIVILEGED = new Rank(2.6, 'rank.2_6', 'rank.short.sunday');
const FEAST_GENERAL = new Rank(2.7, 'rank.2_7', 'rank.short.feast');
const FEAST_PROPER = new Rank(2.8, 'rank.2_8', 'rank.short.feast');
const FERIAL_PRIVILEGED = new Rank(2.9, 'rank.2_9', 'rank.short.ferial');

const MEMORIAL_GENERAL = new Rank(3.1, 'rank.3_10', 'rank.short.memorial');
const MEMORIAL_PROPER = new Rank(3.11, 'rank.3_11', 'rank.short.memorial');
const MEMORIAL_OPTIONAL = new Rank(3.12, 'rank.3_12', 'rank.short.memorial_opt');
const FERIAL = new Rank(3.13, 'rank.3_13', 'rank.short.ferial');
// Not included as a celebration rank on its own in the Table of Liturgical Days.
const COMMEMORATION = new Rank(4.0, 'rank.4_0', 'rank.short.commemoration');

const rankEnum: EnumSet<Rank, number> = createEnum(
  [
    TRIDUUM,
    PRIMARY,
    SOLEMNITY_GENERAL,
    SOLEMNITY_PROPER,

    FEAST_LORD_GENERAL,
    SUNDAY_UNPRIVILEGED,
    FEAST_GENERAL,
    FEAST_PROPER,
    FERIAL_PRIVILEGED,

    MEMORIAL_GENERAL,
    MEMORIAL_PROPER,
    MEMORIAL_OPTIONAL,
    FERIAL,

    COMMEMORATION,
  ],
  (r) => r.priority,
);

/**
 * Celebration ranks. Values double as references to sections of the Table of
 * Liturgical Days: **the lower the value, the higher the rank**.
 */
export const Ranks = {
  TRIDUUM,
  PRIMARY,
  SOLEMNITY_GENERAL,
  SOLEMNITY_PROPER,

  FEAST_LORD_GENERAL,
  SUNDAY_UNPRIVILEGED,
  FEAST_GENERAL,
  FEAST_PROPER,
  FERIAL_PRIVILEGED,

  MEMORIAL_GENERAL,
  MEMORIAL_PROPER,
  MEMORIAL_OPTIONAL,
  FERIAL,

  COMMEMORATION,

  all: rankEnum.all,
  each: rankEnum.each,
  /** ruby: `Ranks[1.1]` */
  byPriority(priority: number): Rank | undefined {
    return rankEnum.get(priority);
  },
};
