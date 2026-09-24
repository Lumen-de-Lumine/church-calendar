// ported from: calendarium-romanum/spec/sanctorale_spec.rb

import { AbstractDate } from '../../src/core/abstract-date.js';
import { Celebration } from '../../src/core/day.js';
import { Colours, Ranks } from '../../src/core/enums.js';
import { ArgumentError } from '../../src/core/errors.js';
import { Sanctorale } from '../../src/core/sanctorale.js';
import { d } from './support.js';

const antonius = () =>
  new Celebration({
    title: 'S. Antonii, abbatis',
    rank: Ranks.MEMORIAL_GENERAL,
    colour: Colours.WHITE,
    symbol: 'antonius',
  });
const nullus = () =>
  new Celebration({
    title: 'S. Nullius',
    rank: Ranks.MEMORIAL_OPTIONAL,
    colour: Colours.WHITE,
    symbol: 'nullus',
  });
const ignotus = () =>
  new Celebration({
    title: 'S. Ignoti',
    rank: Ranks.MEMORIAL_OPTIONAL,
    colour: Colours.WHITE,
    symbol: 'ignotus',
  });
const solemnity = () =>
  new Celebration({
    title: 'S. Nullius',
    rank: Ranks.SOLEMNITY_PROPER,
    colour: Colours.WHITE,
    symbol: 'nullus_solemnity',
  });

describe('Sanctorale', () => {
  let s: Sanctorale;

  beforeEach(() => {
    s = new Sanctorale();
  });

  describe('#get', () => {
    describe('for an empty day', () => {
      it('returns an Array', () => {
        expect(s.get(1, 3)).toEqual([]);
      });
    });

    describe('for an unempty day', () => {
      beforeEach(() => {
        s.add(1, 17, antonius());
      });

      it('get by month, day', () => {
        expect(s.get(1, 17).map((c) => c.symbol)).toEqual(['antonius']);
      });

      it('get by CalDate', () => {
        expect(s.get(d(2014, 1, 17)).map((c) => c.symbol)).toEqual(['antonius']);
      });

      it('get by AbstractDate', () => {
        expect(s.get(new AbstractDate(1, 17)).map((c) => c.symbol)).toEqual(['antonius']);
      });

      it('may have more Celebrations for a day', () => {
        for (const t of ['S. Fabiani, papae et martyris', 'S. Sebastiani, martyris']) {
          s.add(1, 20, new Celebration({ title: t, rank: Ranks.MEMORIAL_OPTIONAL }));
        }
        expect(s.get(1, 20)).toHaveLength(2);
      });
    });
  });

  describe('#add', () => {
    it('adds a Celebration to one month only', () => {
      s.add(1, 17, antonius());
      expect(s.get(2, 17)).toEqual([]);
    });

    it('does not allow month 0', () => {
      expect(() => s.add(0, 1, nullus())).toThrow(RangeError);
    });

    it('does not allow a month higher than 12', () => {
      expect(() => s.add(13, 1, nullus())).toThrow(RangeError);
    });

    it('adds solemnity to a dedicated container', () => {
      expect(s.solemnities.size).toBe(0);
      s.add(1, 13, solemnity());
      expect(s.solemnities.size).toBe(1);
    });

    it('does not add non-solemnity to solemnities', () => {
      s.add(1, 13, nullus());
      expect(s.solemnities.size).toBe(0);
    });

    it('fails when adding a second celebration with the same symbol', () => {
      s.add(1, 13, antonius());
      expect(() => s.add(1, 14, antonius())).toThrow(ArgumentError);
      expect(() => s.add(1, 14, antonius())).toThrow(/duplicate symbol "antonius"/);
    });

    describe('multiple celebrations on a single day', () => {
      it('succeeds for any number of optional memorials', () => {
        s.add(1, 13, nullus());
        expect(() => s.add(1, 13, ignotus())).not.toThrow();
      });

      it('fails when adding a non-optional memorial', () => {
        s.add(1, 13, nullus());
        expect(() =>
          s.add(1, 13, new Celebration({ title: 'S. Ignoti', rank: Ranks.MEMORIAL_GENERAL })),
        ).toThrow(ArgumentError);
      });

      it('fails when adding to a non-optional memorial', () => {
        s.add(1, 13, new Celebration({ title: 'S. Nullius', rank: Ranks.MEMORIAL_GENERAL }));
        expect(() => s.add(1, 13, ignotus())).toThrow(ArgumentError);
      });

      it('does not modify internal state when it fails', () => {
        s.add(1, 13, nullus());
        try {
          s.add(1, 13, new Celebration({ title: 'S. Nullius', rank: Ranks.SOLEMNITY_GENERAL }));
        } catch {
          /* expected */
        }
        expect(s.solemnities.size).toBe(0);
      });
    });
  });

  describe('#replace', () => {
    it('replaces the original celebration(s)', () => {
      s.add(1, 13, ignotus());
      s.replace(1, 13, [solemnity()]);

      expect(s.get(1, 13).map((c) => c.symbol)).toEqual(['nullus_solemnity']);
    });

    it('adds solemnity to a dedicated container', () => {
      s.replace(1, 13, [solemnity()]);
      expect(s.solemnities.size).toBe(1);
    });

    it('removes solemnity', () => {
      s.add(1, 13, solemnity());
      expect(s.solemnities.size).toBe(1);
      s.replace(1, 13, [ignotus()]);
      expect(s.solemnities.size).toBe(0);
    });

    it('does not simply save the passed Array', () => {
      const array = [nullus()];
      s.replace(1, 13, array);

      array.push(null as unknown as Celebration);

      expect(s.get(1, 13)).not.toContain(null);
      expect(s.get(1, 13)).toHaveLength(1);
    });

    describe('duplicate symbol handling', () => {
      it('fails when adding a second celebration with the same symbol', () => {
        s.replace(1, 13, [nullus()]);
        expect(() => s.replace(1, 14, [nullus()])).toThrow(/duplicate symbols \["nullus"\]/);
      });

      it('failed attempts do not modify the internal symbol set', () => {
        s.replace(1, 14, [nullus()]);
        s.replace(1, 15, [ignotus()]);

        expect(() => s.replace(1, 14, [ignotus()])).toThrow(/duplicate symbols \["ignotus"\]/);
        expect(() => s.replace(1, 15, [nullus()])).toThrow(/duplicate symbols \["nullus"\]/);
      });

      it('succeeds when a celebration with the same symbol is being replaced', () => {
        s.replace(1, 13, [nullus()]);
        expect(() => s.replace(1, 13, [nullus()])).not.toThrow();
      });

      it('can be disabled', () => {
        s.replace(1, 13, [nullus()]);
        expect(() => s.replace(1, 14, [nullus()], { symbolUniqueness: false })).not.toThrow();
      });
    });
  });

  describe('#update', () => {
    it('adds entries from the argument to the receiver', () => {
      const s2 = new Sanctorale();
      s2.add(1, 17, antonius());

      expect(s.isEmpty()).toBe(true);
      s.update(s2);
      expect(s.size).toBe(1);
    });

    it('overwrites eventual previous content of the day', () => {
      const s2 = new Sanctorale();
      s.add(1, 17, antonius());
      s2.add(1, 17, nullus());

      s.update(s2);
      expect(s.get(1, 17).map((c) => c.symbol)).toEqual(['nullus']);
    });

    it('does not overwrite content of days for which it does not have any', () => {
      s.add(1, 17, antonius());
      s.update(new Sanctorale());
      expect(s.get(1, 17).map((c) => c.symbol)).toEqual(['antonius']);
    });

    describe('copes with celebrations changing dates', () => {
      it('to a later one', () => {
        s.add(1, 14, nullus());

        const s2 = new Sanctorale();
        s2.add(1, 14, ignotus());
        s2.add(1, 15, nullus());

        expect(() => s.update(s2)).not.toThrow();
      });

      it('to an earlier one', () => {
        s.add(1, 14, nullus());

        const s2 = new Sanctorale();
        s2.add(1, 13, nullus());
        s2.add(1, 14, ignotus());

        expect(() => s.update(s2)).not.toThrow();
      });
    });

    it('does not allow introducing duplicate symbols', () => {
      s.add(1, 14, nullus());

      const s2 = new Sanctorale();
      s2.add(9, 19, nullus());

      expect(() => s.update(s2)).toThrow(/Duplicate celebration symbols: \["nullus"\]/);

      // the uniqueness check is made at the end of the operation,
      // so the instance is left in an inconsistent state
      expect(s.get(1, 14).map((c) => c.symbol)).toEqual(['nullus']);
      expect(s.get(9, 19).map((c) => c.symbol)).toEqual(['nullus']);
    });

    // docs/QUIRKS.md Q9 — a known defect, reproduced
    it('treats two symbol-less celebrations as duplicates', () => {
      s.add(1, 14, new Celebration({ title: 'a' }));
      s.add(1, 15, new Celebration({ title: 'b' }));

      expect(() => s.update(new Sanctorale())).toThrow(
        /Duplicate celebration symbols: \[null\]/,
      );
    });
  });

  describe('#size', () => {
    it('knows when the Sanctorale is empty', () => {
      expect(s.size).toBe(0);
    });

    it('knows when there is something', () => {
      s.add(1, 17, antonius());
      expect(s.size).toBe(1);
    });

    it('counts days, not celebrations', () => {
      s.add(1, 14, nullus());
      s.add(1, 14, ignotus());
      expect(s.size).toBe(1);
    });

    it('celebrations on different days', () => {
      s.add(1, 14, nullus());
      s.add(1, 15, ignotus());
      expect(s.size).toBe(2);
    });
  });

  describe('#isEmpty', () => {
    it('is empty at the beginning', () => {
      expect(s.isEmpty()).toBe(true);
    });

    it('is never more empty once a record is entered', () => {
      s.add(1, 17, antonius());
      expect(s.isEmpty()).toBe(false);
    });
  });

  describe('#eachDay', () => {
    beforeEach(() => {
      s.add(1, 17, antonius());
    });

    it('yields each date and the corresponding Celebrations', () => {
      const yielded: [number, number, string[]][] = [];
      s.eachDay((date, celebrations) => {
        yielded.push([date.month, date.day, celebrations.map((c) => c.symbol ?? '')]);
      });
      expect(yielded).toEqual([[1, 17, ['antonius']]]);
    });

    it('returns the pairs when called without a callback', () => {
      expect(s.eachDay()).toHaveLength(1);
    });

    it('preserves insertion order (ruby: Hash order)', () => {
      s.add(3, 1, ignotus());
      s.add(2, 1, nullus());
      expect(s.eachDay().map(([date]) => date.key)).toEqual([117, 301, 201]);
    });
  });

  describe('#equals', () => {
    it('empty instances are equal', () => {
      expect(new Sanctorale().equals(new Sanctorale())).toBe(true);
    });

    it('with content, different', () => {
      s.add(1, 17, antonius());
      expect(s.equals(new Sanctorale())).toBe(false);
    });

    it('with content, same', () => {
      s.add(1, 17, antonius());
      const b = new Sanctorale();
      b.add(1, 17, antonius());
      expect(s.equals(b)).toBe(true);
    });
  });

  describe('#at (ruby: #[])', () => {
    // docs/QUIRKS.md Q3
    it('returns the stored array itself, not a copy', () => {
      s.add(1, 17, antonius());
      expect(s.at(new AbstractDate(1, 17))).toBe(s.at(d(2020, 1, 17)));
    });

    it('returns an empty array for an empty day', () => {
      expect(s.at(d(2020, 1, 17))).toEqual([]);
    });
  });

  describe('#metadata', () => {
    it('is null by default', () => {
      expect(s.metadata).toBeNull();
    });
  });
});
