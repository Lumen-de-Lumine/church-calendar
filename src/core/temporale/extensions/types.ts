// ruby: the informal "#each_celebration" duck type that Temporale#prepare_solemnities
//       expects of everything passed in `extensions:`.

import type { CalDate } from '../../cal-date.js';
import type { Celebration } from '../../day.js';

/**
 * A date-computing function (receiving the civil year in which the liturgical
 * year begins) paired with the celebration to place on that date.
 *
 * ruby: the extension yields `[:method_name, celebration]` and `Temporale`
 * resolves the symbol against the extension itself; here the function is passed
 * directly.
 */
export type TemporaleExtensionEntry = [(year: number) => CalDate, Celebration];

/** ruby: any object responding to `#each_celebration`. */
export interface TemporaleExtension {
  eachCelebration(): Iterable<TemporaleExtensionEntry>;
}
