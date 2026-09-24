/**
 * `parseDateParam` / `parseDateHeader` — the Ruby `Date.parse` subset.
 *
 * Every expectation below was produced by running the input through
 * `Date.parse` inside `sourceandsummit/church-calendar-api:2.7.0` on 2026-09-18.
 */

import { parseDateHeader, parseDateParam, today } from '../../src/api/dates.js';
import { DateParseError } from '../../src/api/errors.js';
import { CalDate } from '../../src/core/cal-date.js';

const ACCEPTED: readonly [string, string][] = [
  // exercised by the fixtures
  ['2026-09-18', '2026-09-18'],
  ['2026-09-18T14:00:00.000Z', '2026-09-18'],
  ['2026/9/18', '2026-09-18'],
  ['20260918', '2026-09-18'],
  ['18 Sep 2026', '2026-09-18'],
  ['Sep 18 2026', '2026-09-18'],
  ['2026-9-8', '2026-09-08'],
  ['25 Dec 2025', '2025-12-25'],
  // the three HTTP date formats
  ['Sat, 01 Jan 2000 01:00:00 GMT', '2000-01-01'],
  ['Saturday, 01-Jan-00 01:00:00 GMT', '2000-01-01'],
  ['Sat Jan  1 01:00:00 2000', '2000-01-01'],
  // other forms Ruby also accepts
  ['2026.9.18', '2026-09-18'],
  ['Sept 18 2026', '2026-09-18'],
  ['18/09/2026', '2026-09-18'],
  ['18-09-2026', '2026-09-18'],
  ['1-1-1', '2001-01-01'],
  ['Sep 2026', '2026-09-01'],
  ['September 18, 2026', '2026-09-18'],
  ['2026-09-18T14:00:00+02:00', '2026-09-18'],
  // JavaScript's `Date#toString()`, a long form, an ordinal day, ISO basic
  ['Fri Sep 18 2026 10:00:00 GMT+0000 (Coordinated Universal Time)', '2026-09-18'],
  ['Fri Sep 18 2026 00:30:00 GMT+1400 (Line Islands Time)', '2026-09-18'],
  ['Friday, September 18, 2026', '2026-09-18'],
  ['18th Sep 2026', '2026-09-18'],
  ['1st Jan 2000', '2000-01-01'],
  ['20260918T140000Z', '2026-09-18'],
  ['20260918T140000.123Z', '2026-09-18'],
];

const REJECTED: readonly string[] = [
  'garbage',
  '2026-13-01',
  '2026',
  '12/25/2025',
  '',
  '   ',
  'not-a-date',
  '2026-02-30',
  '0',
  '2026-09',
  '09/18/2026',
  '20260931',
  '20260931T140000Z',
  'Feb 29 2025 10:00:00 GMT+0000 (Coordinated Universal Time)',
  // Ruby reads these as a DIFFERENT date (2026-02-01, -2026-09-18): not implemented
  '2nd-Feb-2026',
  '18th Sep-2026',
];

describe('parseDateParam', () => {
  for (const [input, expected] of ACCEPTED) {
    it(`accepts ${JSON.stringify(input)} -> ${expected}`, () => {
      expect(parseDateParam(input).toISO()).toBe(expected);
    });
  }

  for (const input of REJECTED) {
    it(`rejects ${JSON.stringify(input)}`, () => {
      expect(() => parseDateParam(input)).toThrow(DateParseError);
    });
  }

  it('the DAY comes first in a d/m/y string, which is why 12/25/2025 fails', () => {
    expect(parseDateParam('05/06/2026').toISO()).toBe('2026-06-05');
    expect(() => parseDateParam('06/25/2026')).toThrow(DateParseError);
  });

  it('completes a two-digit year below 69 into the 2000s and above into the 1900s', () => {
    expect(parseDateParam('01-Jan-00').toISO()).toBe('2000-01-01');
    expect(parseDateParam('01-Jan-68').toISO()).toBe('2068-01-01');
    expect(parseDateParam('01-Jan-69').toISO()).toBe('1969-01-01');
    expect(parseDateParam('01-Jan-99').toISO()).toBe('1999-01-01');
  });

  it('a syntactically valid but non-existent date is still an error', () => {
    expect(() => parseDateParam('2015-02-29')).toThrow(DateParseError);
    expect(parseDateParam('2016-02-29').toISO()).toBe('2016-02-29');
  });

  it('returns a CalDate, never a JS Date', () => {
    expect(parseDateParam('2026-09-18')).toBeInstanceOf(CalDate);
  });
});

describe('parseDateHeader', () => {
  it('accepts the three HTTP date formats', () => {
    expect(parseDateHeader('Sat, 01 Jan 2000 01:00:00 GMT').toISO()).toBe('2000-01-01');
    expect(parseDateHeader('Saturday, 01-Jan-00 01:00:00 GMT').toISO()).toBe('2000-01-01');
    expect(parseDateHeader('Sat Jan  1 01:00:00 2000').toISO()).toBe('2000-01-01');
  });

  it('is `Date.parse`, so it also accepts non-HTTP dates (verified against 2.7.0)', () => {
    expect(parseDateHeader('2026-09-18').toISO()).toBe('2026-09-18');
  });

  it('rejects junk and the EMPTY string', () => {
    expect(() => parseDateHeader('not-a-date')).toThrow(DateParseError);
    expect(() => parseDateHeader('')).toThrow(DateParseError);
  });
});

describe('today()', () => {
  it('is a CalDate in UTC', () => {
    const now = new Date();
    expect(today().toISO()).toBe(
      `${String(now.getUTCFullYear()).padStart(4, '0')}-` +
        `${String(now.getUTCMonth() + 1).padStart(2, '0')}-` +
        `${String(now.getUTCDate()).padStart(2, '0')}`,
    );
  });
});
