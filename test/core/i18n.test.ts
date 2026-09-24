// ported from: calendarium-romanum/spec/i18n_spec.rb

import { Day } from '../../src/core/day.js';
import { Ranks } from '../../src/core/enums.js';
import { InvalidLocaleError } from '../../src/core/errors.js';
import { AVAILABLE_LOCALES, LOCALES, i18n } from '../../src/core/i18n.js';
import type { Locale, LocaleTree } from '../../src/core/i18n.js';
import { Temporale } from '../../src/core/temporale.js';
import { d } from './support.js';

const temporale = () => new Temporale(2016);
const easterCelebration = () => temporale().get(d(2017, 4, 16));

afterEach(() => {
  i18n.setLocale('en');
});

describe('internationalization', () => {
  describe('supported locales', () => {
    describe('English', () => {
      beforeEach(() => i18n.setLocale('en'));

      it('translates Temporale feast names', () => {
        // ruby spec says 'Easter Sunday'; the Lumen-de-Lumine fork retitled it
        expect(easterCelebration().title).toBe('Easter Sunday of the Resurrection of the Lord');
      });

      it('translates rank names', () => {
        const rank = Ranks.SUNDAY_UNPRIVILEGED;
        expect(rank.desc()).toBe('Unprivileged Sundays');
        expect(rank.shortDesc()).toBe('Sunday');
      });

      it('translates Day weekday names', () => {
        const sunday = new Day({ date: d(2018, 5, 20) });
        expect(sunday.weekdayName()).toBe('Sunday');
      });
    });

    describe('Czech', () => {
      beforeEach(() => i18n.setLocale('cs'));

      it('translates Temporale feast names', () => {
        expect(easterCelebration().title).toBe('Zmrtvýchvstání Páně');
      });

      it('translates rank names', () => {
        const rank = Ranks.SUNDAY_UNPRIVILEGED;
        expect(rank.desc()).toBe('Neprivilegované neděle');
        expect(rank.shortDesc()).toBe('neděle');
      });

      it('translates Day weekday names', () => {
        const sunday = new Day({ date: d(2018, 5, 20) });
        expect(sunday.weekdayName()).toBe('Neděle');
      });
    });
  });

  describe('unsupported locale', () => {
    it('switching to it fails (ruby: I18n.enforce_available_locales)', () => {
      expect(() => i18n.setLocale('de')).toThrow(InvalidLocaleError);
    });
  });

  describe('all locales have the same set of strings', () => {
    function keys(tree: LocaleTree, parents: string[] = []): string[] {
      return Object.entries(tree).flatMap(([key, value]) =>
        typeof value === 'string' ? [...parents, key].join('.') : keys(value, [...parents, key]),
      );
    }

    // ruby requires every locale to have exactly the keys of :la. The fork broke
    // that: it added Holy Thursday titles to :la and :en only, and a batch of
    // vigil/evening titles to :en only. Recorded here as it actually is — the
    // I18n fallback to :en is what keeps the missing keys harmless.
    const defaultLocale: Locale = 'la';
    const FORK_ONLY_IN_LA_AND_EN = [
      'temporale.solemnity.holy_thursday',
      'temporale.solemnity.holy_thursday_evening',
    ];
    const tested = AVAILABLE_LOCALES.filter((l) => l !== defaultLocale && l !== 'en');

    it.each(tested)("'%s' has the keys of 'la' minus the fork's additions", (locale) => {
      const expected = keys(LOCALES[defaultLocale]).filter(
        (k) => !FORK_ONLY_IN_LA_AND_EN.includes(k),
      );
      expect(keys(LOCALES[locale])).toEqual(expected);
    });

    it("'en' is a strict superset of 'la'", () => {
      const en = new Set(keys(LOCALES.en));
      for (const key of keys(LOCALES[defaultLocale])) {
        expect(en.has(key)).toBe(true);
      }
      expect(en.size).toBeGreaterThan(keys(LOCALES[defaultLocale]).length);
    });
  });

  describe('fallbacks', () => {
    it('falls back to :en for a key missing in the locale', () => {
      // 'la' has no sanctorale.* keys at all
      expect(i18n.exists('sanctorale.solemnity.assumption_vigil', 'la')).toBe(false);
      expect(i18n.t('sanctorale.solemnity.assumption_vigil', undefined, { locale: 'la' })).toBe(
        'The Assumption of the Blessed Virgin Mary: At the Vigil Mass',
      );
    });

    it('returns the gem placeholder for a key missing everywhere', () => {
      expect(i18n.t('no.such.key', undefined, { locale: 'la' })).toBe(
        'translation missing: la.no.such.key',
      );
      expect(i18n.t('no.such.key', undefined, { locale: 'en' })).toBe(
        'translation missing: en.no.such.key',
      );
    });
  });

  describe('interpolation', () => {
    it('substitutes %{...} placeholders', () => {
      expect(i18n.t('temporale.ordinary.sunday', { week: '2nd' }, { locale: 'en' })).toBe(
        '2nd Sunday in Ordinary Time',
      );
      expect(
        i18n.t('temporale.ordinary.ferial', { week: '24th', weekday: 'Friday' }, { locale: 'en' }),
      ).toBe('Friday of the 24th Week in Ordinary Time');
    });
  });

  describe('quoted numeric keys', () => {
    it('resolves rank and weekday keys', () => {
      expect(i18n.t('rank.1_1', undefined, { locale: 'en' })).toBe('Easter triduum');
      expect(i18n.t('weekday.0', undefined, { locale: 'en' })).toBe('Sunday');
      expect(i18n.t('weekday.6', undefined, { locale: 'la' })).toBe('Sabbato');
    });
  });

  describe('withLocale', () => {
    it('restores the previous locale, even on throw', () => {
      i18n.setLocale('cs');
      expect(() =>
        i18n.withLocale('en', () => {
          expect(i18n.locale).toBe('en');
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(i18n.locale).toBe('cs');
    });
  });

  describe('titles built from Procs', () => {
    it('are localized at access time, not at construction time', () => {
      const celebration = easterCelebration();
      expect(i18n.withLocale('en', () => celebration.title)).toBe(
        'Easter Sunday of the Resurrection of the Lord',
      );
      expect(i18n.withLocale('cs', () => celebration.title)).toBe('Zmrtvýchvstání Páně');
      expect(i18n.withLocale('la', () => celebration.title)).toBe(
        'Dominica Paschae in Resurrectione Domini',
      );
    });
  });
});
