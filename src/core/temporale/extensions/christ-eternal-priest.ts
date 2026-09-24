// ruby: lib/calendarium-romanum/temporale/extensions/christ_eternal_priest.rb

import type { CalDate } from '../../cal-date.js';
import { Celebration } from '../../day.js';
import { Colours, Ranks } from '../../enums.js';
import { i18n } from '../../i18n.js';
import { Dates } from '../dates.js';
import type { TemporaleExtensionEntry } from './types.js';

/** Computes the feast's date. @param year liturgical year */
function christEternalPriest(year: number): CalDate {
  return Dates.pentecost(year).addDays(4);
}

/**
 * {@link Temporale} extension adding the movable feast of "Christ Eternal Priest",
 * included in some local calendars (the Czech ones, here).
 *
 * ruby: the `Celebration.new` call passes no `cycle`, so the celebration ends up
 * in the **sanctorale** cycle despite being a temporale extension.
 */
export const ChristEternalPriest = {
  name: 'ChristEternalPriest',
  christEternalPriest,

  eachCelebration(): TemporaleExtensionEntry[] {
    return [
      [
        christEternalPriest,
        new Celebration({
          title: () => i18n.t('temporale.extension.christ_eternal_priest'),
          rank: Ranks.FEAST_PROPER,
          colour: Colours.WHITE,
        }),
      ],
    ];
  },
};
