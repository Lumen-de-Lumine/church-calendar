/**
 * Calendar data added after the 2.7.0 capture (README deviation 7, docs/QUIRKS.md Q37).
 *
 * The baseline fixtures stay exactly as captured. The conformance tests compare
 * against `withDataUpdates(captured)` instead, and the byte-parity tests strip
 * the added celebrations from the response with `withoutDataUpdates(body)`.
 */

import type { BaselineCelebration, BaselineDay } from './fixtures.js';

/**
 * Saint John Henry Newman, inscribed in the General Roman Calendar on 10/9 (decree
 * published 2026-02-03). He shares the date, the rank and the colour of Saint John
 * Leonardi in every data file, so the Ruby precedence logic would list him exactly
 * where it lists `leonardi`, immediately after it.
 */
const NEWMAN_AFTER_LEONARDI: Readonly<Record<string, string>> = {
  // universal-en
  'Saint John Leonardi, Priest': 'Saint John Henry Newman, Priest and Doctor of the Church',
  // universal-la
  'S. Ioannis Leonardi, presbyteri': 'S. Ioannis Henrici Newman, presbyteri et Ecclesiae doctoris',
  // universal-it (universal-fr and universal-es cannot be loaded at all, QUIRKS Q10)
  'San Giovanni Leonardi, sacerdote': 'San Giovanni Enrico Newman, sacerdote e dottore della Chiesa',
  // czech-cs
  'Sv. Jana Leonardiho, kněze': 'Sv. Johna Henryho Newmana, kněze a učitele církve',
};

function withNewman(celebrations: readonly BaselineCelebration[]): BaselineCelebration[] {
  return celebrations.flatMap((cel) => {
    if (cel.id !== 'leonardi') return [cel];
    const title = NEWMAN_AFTER_LEONARDI[cel.title];
    if (title === undefined) throw new Error(`no Newman title for leonardi titled ${JSON.stringify(cel.title)}`);
    return [cel, { ...cel, title, id: 'newman' }];
  });
}

/** The captured days as the current data computes them. */
export function withDataUpdates(days: readonly BaselineDay[]): BaselineDay[] {
  return days.map((day) => withDataUpdatesDay(day));
}

export function withDataUpdatesDay(day: BaselineDay): BaselineDay {
  return { ...day, celebrations: withNewman(day.celebrations) };
}

/**
 * A raw JSON response body with the added celebrations cut out, which must then be
 * byte-identical to the capture. Each one is a compact object preceded by a comma,
 * as `formatEntity` writes it; anything else is left in place and fails the comparison.
 */
export function withoutDataUpdates(body: string): string {
  return body.replace(/,\{"title":"[^"]*","colour":"white","rank":"[^"]*","rank_num":3\.12,"id":"newman"\}/g, '');
}
