/**
 * `CalendarRepository` — the config view, the per-call facade, the temporale
 * options and the sanctorale cache.
 */

import { CalendarRepository, buildTemporaleOptions, calendars } from '../../src/api/calendar-repository.js';
import { CALENDAR_IDS, calendarConfig, hasCalendar } from '../../src/api/calendars-config.js';
import { serializeDay } from '../../src/api/entities.js';
import { UnknownCalendarError } from '../../src/api/errors.js';
import { CalDate } from '../../src/core/cal-date.js';
import { Data } from '../../src/core/data.js';
import { i18n } from '../../src/core/i18n.js';
import { loadJson } from '../helpers/fixtures.js';

describe('keys / has', () => {
  it('returns the 25 ids in config-file order, exactly as GET /calendars does', () => {
    const fixture = loadJson<{ body: string[] }>('misc/calendars.json');
    expect(calendars.keys()).toEqual(fixture.body);
    expect(CALENDAR_IDS).toEqual(fixture.body);
  });

  it('has()', () => {
    expect(calendars.has('us')).toBe(true);
    expect(calendars.has('default')).toBe(true);
    expect(calendars.has('nope')).toBe(false);
    expect(hasCalendar('constructor')).toBe(false);
    expect(hasCalendar('__proto__')).toBe(false);
  });

  it('unknown id raises', () => {
    expect(() => calendars.get('nope')).toThrow(UnknownCalendarError);
  });
});

describe('temporale options', () => {
  it('us gets ThanksgivingUS and three Sunday transfers', () => {
    const options = buildTemporaleOptions(calendarConfig('us')!);
    expect(options?.extensions?.length).toBe(1);
    expect(options?.transferToSunday).toEqual(['epiphany', 'ascension', 'corpus_christi']);
  });

  it('us-ascension keeps Ascension on the Thursday', () => {
    const options = buildTemporaleOptions(calendarConfig('us-ascension')!);
    expect(options?.transferToSunday).toEqual(['epiphany', 'corpus_christi']);
  });

  it('czech gets ChristEternalPriest and no transfers', () => {
    const options = buildTemporaleOptions(calendarConfig('czech')!);
    expect(options?.extensions?.length).toBe(1);
    expect(options?.transferToSunday).toBeUndefined();
  });

  it('general-la has no options at all (ruby returns nil)', () => {
    expect(buildTemporaleOptions(calendarConfig('general-la')!)).toBeUndefined();
  });

  it('the options really change the output', () => {
    const asIso = (cal: string, d: string): string[] =>
      i18n.withLocale('en', () =>
        serializeDay(calendars.get(cal).day(CalDate.fromISO(d))).celebrations.map((c) => c.id ?? ''),
      );
    expect(asIso('us', '2026-05-14')).toEqual(['matthias']);
    expect(asIso('us-ascension', '2026-05-14')).toEqual(['ascension']);
  });
});

describe('every configured calendar builds (except the two known-broken ones)', () => {
  for (const key of CALENDAR_IDS) {
    const broken = key === 'general-fr' || key === 'general-es';
    it(`${key}${broken ? ' throws (Q10)' : ''}`, () => {
      if (broken) {
        expect(() => calendars.get(key)).toThrow(/faustina_kowalska/);
        return;
      }
      const facade = calendars.get(key);
      expect(typeof facade.metadata.title).toBe('string');
      const day = i18n.withLocale('en', () => serializeDay(facade.day(CalDate.fromISO('2026-09-18'))));
      expect(day.date).toBe('2026-09-18');
    });
  }
});

describe('a fresh PerpetualCalendar per get(), like Ruby', () => {
  it('two facades do not share a Calendar cache', () => {
    const a = calendars.get('us');
    const b = calendars.get('us');
    expect(a).not.toBe(b);
    expect(a.year(2026)).not.toBe(b.year(2026));
  });

  it('but one facade reuses its own per-liturgical-year Calendar', () => {
    const facade = calendars.get('us');
    expect(facade.year(2026)).toBe(facade.year(2026));
  });
});

describe('sanctorale cache', () => {
  it('is on by default and can be turned off', () => {
    const cached = new CalendarRepository();
    const uncached = new CalendarRepository({ cacheSanctorale: false });
    const day = (r: CalendarRepository): unknown =>
      i18n.withLocale('en', () => serializeDay(r.get('us').day(CalDate.fromISO('2026-08-14'))));
    expect(day(cached)).toEqual(day(uncached));
  });

  it('clearCache() forces a reload without changing the answer', () => {
    const repository = new CalendarRepository();
    const before = i18n.withLocale('en', () =>
      serializeDay(repository.get('us').day(CalDate.fromISO('2026-08-14'))),
    );
    repository.clearCache();
    const after = i18n.withLocale('en', () =>
      serializeDay(repository.get('us').day(CalDate.fromISO('2026-08-14'))),
    );
    expect(after).toEqual(before);
  });

  it('parses each packaged file once, however many facades are built (the reason it exists)', () => {
    const cached = new CalendarRepository({ cacheSanctorale: true });
    const uncached = new CalendarRepository({ cacheSanctorale: false });
    const file = Data['us-en'];
    const load = file.load;
    let loads = 0;
    file.load = function countedLoad(this: typeof file) {
      loads += 1;
      return load.call(this);
    };
    try {
      for (let i = 0; i < 3; i += 1) cached.get('us');
      expect(loads).toBe(1);
      for (let i = 0; i < 3; i += 1) uncached.get('us');
      expect(loads).toBe(4);
    } finally {
      file.load = load;
    }
  });
});

describe('metadata', () => {
  it('exposes the raw config, as the Roda picker needs', () => {
    expect(calendars.metadata.us.title).toBe('US Calendar');
    expect(calendars.metadata['general-la'].language).toBe('la');
    expect(calendars.metadata.default.title).toBe('Calendarium Romanum Generale');
  });

  it('entries() preserves the file order', () => {
    expect(calendars.entries().map((e) => e.key)).toEqual([...CALENDAR_IDS]);
  });
});
