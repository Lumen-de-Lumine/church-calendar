// ruby: lib/calendarium-romanum/ordinalizer.rb
//
// Includes an inlined port of the `roman-numerals` gem's `RomanNumerals.to_roman`
// (standard subtractive notation; `to_roman(0)` yields an empty string, which
// `Temporale#ferial` relies on for Lent week 0 and Christmas week 0 in :la/:it).

import { i18n } from './i18n.js';
import type { Locale } from './i18n.js';

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** ruby: `RomanNumerals.to_roman` (gem `roman-numerals` ~> 0.3) */
export function toRoman(number: number): string {
  let rest = number;
  let result = '';
  for (const [value, letter] of ROMAN) {
    while (rest >= value) {
      result += letter;
      rest -= value;
    }
  }
  return result;
}

function englishOrdinal(number: number): string {
  let modulo = number % 10;
  if (Math.floor(number / 10) === 1) modulo = 9; // ruby: `number / 10` (floor division)

  switch (modulo) {
    case 1:
      return `${number}st`;
    case 2:
      return `${number}nd`;
    case 3:
      return `${number}rd`;
    default:
      return `${number}th`;
  }
}

function frenchOrdinal(number: number): string {
  return number === 1 ? '1er' : `${number}ème`;
}

/** Knows how to produce localized ordinals. Used by {@link Temporale}. */
export const Ordinalizer = {
  /**
   * ruby: `Ordinalizer.ordinal(number, locale: nil)`
   *
   * @returns the ordinal, or the unchanged `number` for a locale we cannot
   *   build ordinals for.
   */
  ordinal(number: number, locale?: Locale | string | null): string | number {
    const effective = locale ?? i18n.locale;

    switch (effective) {
      case 'cs':
        return `${number}.`;
      case 'en':
        return englishOrdinal(number);
      case 'fr':
        return frenchOrdinal(number);
      case 'la':
      case 'it':
        return toRoman(number);
      default:
        return number;
    }
  },
};
