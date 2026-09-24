// ported from: calendarium-romanum/spec/ordinalizer_spec.rb

import { i18n } from '../../src/core/i18n.js';
import { Ordinalizer, toRoman } from '../../src/core/ordinalizer.js';

describe('Ordinalizer', () => {
  describe('#ordinal', () => {
    describe('English', () => {
      it.each([
        [1, '1st'],
        [2, '2nd'],
        [3, '3rd'],
        [4, '4th'],
        [11, '11th'],
        [12, '12th'],
        [13, '13th'],
        [21, '21st'],
        [22, '22nd'],
        [23, '23rd'],
      ])('%p -> %p', (number, ordinal) => {
        expect(Ordinalizer.ordinal(number, 'en')).toBe(ordinal);
      });
    });

    describe('French', () => {
      it.each([
        [1, '1er'],
        [2, '2ème'],
        [3, '3ème'],
      ])('%p -> %p', (number, ordinal) => {
        expect(Ordinalizer.ordinal(number, 'fr')).toBe(ordinal);
      });
    });

    describe('Czech', () => {
      it.each([
        [1, '1.'],
        [34, '34.'],
      ])('%p -> %p', (number, ordinal) => {
        expect(Ordinalizer.ordinal(number, 'cs')).toBe(ordinal);
      });
    });

    describe('Latin and Italian use Roman numerals', () => {
      it.each([
        [1, 'I'],
        [3, 'III'],
        [4, 'IV'],
        [9, 'IX'],
        [24, 'XXIV'],
        [34, 'XXXIV'],
      ])('%p -> %p', (number, ordinal) => {
        expect(Ordinalizer.ordinal(number, 'la')).toBe(ordinal);
        expect(Ordinalizer.ordinal(number, 'it')).toBe(ordinal);
      });
    });

    describe('unsupported locale', () => {
      it.each([1, 2, 3])('%p is returned unchanged', (number) => {
        expect(Ordinalizer.ordinal(number, 'unsupported')).toBe(number);
      });
    });

    describe('default locale', () => {
      it('uses i18n.locale when none is given', () => {
        i18n.withLocale('fr', () => {
          expect(Ordinalizer.ordinal(2)).toBe('2ème');
        });
        i18n.withLocale('en', () => {
          expect(Ordinalizer.ordinal(2)).toBe('2nd');
        });
      });
    });
  });
});

describe('toRoman', () => {
  // `Temporale#ferial` builds the ordinal *before* deciding whether it is used,
  // so week 0 reaches RomanNumerals.to_roman in :la and :it.
  it('returns an empty string for 0', () => {
    expect(toRoman(0)).toBe('');
    expect(Ordinalizer.ordinal(0, 'la')).toBe('');
  });

  it.each([
    [1, 'I'],
    [4, 'IV'],
    [5, 'V'],
    [14, 'XIV'],
    [40, 'XL'],
    [90, 'XC'],
    [400, 'CD'],
    [1990, 'MCMXC'],
  ])('%p -> %p', (n, roman) => {
    expect(toRoman(n)).toBe(roman);
  });
});
