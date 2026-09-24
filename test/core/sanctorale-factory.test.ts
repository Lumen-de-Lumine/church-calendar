// ported from: calendarium-romanum/spec/sanctorale_factory_spec.rb

import { Ranks } from '../../src/core/enums.js';
import { Data } from '../../src/core/data.js';
import { Sanctorale } from '../../src/core/sanctorale.js';
import type { SanctoraleMetadata } from '../../src/core/sanctorale.js';
import { SanctoraleFactory } from '../../src/core/sanctorale-factory.js';

const withMetadata = (metadata: unknown): Sanctorale => {
  const s = new Sanctorale();
  s.metadata = metadata as SanctoraleMetadata;
  return s;
};

describe('SanctoraleFactory', () => {
  describe('.createLayered', () => {
    describe('metadata handling', () => {
      const metadataA = () => ({ title: 'Calendar', foo: 'bar' });
      const metadataB = () => ({
        title: 'Second calendar',
        some: 'handsome',
        extends: ['with_a'],
      });
      const metadataNonHash = () => ['something'];

      it('creates merged metadata', () => {
        const result = SanctoraleFactory.createLayered(
          withMetadata(metadataA()),
          withMetadata(metadataB()),
        );

        expect(result.metadata).toMatchObject({
          title: 'Second calendar', // conflicting key — later wins
          foo: 'bar', // non-conflicting from the first
          some: 'handsome', // non-conflicting from the second
        });

        // 'extends' has special meaning and is always deleted
        expect(result.metadata).not.toHaveProperty('extends');
      });

      it('stores original metadata', () => {
        const result = SanctoraleFactory.createLayered(
          withMetadata(metadataA()),
          withMetadata(metadataB()),
        );
        expect(result.metadata!.components).toEqual([metadataA(), metadataB()]);
      });

      it('overwrites key "components" if it exists', () => {
        const result = SanctoraleFactory.createLayered(
          withMetadata(metadataA()),
          withMetadata({ components: 'c' }),
        );
        expect(result.metadata!.components).toEqual([metadataA(), { components: 'c' }]);
      });

      it('copes with null metadata in the first place', () => {
        const result = SanctoraleFactory.createLayered(new Sanctorale(), withMetadata(metadataA()));

        expect(result.metadata).toMatchObject(metadataA());
        // nulls are preserved in 'components'
        expect(result.metadata!.components).toEqual([null, metadataA()]);
      });

      it('copes with null metadata in the last place', () => {
        const result = SanctoraleFactory.createLayered(withMetadata(metadataA()), new Sanctorale());

        expect(result.metadata).toMatchObject(metadataA());
        expect(result.metadata!.components).toEqual([metadataA(), null]);
      });

      it('copes with all null', () => {
        const result = SanctoraleFactory.createLayered(new Sanctorale(), new Sanctorale());
        expect(result.metadata!.components).toEqual([null, null]);
      });

      it('copes with non-object metadata', () => {
        const result = SanctoraleFactory.createLayered(
          withMetadata(metadataA()),
          withMetadata(metadataNonHash()),
        );
        // non-Hash metadata are not merged, but they do appear in 'components'
        expect(result.metadata).toMatchObject(metadataA());
        expect(result.metadata!.components).toEqual([metadataA(), metadataNonHash()]);
      });

      it('copes with all non-object', () => {
        const result = SanctoraleFactory.createLayered(withMetadata(metadataNonHash()));
        expect(result.metadata!.components).toEqual([metadataNonHash()]);
      });
    });
  });

  describe('calendar layering (České Budějovice)', () => {
    const layered = () =>
      SanctoraleFactory.loadLayeredFromStrings(
        Data['czech-cs'].text,
        Data['czech-cechy-cs'].text,
        Data['czech-budejovice-cs'].text,
      );

    it('has celebrations from the first file', () => {
      const dd = layered().get(9, 28);
      expect(dd).toHaveLength(1);
      expect(dd[0].rank).toBe(Ranks.SOLEMNITY_PROPER);
      expect(dd[0].title).toBe('Sv. Václava, mučedníka, hlavního patrona českého národa');
    });

    it('has celebrations from the second file', () => {
      const dd = layered().get(7, 4);
      expect(dd).toHaveLength(1);
      expect(dd[0].rank).toBe(Ranks.MEMORIAL_PROPER);
      expect(dd[0].title).toBe('Sv. Prokopa, opata');
    });

    it('celebrations from the last file win', () => {
      const dd = layered().get(12, 22);
      expect(dd).toHaveLength(1);
      expect(dd[0].rank).toBe(Ranks.FEAST_PROPER);
      expect(dd[0].title).toBe('Výročí posvěcení katedrály sv. Mikuláše');
    });
  });

  describe('.loadWithParents', () => {
    const layered = () => Data['czech-budejovice-cs'].loadWithParents();

    it('resolves the `extends` chain, deepest ancestor first', () => {
      expect(layered().get(9, 28)[0].title).toBe(
        'Sv. Václava, mučedníka, hlavního patrona českého národa',
      );
      expect(layered().get(7, 4)[0].title).toBe('Sv. Prokopa, opata');
      expect(layered().get(12, 22)[0].title).toBe('Výročí posvěcení katedrály sv. Mikuláše');
    });

    it('returns the single instance when there are no parents', () => {
      const s = Data['universal-la'].loadWithParents();
      expect(s.metadata).toMatchObject({ title: 'Calendarium Romanum Generale' });
      // no 'components' key: create_layered was never called
      expect(s.metadata).not.toHaveProperty('components');
    });

    it('handles the scalar `extends` form', () => {
      const s = Data['czech-olomouc-cs'].loadWithParents();
      expect(s.get(6, 30)[0].title).toBe('Výročí posvěcení katedrály sv. Václava');
      expect(s.get(5, 6)[0].rank).toBe(Ranks.MEMORIAL_PROPER);
      expect(s.get(9, 28)[0].rank).toBe(Ranks.SOLEMNITY_PROPER);
    });

    it('handles the list `extends` form', () => {
      const s = Data['us-en'].loadWithParents();
      expect(s.get(1, 4)[0].symbol).toBe('seton'); // from us-en
      expect(s.get(1, 2)[0].symbol).toBe('basil_gregory'); // from universal-en
    });
  });

  describe('the layered `us` calendar the api builds', () => {
    const layered = () =>
      SanctoraleFactory.createLayered(Data['universal-en'].load(), Data['us-en'].load());

    it('merges without a duplicate-symbol error', () => {
      expect(() => layered()).not.toThrow();
    });

    it('lets the US file replace a whole day', () => {
      const day = layered().get(10, 5);
      expect(day.map((c) => c.symbol)).toEqual(['faustina_kowalska', 'francis_xavier_seelos']);
    });

    it('keeps `components` and drops `extends`', () => {
      const metadata = layered().metadata!;
      expect(metadata.title).toBe('Calendar for the dioceses of the USA');
      expect(metadata).not.toHaveProperty('extends');
      expect(metadata.components).toHaveLength(2);
    });

    it('carries the moveIfSunday celebration through the merge', () => {
      const unbornChildren = layered().get(1, 22)[0];
      expect(unbornChildren.symbol).toBe('unborn_children');
      expect(unbornChildren.moveIfSunday).toBe(true);
    });
  });
});
