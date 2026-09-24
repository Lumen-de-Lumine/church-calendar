// Characterization tests for the fork-only features, pinned to output verified
// against the church-calendar-api 2.7.0 service, calendar `us`, lang `en`.

import { Ranks } from '../../src/core/enums.js';
import { i18n } from '../../src/core/i18n.js';
import { describeCelebration, usDay } from './support.js';

beforeEach(() => {
  i18n.setLocale('en');
});

describe('church-calendar-api 2.7.0 `us` calendar facts', () => {
  describe('2026-09-18 (a plain Ordinary Time Friday)', () => {
    const day = () => usDay(2026, 9, 18);

    it('has the expected season, week and cycles', () => {
      const d = day();
      expect(d.season?.symbol).toBe('ordinary');
      expect(d.seasonWeek).toBe(24);
      expect(d.cycle).toBe(2);
      expect(d.cycleSunday).toBe('A');
      expect(d.cycleFerial).toBe(2);
      expect(d.weekday()).toBe(5);
    });

    it('has one green ferial celebration and no vespers', () => {
      const d = day();
      expect(d.celebrations.map(describeCelebration)).toEqual([
        {
          title: 'Friday of the 24th Week in Ordinary Time',
          colour: 'green',
          rank: 'ferial',
          rank_num: 3.13,
          id: null,
        },
      ]);
      expect(d.vespers).toBeNull();
    });
  });

  describe('2026-11-28 (the last day of the liturgical year)', () => {
    const day = () => usDay(2026, 11, 28);

    it('is Ordinary Time week 34', () => {
      const d = day();
      expect(d.season?.symbol).toBe('ordinary');
      expect(d.seasonWeek).toBe(34);
    });

    it('offers the ferial plus the Saturday memorial of the BVM', () => {
      expect(day().celebrations.map(describeCelebration)).toEqual([
        {
          title: 'Saturday of the 34th Week in Ordinary Time',
          colour: 'green',
          rank: 'ferial',
          rank_num: 3.13,
          id: null,
        },
        {
          title: 'Mass for the Blessed Virgin Mary on Saturday',
          colour: 'white',
          rank: 'optional memorial',
          rank_num: 3.12,
          id: 'saturday_memorial_bvm',
        },
      ]);
    });

    it('falls back to the first Advent Sunday for Vespers (the RangeError path)', () => {
      const vespers = day().vespers;
      expect(vespers).not.toBeNull();
      expect(describeCelebration(vespers!)).toEqual({
        title: '1st Sunday of Advent',
        colour: 'violet',
        // Ranks::PRIMARY has no short_desc, so the api falls back to #desc
        rank: 'Primary liturgical days',
        rank_num: 1.2,
        id: null,
      });
      expect(vespers!.rank).toBe(Ranks.PRIMARY);
    });
  });

  // The equal-rank transfer quirk (docs/QUIRKS.md Q5): in 2022 the Sacred Heart
  // and the Nativity of John the Baptist collide on June 24 and MRI's stable
  // 2-element sort makes the TEMPORALE celebration the loser.
  describe('2022 Sacred Heart vs Nativity of John the Baptist', () => {
    it('2022-06-22: ferial + two optional memorials, no vespers, no vigil', () => {
      const d = usDay(2022, 6, 22);
      expect(d.celebrations.map((c) => [c.symbol, c.rank.priority])).toEqual([
        [null, 3.13],
        ['paulinus', 3.12],
        ['fisher_more', 3.12],
      ]);
      expect(d.vespers).toBeNull();
    });

    it('2022-06-23: plain ferial with first Vespers of the Sacred Heart', () => {
      const d = usDay(2022, 6, 23);
      expect(d.celebrations).toHaveLength(1);
      expect(d.celebrations[0].title).toBe('Thursday of the 12th Week in Ordinary Time');
      expect(d.vespers?.symbol).toBe('sacred_heart');
    });

    it('2022-06-24: the Sacred Heart wins the day (equal ranks do not displace it)', () => {
      const d = usDay(2022, 6, 24);
      expect(d.celebrations.map((c) => [c.symbol, c.rank.priority])).toEqual([
        ['sacred_heart', 1.3],
      ]);
    });

    it('2022-06-25: the Sacred Heart appears AGAIN as the transferred loser', () => {
      const d = usDay(2022, 6, 25);
      expect(d.celebrations.map((c) => [c.symbol, c.rank.priority])).toEqual([
        ['sacred_heart', 1.3],
      ]);
    });

    it('baptist_birth therefore disappears from the whole of 2022', () => {
      for (const day of [23, 24, 25, 26]) {
        const d = usDay(2022, 6, day);
        expect(d.celebrations.map((c) => c.symbol)).not.toContain('baptist_birth');
      }
    });

    it('2022-06-26 is the 13th Sunday in Ordinary Time', () => {
      const d = usDay(2022, 6, 26);
      expect(d.celebrations.map((c) => [c.symbol, c.rank.priority])).toEqual([[null, 2.6]]);
      expect(d.celebrations[0].title).toBe('13th Sunday in Ordinary Time');
    });
  });

  describe('2024 Annunciation impeded by Holy Week', () => {
    it('2024-03-25 is Monday of Holy Week', () => {
      const d = usDay(2024, 3, 25);
      expect(d.celebrations.map((c) => [c.symbol, c.rank.priority])).toEqual([
        ['lent_holy_monday', 1.2],
      ]);
    });

    it('2024-04-08 receives the transferred Annunciation (after the Easter octave)', () => {
      const d = usDay(2024, 4, 8);
      expect(d.celebrations.map((c) => [c.symbol, c.rank.priority])).toEqual([
        ['annunciation', 1.3],
      ]);
    });
  });
});
