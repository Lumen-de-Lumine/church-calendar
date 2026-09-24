// ruby: lib/calendarium-romanum/temporale/celebration_factory.rb

import { AbstractDate } from '../abstract-date.js';
import { Celebration } from '../day.js';
import type { Colour } from '../enums.js';
import { Colours, Ranks } from '../enums.js';
import type { Rank } from '../rank.js';
import { i18n } from '../i18n.js';
import { Ordinalizer } from '../ordinalizer.js';

interface CelebrationOptions {
  fixedDate?: AbstractDate;
  hasVigil?: boolean;
  hasEvening?: boolean;
  moveIfSunday?: boolean;
}

/** ruby: `Temporale.create_celebration` — inlined here to avoid a module cycle. */
function temporaleCelebration(
  symbol: string,
  rank: Rank,
  colour: Colour = Colours.WHITE,
  opts: CelebrationOptions = {},
): Celebration {
  return new Celebration({
    title: () => i18n.t(`temporale.solemnity.${symbol}`),
    rank,
    colour,
    symbol,
    date: opts.fixedDate ?? null,
    cycle: 'temporale',
    hasVigil: opts.hasVigil ?? false,
    hasEvening: opts.hasEvening ?? false,
    moveIfSunday: opts.moveIfSunday ?? false,
  });
}

/**
 * ruby: this one builds its title **eagerly** (not through a `Proc`), so it is
 * localized at the moment the factory method is called, not when `#title` is read.
 */
const firstAdventSunday = (): Celebration =>
  new Celebration({
    title: i18n.t('temporale.advent.sunday', { week: Ordinalizer.ordinal(1) }),
    rank: Ranks.PRIMARY,
    colour: Colours.VIOLET,
    cycle: 'temporale',
  });

const nativity = (): Celebration =>
  temporaleCelebration('nativity', Ranks.PRIMARY, Colours.WHITE, {
    fixedDate: new AbstractDate(12, 25),
    hasVigil: true,
  });

const holyFamily = (): Celebration => temporaleCelebration('holy_family', Ranks.FEAST_LORD_GENERAL);

const motherOfGod = (): Celebration =>
  temporaleCelebration('mother_of_god', Ranks.SOLEMNITY_GENERAL, Colours.WHITE, {
    fixedDate: new AbstractDate(1, 1),
  });

const epiphany = (): Celebration =>
  temporaleCelebration('epiphany', Ranks.PRIMARY, Colours.WHITE, { hasVigil: true });

const baptismOfLord = (): Celebration =>
  temporaleCelebration('baptism_of_lord', Ranks.FEAST_LORD_GENERAL);

const ashWednesday = (): Celebration =>
  temporaleCelebration('ash_wednesday', Ranks.PRIMARY, Colours.VIOLET);

const holyThursday = (): Celebration =>
  temporaleCelebration('holy_thursday', Ranks.TRIDUUM, Colours.VIOLET, { hasEvening: true });

const goodFriday = (): Celebration =>
  temporaleCelebration('good_friday', Ranks.TRIDUUM, Colours.RED);

const holySaturday = (): Celebration =>
  temporaleCelebration('holy_saturday', Ranks.TRIDUUM, Colours.VIOLET);

const palmSunday = (): Celebration =>
  temporaleCelebration('palm_sunday', Ranks.PRIMARY, Colours.RED);

const easterSunday = (): Celebration =>
  temporaleCelebration('easter_sunday', Ranks.TRIDUUM, Colours.WHITE, { hasVigil: true });

const ascension = (): Celebration =>
  temporaleCelebration('ascension', Ranks.PRIMARY, Colours.WHITE, { hasVigil: true });

const pentecost = (): Celebration =>
  temporaleCelebration('pentecost', Ranks.PRIMARY, Colours.RED, { hasVigil: true });

const holyTrinity = (): Celebration => temporaleCelebration('holy_trinity', Ranks.SOLEMNITY_GENERAL);

const corpusChristi = (): Celebration =>
  temporaleCelebration('corpus_christi', Ranks.SOLEMNITY_GENERAL);

const sacredHeart = (): Celebration => temporaleCelebration('sacred_heart', Ranks.SOLEMNITY_GENERAL);

const christKing = (): Celebration => temporaleCelebration('christ_king', Ranks.SOLEMNITY_GENERAL);

const motherOfChurch = (): Celebration =>
  temporaleCelebration('mother_of_church', Ranks.MEMORIAL_GENERAL);

const immaculateHeart = (): Celebration =>
  temporaleCelebration('immaculate_heart', Ranks.MEMORIAL_GENERAL);

const saturdayMemorialBvm = (): Celebration =>
  temporaleCelebration('saturday_memorial_bvm', Ranks.MEMORIAL_OPTIONAL);

/** ruby: the private `CelebrationFactory.celebrations` list, in declaration order. */
const ALL: ReadonlyArray<() => Celebration> = [
  firstAdventSunday,
  nativity,
  holyFamily,
  motherOfGod,
  epiphany,
  baptismOfLord,
  ashWednesday,
  holyThursday,
  goodFriday,
  holySaturday,
  palmSunday,
  easterSunday,
  ascension,
  pentecost,
  holyTrinity,
  corpusChristi,
  sacredHeart,
  christKing,
  motherOfChurch,
  immaculateHeart,
  saturdayMemorialBvm,
];

/**
 * Provides factory methods building {@link Celebration}s for temporale feasts.
 *
 * Every method returns a **fresh** instance, exactly like the Ruby singleton methods.
 */
export const CelebrationFactory = {
  firstAdventSunday,
  nativity,
  holyFamily,
  motherOfGod,
  epiphany,
  baptismOfLord,
  ashWednesday,
  holyThursday,
  goodFriday,
  holySaturday,
  palmSunday,
  easterSunday,
  ascension,
  pentecost,
  holyTrinity,
  corpusChristi,
  sacredHeart,
  christKing,
  motherOfChurch,
  immaculateHeart,
  saturdayMemorialBvm,

  /** ruby: `CelebrationFactory.each` */
  each(fn?: (celebration: Celebration) => void): Celebration[] {
    const all = ALL.map((factory) => factory());
    if (fn) all.forEach(fn);
    return all;
  },
};
