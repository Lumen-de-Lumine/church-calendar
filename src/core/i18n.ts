// ruby: lib/calendarium-romanum/i18n_setup.rb (+ the `i18n` gem, version 0.9.5,
//       with `I18n::Backend::Fallbacks` mixed in by church-calendar-api's
//       lib/church-calendar.rb)
//
// Only the slice of the gem that calendarium-romanum and church-calendar-api use
// is reproduced: `I18n.locale`, `I18n.t(key, **interpolations)`,
// `I18n.t(key, locale: :en)`, `I18n.with_locale`, `%{...}` interpolation,
// fallback to the default locale and the "translation missing: ..." placeholder.

import { AVAILABLE_LOCALES, LOCALES } from '../data/locales.js';
import type { Locale, LocaleTree } from '../data/locales.js';
import { InvalidLocaleError } from './errors.js';

export type { Locale, LocaleTree };

/** ruby: `I18n.default_locale` (the gem's own default, never changed by either project). */
export const DEFAULT_LOCALE: Locale = 'en';

const AVAILABLE: readonly Locale[] = AVAILABLE_LOCALES;

export type InterpolationValues = Record<string, string | number>;

export interface TranslateOptions {
  locale?: Locale;
}

let currentLocale: Locale = DEFAULT_LOCALE;

function isLocale(value: string): value is Locale {
  return (AVAILABLE as readonly string[]).includes(value);
}

/** ruby: `I18n.fallbacks[locale]` — `[locale, <language>, default_locale]`, deduplicated. */
function fallbackChain(locale: Locale): Locale[] {
  return locale === DEFAULT_LOCALE ? [locale] : [locale, DEFAULT_LOCALE];
}

function lookup(locale: Locale, key: string): string | undefined {
  let node: string | LocaleTree | undefined = LOCALES[locale];
  for (const segment of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[segment];
  }
  // A sub-tree is not a translation as far as this port is concerned
  // (the Ruby gem would return the Hash; no caller in either project does that).
  return typeof node === 'string' ? node : undefined;
}

/** ruby: the `i18n` gem's `%{name}` interpolation. */
function interpolate(template: string, values: InterpolationValues | undefined): string {
  if (!values) return template;
  return template.replace(/%\{([^}]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export const i18n = {
  /** ruby: `I18n.available_locales` */
  availableLocales: AVAILABLE,

  /** ruby: `I18n.locale` */
  get locale(): Locale {
    return currentLocale;
  },

  set locale(value: Locale) {
    i18n.setLocale(value);
  },

  /**
   * ruby: `I18n.locale = value`
   *
   * @throws {InvalidLocaleError} for a locale the gem does not ship
   *   (`I18n.enforce_available_locales` defaults to `true`).
   */
  setLocale(value: Locale | string): void {
    if (typeof value !== 'string' || !isLocale(value)) {
      throw new InvalidLocaleError(String(value));
    }
    currentLocale = value;
  },

  /** ruby: `I18n.with_locale(locale) { ... }` */
  withLocale<T>(locale: Locale | string, fn: () => T): T {
    const previous = currentLocale;
    i18n.setLocale(locale);
    try {
      return fn();
    } finally {
      currentLocale = previous;
    }
  },

  /**
   * ruby: `I18n.t(key, **interpolations)` / `I18n.t(key, locale: :xx)`
   *
   * Falls back to {@link DEFAULT_LOCALE} for keys missing in the requested
   * locale; if the key is missing everywhere, returns the gem's
   * `"translation missing: <requested locale>.<key>"` placeholder.
   */
  t(key: string, values?: InterpolationValues, options?: TranslateOptions): string {
    const locale = options?.locale ?? currentLocale;

    for (const candidate of fallbackChain(locale)) {
      const found = lookup(candidate, key);
      if (found !== undefined) {
        return interpolate(found, values);
      }
    }

    return `translation missing: ${locale}.${key}`;
  },

  /** True when `key` resolves to a string in `locale` itself (no fallback). */
  exists(key: string, locale: Locale = currentLocale): boolean {
    return lookup(locale, key) !== undefined;
  },
};

export { AVAILABLE_LOCALES, LOCALES };
