// ruby: lib/calendarium-romanum/temporale/extensions/*.rb
//
// `CalendarRepository#build_temporale_options` looks extensions up by the exact
// Ruby constant name from config/calendars.yml (`ThanksgivingUS`,
// `ChristEternalPriest`), so the keys here must stay spelled that way.

import { ChristEternalPriest } from './christ-eternal-priest.js';
import { ThanksgivingUS } from './thanksgiving-us.js';

export { ChristEternalPriest, ThanksgivingUS };
export type { TemporaleExtension, TemporaleExtensionEntry } from './types.js';

export const Extensions = {
  ChristEternalPriest,
  ThanksgivingUS,
};
