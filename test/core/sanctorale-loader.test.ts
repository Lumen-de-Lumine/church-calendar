// ported from: calendarium-romanum/spec/sanctorale_loader_spec.rb

import { AbstractDate } from '../../src/core/abstract-date.js';
import { Colours, Ranks } from '../../src/core/enums.js';
import { InvalidDataError } from '../../src/core/errors.js';
import { Data } from '../../src/core/data.js';
import { Sanctorale } from '../../src/core/sanctorale.js';
import { SanctoraleLoader, parseFrontMatter } from '../../src/core/sanctorale-loader.js';

describe('SanctoraleLoader', () => {
  let s: Sanctorale;
  let l: SanctoraleLoader;

  beforeEach(() => {
    s = new Sanctorale();
    l = new SanctoraleLoader();
  });

  describe('data sources', () => {
    describe('#loadFromString', () => {
      it('loads one entry', () => {
        l.loadFromString('1/3 : Ss.mi Nominis Iesu', s);
        expect(s.size).toBe(1);
      });
    });

    describe('loading a packaged file', () => {
      it('loads something', () => {
        l.load(Data['universal-la'].text, s);
        expect(s.size).toBeGreaterThan(190);
      });
    });
  });

  describe('record/file format', () => {
    const load = (record: string) => l.loadLine(record);

    describe('title', () => {
      it('loads it', () => {
        expect(load('4/25 f R :  S. Marci, evangelistae').title).toBe('S. Marci, evangelistae');
      });
    });

    describe('date', () => {
      it('loads a full date given as part of the record', () => {
        expect(load('4/25 f R :  S. Marci, evangelistae').date).toEqual(new AbstractDate(4, 25));
      });

      describe('month as heading', () => {
        beforeEach(() => {
          const str = [
            '= 1',
            '25 f : In conversione S. Pauli, apostoli',
            '4/25 f r :  S. Marci, evangelistae',
          ].join('\n');
          l.loadFromString(str, s);
        });

        it('uses the month heading for subsequent records', () => {
          expect(s.get(1, 25)).not.toHaveLength(0);
        });

        it('still allows a full date specified in the record', () => {
          expect(s.get(4, 25)).not.toHaveLength(0);
        });
      });
    });

    describe('colour', () => {
      it('not specified — sets default', () => {
        expect(load('4/25 :  S. Marci, evangelistae').colour).toBe(Colours.WHITE);
      });

      it('sets colour if specified', () => {
        expect(load('4/25 f R :  S. Marci, evangelistae').colour).toBe(Colours.RED);
      });

      it('sets colour if specified (lowercase)', () => {
        expect(load('4/25 f r :  S. Marci, evangelistae').colour).toBe(Colours.RED);
      });
    });

    describe('rank', () => {
      it('not specified — sets default', () => {
        expect(load('4/23 : S. Georgii, martyris').rank).toBe(Ranks.MEMORIAL_OPTIONAL);
      });

      it('sets rank if specified', () => {
        expect(load('4/23 s R : S. Georgii, martyris').rank).toBe(Ranks.SOLEMNITY_GENERAL);
      });

      it('sets rank if specified (uppercase)', () => {
        expect(load('4/23 S R : S. Georgii, martyris').rank).toBe(Ranks.SOLEMNITY_GENERAL);
      });

      it('sets exact rank if specified', () => {
        expect(load('4/23 s1.4 R : S. Georgii, martyris').rank).toBe(Ranks.SOLEMNITY_PROPER);
      });

      it('sets exact rank if specified only by number', () => {
        expect(load('4/23 1.4 R : S. Georgii, martyris').rank).toBe(Ranks.SOLEMNITY_PROPER);
      });

      it('accepts the two-digit form 3.10, which is the number 3.1', () => {
        expect(load('4/23 m3.10 R : S. Georgii').rank).toBe(Ranks.MEMORIAL_GENERAL);
      });
    });

    describe('symbol', () => {
      it('not specified — sets default', () => {
        expect(load('4/23 : S. Georgii, martyris').symbol).toBeNull();
      });

      it('specified — uses it', () => {
        expect(load('4/23 george : S. Georgii, martyris').symbol).toBe('george');
      });

      it('supported characters', () => {
        expect(load('4/29 none_123 : S. Nullius, abbatis').symbol).toBe('none_123');
      });
    });

    // New: the fork added the `vigil` token and the `+1sunday` marker.
    describe('vigil token', () => {
      it('sets hasVigil', () => {
        const c = load('6/24 s baptist_birth vigil : The Nativity of Saint John the Baptist');
        expect(c.hasVigil).toBe(true);
        expect(c.symbol).toBe('baptist_birth');
        expect(c.rank).toBe(Ranks.SOLEMNITY_GENERAL);
        expect(c.title).toBe('The Nativity of Saint John the Baptist');
      });

      it('is matched case-sensitively even though the regexp is case-insensitive', () => {
        // `m[:has_vigil] == 'vigil'` compares the captured text exactly
        expect(load('6/24 s baptist_birth VIGIL : x').hasVigil).toBe(false);
      });

      it('defaults to false', () => {
        expect(load('4/23 george : S. Georgii').hasVigil).toBe(false);
      });
    });

    describe('+1sunday marker', () => {
      it('sets moveIfSunday', () => {
        const c = load('1/22+1sunday unborn_children : Day of Prayer');
        expect(c.moveIfSunday).toBe(true);
        expect(c.date).toEqual(new AbstractDate(1, 22));
        expect(c.symbol).toBe('unborn_children');
      });

      it('defaults to false', () => {
        expect(load('1/22 unborn_children : Day of Prayer').moveIfSunday).toBe(false);
      });
    });

    it('never sets hasEvening (sanctorale records cannot express it)', () => {
      expect(load('6/24 s baptist_birth vigil : x').hasEvening).toBe(false);
    });
  });

  describe('Celebration properties set regardless of the loaded data', () => {
    it('always sets the cycle to sanctorale', () => {
      expect(l.loadLine('4/23 1.4 R : S. Georgii, martyris').cycle).toBe('sanctorale');
    });
  });

  describe('invalid input', () => {
    describe('syntax errors', () => {
      it('invalid syntax', () => {
        expect(() => l.loadFromString('line without standard beginning', s)).toThrow(
          InvalidDataError,
        );
        expect(() => l.loadFromString('line without standard beginning', s)).toThrow(
          /Syntax error/,
        );
      });
    });

    describe('syntactically correct data making no sense', () => {
      it.each([
        ['invalid month heading', '= 13', /Invalid month/],
        ['one more invalid month heading', '= 0', /Invalid month/],
        ['invalid month', '100/25 f : In conversione S. Pauli, apostoli', /Invalid month/],
        [
          'line with day only, without preceding month heading',
          '25 f : In conversione S. Pauli, apostoli',
          /Invalid month/,
        ],
        ['invalid day', '1/250 f : In conversione S. Pauli, apostoli', /Invalid day/],
        ['invalid rank', '1/25 X : In conversione S. Pauli, apostoli', /Syntax error/],
        ['invalid numeric rank', '4/23 s8.4 R : S. Georgii, martyris', /rank/],
        [
          'invalid combination of rank letter and number',
          '4/23 m2.5 R : S. Georgii, martyris',
          /rank/,
        ],
      ])('%s', (_name, str, pattern) => {
        expect(() => l.loadFromString(str, s)).toThrow(InvalidDataError);
        expect(() => l.loadFromString(str, s)).toThrow(pattern);
      });
    });

    it('prefixes the error with the line number', () => {
      expect(() => l.loadFromString('1/3 : ok\nnonsense', s)).toThrow(/^L2: /);
    });
  });

  describe('YAML front matter (YFM)', () => {
    it('sets metadata null if YFM is not provided', () => {
      expect(l.loadFromString('').metadata).toBeNull();
    });

    it('loads metadata if provided', () => {
      expect(l.loadFromString('---\nkey: value\n---').metadata).toEqual({ key: 'value' });
    });

    it('does not load metadata with no end', () => {
      // YFM is processed on encountering the closing triple-dash, so an unclosed
      // front matter spanning the whole file is never loaded.
      expect(l.loadFromString('---\nkey: value').metadata).toBeNull();
    });

    it('carries on parsing records after the front matter', () => {
      const loaded = l.loadFromString('---\nkey: value\n---\n\n1/3 name_jesus : Ss.mi Nominis Iesu\n');
      expect(loaded.metadata).toEqual({ key: 'value' });
      expect(loaded.size).toBe(1);
    });
  });

  describe('parseFrontMatter', () => {
    it('parses the scalar form used by every packaged file', () => {
      expect(
        parseFrontMatter('---\ntitle: General Roman Calendar\nlocale: en\n'),
      ).toEqual({ title: 'General Roman Calendar', locale: 'en' });
    });

    it('parses the list form used by us-en.txt', () => {
      expect(parseFrontMatter('---\ncountry: us\nextends:\n  - universal-en.txt\n')).toEqual({
        country: 'us',
        extends: ['universal-en.txt'],
      });
    });

    it('parses the scalar `extends` used by the Czech files', () => {
      expect(parseFrontMatter('---\nextends: czech-morava-cs.txt\n')).toEqual({
        extends: 'czech-morava-cs.txt',
      });
    });

    it('skips whole-line comments', () => {
      expect(
        parseFrontMatter('---\ntitle: X\n# source: https://example.com/a#b\n'),
      ).toEqual({ title: 'X' });
    });

    it('keeps values containing a # that is not preceded by whitespace', () => {
      expect(parseFrontMatter('---\nurl: https://example.com/a#b\n')).toEqual({
        url: 'https://example.com/a#b',
      });
    });

    it('preserves non-ASCII values', () => {
      expect(parseFrontMatter('---\ntitle: kalendář plzeňské diecéze\n')).toEqual({
        title: 'kalendář plzeňské diecéze',
      });
    });
  });

  describe('every packaged data file', () => {
    it.each(
      Object.values(Data)
        .map((f) => f.siglum)
        .filter((s, i, a) => a.indexOf(s) === i),
    )('%s parses its front matter', (siglum) => {
      const loader = new SanctoraleLoader();
      // universal-fr and universal-es throw on a duplicate symbol; the front
      // matter is still read before that happens.
      const dest = new Sanctorale();
      try {
        loader.load(Data[siglum].text, dest);
      } catch {
        /* see data.test.ts */
      }
      expect(dest.metadata).toMatchObject({ title: expect.any(String) });
    });
  });
});
