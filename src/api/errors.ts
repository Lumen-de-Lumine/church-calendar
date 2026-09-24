// ruby: apps/api/v0/controllers/api_v0.rb (`error!`) + Grape's validation errors
//
// Every API error the Ruby stack produces has the same JSON body shape:
//
//     {"error": "<message>"}
//
// and Grape's *error* formatter is the default one (`Grape::ErrorFormatter::Json`),
// NOT the custom `formatter :json` the controller installs for successful
// responses. Error bodies are therefore always COMPACT and carry no trailing
// newline, while success bodies do (see src/http/json.ts).

/** An error that the HTTP layer turns into `{"error": message}` with `status`. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Grape concatenates every failing validator's message with `", "` into a single
 * `error` string, in validator-declaration order across all params of the route.
 *
 * ruby: `Grape::Exceptions::ValidationErrors#message`
 */
export function validationError(messages: readonly string[]): ApiError {
  return new ApiError(400, messages.join(', '));
}

/** ruby: `KeyError` raised by `CalendarRepository#[]`. */
export class UnknownCalendarError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`key not found: ${JSON.stringify(key)}`);
    this.name = 'UnknownCalendarError';
    this.key = key;
  }
}

/**
 * ruby: `NotImplementedError` raised by `OrdinalizeFull#ordinalize_in_full` when
 * the `ordinalize_full` gem has no `n_<number>` translation (i.e. outside 1..100).
 */
export class OrdinalizeError extends Error {
  constructor(locale: string) {
    super(`Unknown locale ${locale}`);
    this.name = 'OrdinalizeError';
  }
}

/** ruby: `ArgumentError` from `Date.parse`, mapped to the route's own message. */
export class DateParseError extends Error {
  constructor(value: string) {
    super(`invalid date: ${JSON.stringify(value)}`);
    this.name = 'DateParseError';
  }
}
