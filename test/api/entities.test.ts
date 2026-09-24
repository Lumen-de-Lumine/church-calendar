/**
 * `serializeDay` / `serializeCelebration` — the two Grape entities.
 * The anchors are the ones a Ruby characterization spec pins against 2.7.0.
 */

import { calendars } from '../../src/api/calendar-repository.js';
import {
  CALENDAR_SYSTEM_DESC,
  WDAYS,
  serializeCalendarDescription,
  serializeCelebration,
  serializeDay,
  serializeDays,
} from '../../src/api/entities.js';
import { CalDate } from '../../src/core/cal-date.js';
import { i18n } from '../../src/core/i18n.js';
import { CELEBRATION_KEYS, DAY_KEYS, loadDay } from '../helpers/fixtures.js';

const us = calendars.get('us');

function day(y: number, m: number, d: number, locale = 'en') {
  return i18n.withLocale(locale, () => serializeDay(us.day(new CalDate(y, m, d))));
}

describe('key order', () => {
  it('Day exposes exactly the nine keys, in declaration order', () => {
    expect(Object.keys(day(2015, 6, 26))).toEqual([...DAY_KEYS]);
  });

  it('Celebration exposes exactly the five keys, in declaration order', () => {
    expect(Object.keys(day(2015, 6, 26).celebrations[0])).toEqual([...CELEBRATION_KEYS]);
  });

  it('vespers uses the same entity, so the same key order', () => {
    const d = day(2025, 8, 16);
    expect(d.vespers).not.toBeNull();
    expect(Object.keys(d.vespers ?? {})).toEqual([...CELEBRATION_KEYS]);
  });
});

describe('rank = short_desc || desc', () => {
  it('short descriptions', () => {
    expect(day(2015, 6, 26).celebrations[0].rank).toBe('ferial');
    expect(day(2016, 9, 25).celebrations[0].rank).toBe('Sunday');
    expect(day(2025, 8, 15).celebrations[0].rank).toBe('solemnity');
    expect(day(2025, 8, 16).celebrations[1].rank).toBe('optional memorial');
    expect(day(2025, 12, 23).celebrations[1].rank).toBe('commemoration');
  });

  it('falls back to the LONG description for ranks 1.1 and 1.2', () => {
    expect(day(2025, 11, 30).celebrations[0].rank).toBe('Primary liturgical days');
    expect(day(2026, 4, 3).celebrations[0].rank).toBe('Easter triduum');
    expect(day(2026, 4, 6).celebrations[0].rank).toBe('Primary liturgical days');
  });
});

describe('rank_num', () => {
  it('is the Rank priority, and the Ruby literal 3.10 IS 3.1', () => {
    expect(day(2015, 6, 11).celebrations[0].rank_num).toBe(3.1);
  });

  it('a commemoration is the number 4 once parsed (4.0 on the wire)', () => {
    expect(day(2025, 12, 23).celebrations[1].rank_num).toBe(4);
  });
});

describe('cycle is a String on Sundays and a Number otherwise', () => {
  it('Sunday', () => {
    const d = day(2016, 9, 25);
    expect(d.cycle).toBe('C');
    expect(typeof d.cycle).toBe('string');
    expect(d.cycle_sunday).toBe('C');
    expect(d.cycle_ferial).toBe(2);
  });

  it('weekday', () => {
    const d = day(2015, 6, 26);
    expect(d.cycle).toBe(1);
    expect(typeof d.cycle).toBe('number');
  });
});

describe('id', () => {
  it('is null for a temporale day with no symbol', () => {
    expect(day(2015, 6, 26).celebrations[0].id).toBeNull();
    expect(day(2016, 9, 25).celebrations[0].id).toBeNull();
  });

  it('is the symbol when there is one', () => {
    expect(day(2025, 8, 15).celebrations[0].id).toBe('assumption');
    expect(day(2025, 12, 17).celebrations[0].id).toBe('advent_wednesday_december17');
  });
});

describe('weekday is NEVER localized', () => {
  it('stays English in cs', () => {
    expect(day(2026, 9, 18, 'cs').weekday).toBe('friday');
    expect(day(2026, 9, 18, 'la').weekday).toBe('friday');
  });

  it('matches WDAYS[date.wday]', () => {
    expect(WDAYS[new Date(Date.UTC(2026, 8, 18)).getUTCDay()]).toBe('friday');
  });
});

describe('exact objects', () => {
  it('a ferial matches the captured fixture byte for byte after parsing', () => {
    expect(day(2026, 9, 18)).toEqual(loadDay('us', '2026-09-18'));
  });

  it('serializeDays maps positionally', () => {
    const days = i18n.withLocale('en', () =>
      serializeDays(us.daysBetween(new CalDate(2026, 1, 1), new CalDate(2026, 1, 3))),
    );
    expect(days.map((d) => d.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });

  it('serializeCelebration is reusable on its own', () => {
    const celebration = us.day(new CalDate(2025, 8, 15)).celebrations[0];
    expect(i18n.withLocale('en', () => serializeCelebration(celebration))).toEqual({
      title: 'The Assumption of the Blessed Virgin Mary',
      colour: 'white',
      rank: 'solemnity',
      rank_num: 1.3,
      id: 'assumption',
    });
  });
});

describe('calendar description', () => {
  it('is the system block plus the calendar title and language', () => {
    expect(serializeCalendarDescription('US Calendar', 'en')).toEqual({
      system: CALENDAR_SYSTEM_DESC,
      sanctorale: { title: 'US Calendar', language: 'en' },
    });
  });

  it('the system block never changes', () => {
    expect(CALENDAR_SYSTEM_DESC).toEqual({
      promulgated: 1969,
      effective_since: 1970,
      desc:
        'promulgated by motu proprio Mysterii Paschalis of Paul VI. ' +
        '(AAS 61 (1969), pp. 222-226).',
    });
  });
});
