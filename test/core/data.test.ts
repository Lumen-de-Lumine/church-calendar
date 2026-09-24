// ported from: calendarium-romanum/spec/data_spec.rb

import { Data, DataAll, DataSigla } from '../../src/core/data.js';
import { SANCTORALE_SIGLA } from '../../src/data/sanctorale-files.js';
import { ArgumentError } from '../../src/core/errors.js';
import { Ranks } from '../../src/core/enums.js';

describe('Data', () => {
  describe('all available data files are included', () => {
    it('every packaged .txt has a Data entry', () => {
      expect([...DataSigla].sort()).toEqual([...SANCTORALE_SIGLA].sort());
    });

    it('has 17 entries', () => {
      expect(DataAll).toHaveLength(17);
    });

    it('is indexable by siglum and by the gem constant name', () => {
      expect(Data['universal-en']).toBe(Data.GENERAL_ROMAN_ENGLISH);
      expect(Data['universal-la']).toBe(Data.GENERAL_ROMAN_LATIN);
      expect(Data['universal-fr']).toBe(Data.GENERAL_ROMAN_FRENCH);
      expect(Data['universal-it']).toBe(Data.GENERAL_ROMAN_ITALIAN);
      expect(Data['universal-es']).toBe(Data.GENERAL_ROMAN_SPANISH);
      expect(Data['us-en']).toBe(Data.US_ENGLISH);
      expect(Data['czech-cs']).toBe(Data.CZECH);
    });
  });

  describe('all can be loaded', () => {
    // docs/QUIRKS.md Q10: universal-fr and universal-es contain a duplicated
    // `faustina_kowalska` record, so `#load` on them always throws. Ruby's
    // data_spec ("can be loaded on its own") fails on them too.
    const BROKEN = ['universal-fr', 'universal-es'];

    it.each(DataSigla.filter((s) => !BROKEN.includes(s)))("%s loads on its own", (siglum) => {
      expect(() => Data[siglum].load()).not.toThrow();
    });

    it.each(DataSigla.filter((s) => !BROKEN.includes(s)))(
      '%s loads with parents',
      (siglum) => {
        expect(() => Data[siglum].loadWithParents()).not.toThrow();
      },
    );

    it.each(BROKEN)('%s throws on the duplicated faustina_kowalska record', (siglum) => {
      expect(() => Data[siglum].load()).toThrow(ArgumentError);
      expect(() => Data[siglum].load()).toThrow(
        'Attempted to add Celebration with duplicate symbol "faustina_kowalska"',
      );
    });
  });

  describe('#loadWithParents', () => {
    const sanctorale = () => Data['czech-olomouc-cs'].loadWithParents();

    it('loads the specified calendar', () => {
      expect(sanctorale().get(6, 30)[0].title).toBe('Výročí posvěcení katedrály sv. Václava');
    });

    it('loads the parent calendar', () => {
      const c = sanctorale().get(5, 6)[0];
      expect(c.title).toBe('Sv. Jana Sarkandra, kněze a mučedníka');
      expect(c.rank).toBe(Ranks.MEMORIAL_PROPER);
    });

    it('loads the grand-parent calendar', () => {
      const c = sanctorale().get(9, 28)[0];
      expect(c.title).toBe('Sv. Václava, mučedníka, hlavního patrona českého národa');
      expect(c.rank).toBe(Ranks.SOLEMNITY_PROPER);
    });
  });

  describe('#text', () => {
    it('is the verbatim file content, front matter included', () => {
      expect(Data['universal-en'].text.startsWith('---\ntitle: General Roman Calendar\n')).toBe(
        true,
      );
    });
  });

  describe('every packaged file has a title in its metadata', () => {
    it.each(DataSigla)('%s', (siglum) => {
      let metadata: unknown = null;
      try {
        metadata = Data[siglum].load().metadata;
      } catch {
        // universal-fr / universal-es — covered above
        return;
      }
      expect(metadata).toMatchObject({ title: expect.any(String), locale: expect.any(String) });
    });
  });
});
