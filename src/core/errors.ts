// ruby: lib/calendarium-romanum/errors.rb

/**
 * Thrown by {@link SanctoraleLoader} on attempt to load invalid data.
 *
 * ruby: `class InvalidDataError < RuntimeError`
 */
export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDataError';
  }
}

/**
 * Stand-in for Ruby's `ArgumentError`, which {@link Sanctorale} raises when an
 * operation would break its invariants (duplicate symbols, incompatible ranks
 * on one day) and which {@link PerpetualCalendar}/{@link Temporale} raise for
 * invalid constructor arguments.
 *
 * Not part of calendarium-romanum's own class list (Ruby uses the built-in
 * `ArgumentError`); added here so the api layer can distinguish it from a
 * programming error.
 */
export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgumentError';
  }
}

/**
 * Stand-in for Ruby's `I18n::InvalidLocale`, raised by `i18n.setLocale` for a
 * locale the gem does not ship (`I18n.enforce_available_locales` is `true`).
 */
export class InvalidLocaleError extends Error {
  constructor(locale: string) {
    super(`:${locale} is not a valid locale`);
    this.name = 'InvalidLocaleError';
  }
}
