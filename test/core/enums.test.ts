// ported from: calendarium-romanum/spec/colour_spec.rb, season_spec.rb,
//              enum_spec.rb, rank_spec.rb

import { createEnum } from '../../src/core/enum.js';
import { Colours, Ranks, Seasons, LECTIONARY_CYCLES } from '../../src/core/enums.js';
import { i18n } from '../../src/core/i18n.js';
import { isTranslated, withLocale } from './support.js';

beforeEach(() => {
  i18n.setLocale('en');
});

describe('Enum', () => {
  const testEnum = createEnum(['a', 'b']);

  describe('.all', () => {
    it('returns all values in the original order', () => {
      expect(testEnum.all).toEqual(['a', 'b']);
    });
  });

  describe('.each', () => {
    it('yields all values in the original order', () => {
      const yielded: string[] = [];
      testEnum.each((v) => yielded.push(v));
      expect(yielded).toEqual(['a', 'b']);
    });
  });

  describe('[] (get)', () => {
    describe('default indexing', () => {
      it('finds the first element', () => {
        expect(testEnum.get(0)).toBe('a');
      });

      it('finds the last element', () => {
        expect(testEnum.get(1)).toBe('b');
      });

      it('returns undefined for an index out of range', () => {
        expect(testEnum.get(2)).toBeUndefined();
      });
    });

    describe('indexed by a custom property', () => {
      const custom = createEnum<number, string>([1], (n) => String(n));

      it('finds the element', () => {
        expect(custom.get('1')).toBe(1);
      });

      it('returns undefined for an unknown index', () => {
        expect(custom.get('2')).toBeUndefined();
      });
    });
  });
});

describe('Colour', () => {
  it.each(Colours.all.map((c) => [c.symbol, c]))('%s #name is translated', (_symbol, colour) => {
    expect(isTranslated(colour.name())).toBe(true);
  });

  describe('indexing', () => {
    it('is indexed by symbol', () => {
      expect(Colours.bySymbol('red')).toBe(Colours.RED);
    });
  });

  describe('#toString', () => {
    // ruby asserts '#<CalendariumRomanum::Colour red>'; the TS class name differs
    it('mentions the symbol', () => {
      expect(String(Colours.RED)).toBe('#<Colour red>');
    });
  });

  it('exposes #symbol (ruby: #to_sym), used by the api serializer', () => {
    expect(Colours.VIOLET.symbol).toBe('violet');
    expect(Colours.VIOLET.toSym()).toBe('violet');
  });
});

describe('Season', () => {
  it.each(Seasons.all.map((s) => [s.symbol, s]))('%s #name is translated', (_symbol, season) => {
    expect(isTranslated(season.name())).toBe(true);
  });

  describe('indexing', () => {
    it('is indexed by symbol', () => {
      expect(Seasons.bySymbol('lent')).toBe(Seasons.LENT);
    });
  });

  describe('#toString', () => {
    it('mentions the symbol', () => {
      expect(String(Seasons.LENT)).toBe('#<Season lent>');
    });
  });

  it('carries the season colour', () => {
    expect(Seasons.ADVENT.colour).toBe(Colours.VIOLET);
    expect(Seasons.CHRISTMAS.colour).toBe(Colours.WHITE);
    expect(Seasons.LENT.colour).toBe(Colours.VIOLET);
    expect(Seasons.EASTER.colour).toBe(Colours.WHITE);
    expect(Seasons.ORDINARY.colour).toBe(Colours.GREEN);
  });
});

describe('Rank', () => {
  describe('comparison', () => {
    it('memorial > ferial (the comparison is inverted!)', () => {
      expect(Ranks.MEMORIAL_GENERAL.gt(Ranks.FERIAL)).toBe(true);
    });
  });

  describe('byPriority (ruby: Ranks[])', () => {
    it('has all existing instances indexed by rank number', () => {
      expect(Ranks.byPriority(1.1)).toBe(Ranks.TRIDUUM);
    });

    it('3.10 in Ruby is the number 3.1', () => {
      expect(Ranks.MEMORIAL_GENERAL.priority).toBe(3.1);
      expect(Ranks.byPriority(3.1)).toBe(Ranks.MEMORIAL_GENERAL);
      expect(JSON.stringify(Ranks.MEMORIAL_GENERAL.priority)).toBe('3.1');
    });
  });

  describe('#lt', () => {
    it('1.2 < 1.1', () => {
      expect(Ranks.byPriority(1.2)!.lt(Ranks.byPriority(1.1)!)).toBe(true);
    });

    it('1.1 is not < 1.2', () => {
      expect(Ranks.byPriority(1.1)!.lt(Ranks.byPriority(1.2)!)).toBe(false);
    });
  });

  describe('#gt', () => {
    it('1.1 > 1.2', () => {
      expect(Ranks.byPriority(1.1)!.gt(Ranks.byPriority(1.2)!)).toBe(true);
    });

    it('1.2 is not > 1.1', () => {
      expect(Ranks.byPriority(1.2)!.gt(Ranks.byPriority(1.1)!)).toBe(false);
    });
  });

  describe('#equals', () => {
    it('1.2 == 1.2', () => {
      expect(Ranks.byPriority(1.2)!.equals(Ranks.byPriority(1.2)!)).toBe(true);
    });

    it('1.2 != 1.1', () => {
      expect(Ranks.byPriority(1.2)!.equals(Ranks.byPriority(1.1)!)).toBe(false);
    });
  });

  describe('descriptions', () => {
    it.each(Ranks.all.map((r) => [r.priority, r]))('%p has #desc translated', (_p, rank) => {
      expect(isTranslated(rank.desc())).toBe(true);
    });

    it.each(Ranks.all.filter((r) => r.shortDesc() !== null).map((r) => [r.priority, r]))(
      '%p has #shortDesc translated',
      (_p, rank) => {
        expect(isTranslated(rank.shortDesc())).toBe(true);
      },
    );

    describe('#shortDesc', () => {
      it('is not always set', () => {
        expect(Ranks.byPriority(1.1)!.shortDesc()).toBeNull();
        expect(Ranks.PRIMARY.shortDesc()).toBeNull();
      });
    });
  });

  describe('#isMemorial', () => {
    it('MEMORIAL_OPTIONAL is a memorial', () => {
      expect(Ranks.MEMORIAL_OPTIONAL.isMemorial()).toBe(true);
    });

    it('FERIAL is not', () => {
      expect(Ranks.FERIAL.isMemorial()).toBe(false);
    });
  });

  describe('#isSunday', () => {
    it('SUNDAY_UNPRIVILEGED', () => {
      expect(Ranks.SUNDAY_UNPRIVILEGED.isSunday()).toBe(true);
    });

    it('FERIAL', () => {
      expect(Ranks.FERIAL.isSunday()).toBe(false);
    });
  });

  describe('#isFerial', () => {
    it('FERIAL and FERIAL_PRIVILEGED', () => {
      expect(Ranks.FERIAL.isFerial()).toBe(true);
      expect(Ranks.FERIAL_PRIVILEGED.isFerial()).toBe(true);
    });

    it('MEMORIAL_OPTIONAL', () => {
      expect(Ranks.MEMORIAL_OPTIONAL.isFerial()).toBe(false);
    });
  });

  describe('#isSolemnity / #isFeast', () => {
    it('follows priority.to_i', () => {
      expect(Ranks.TRIDUUM.isSolemnity()).toBe(true);
      expect(Ranks.PRIMARY.isSolemnity()).toBe(true);
      expect(Ranks.SOLEMNITY_PROPER.isSolemnity()).toBe(true);
      expect(Ranks.FEAST_LORD_GENERAL.isSolemnity()).toBe(false);
      expect(Ranks.FEAST_LORD_GENERAL.isFeast()).toBe(true);
      expect(Ranks.FERIAL_PRIVILEGED.isFeast()).toBe(true);
      expect(Ranks.MEMORIAL_GENERAL.isFeast()).toBe(false);
    });
  });

  describe('#toString', () => {
    // ruby asserts '#<CalendariumRomanum::Rank @priority=3.13 desc="Ferials">'
    it('mentions priority and desc', () => {
      withLocale('en', () => {
        expect(String(Ranks.FERIAL)).toBe('#<Rank @priority=3.13 desc="Ferials">');
      });
    });
  });
});

describe('LECTIONARY_CYCLES', () => {
  it('is A, B, C', () => {
    expect(LECTIONARY_CYCLES).toEqual(['A', 'B', 'C']);
  });
});
