// ruby: lib/calendarium-romanum/temporale/extensions/thanksgiving_us.rb

import { CalDate } from '../../cal-date.js';
import { Celebration } from '../../day.js';
import { Colours, Ranks } from '../../enums.js';
import { i18n } from '../../i18n.js';
import { Dates } from '../dates.js';
import type { TemporaleExtensionEntry } from './types.js';

/**
 * Fourth Thursday of November.
 *
 * @param year liturgical year — November of the *following* civil year, which is
 *   where the end of the liturgical year falls.
 */
function thanksgiving(year: number): CalDate {
  return Dates.thursdayAfter(new CalDate(year + 1, 11, 21));
}

/**
 * {@link Temporale} extension adding "Thanksgiving Day", used by the US calendars.
 *
 * ruby: like {@link ChristEternalPriest}, the `Celebration.new` call passes no
 * `cycle`, so the celebration is in the **sanctorale** cycle.
 */
export const ThanksgivingUS = {
  name: 'ThanksgivingUS',
  thanksgiving,

  eachCelebration(): TemporaleExtensionEntry[] {
    return [
      [
        thanksgiving,
        new Celebration({
          title: () => i18n.t('temporale.extension.thanksgiving'),
          rank: Ranks.MEMORIAL_OPTIONAL,
          colour: Colours.WHITE,
          symbol: 'thanksgiving',
        }),
      ],
    ];
  },
};
