// ruby: lib/calendarium-romanum/enum.rb
//
// Ruby's `Enum` is an abstract class whose subclasses call `values(index_by:)`
// in their body. TypeScript has no equivalent of that class-body DSL, so the
// same behaviour is provided by a factory returning a frozen value set.

/** A finite, ordered set of value objects, indexed by a unique property. */
export interface EnumSet<T, K> extends Iterable<T> {
  /** ruby: `Enum.all` — all contained value objects, in the original order. */
  readonly all: readonly T[];
  /** ruby: `Enum.each` */
  each(fn: (value: T) => void): void;
  /** ruby: `Enum.[](identifier)` — `undefined` for an unknown identifier. */
  get(identifier: K): T | undefined;
}

/**
 * ruby: `Enum.values(index_by:) { [...] }`
 *
 * @param indexBy the value objects' property providing the unique internal
 *   identifier for {@link EnumSet.get}. Defaults to the position in the list,
 *   exactly like the Ruby implementation.
 */
export function createEnum<T, K = number>(
  values: readonly T[],
  indexBy?: (value: T) => K,
): EnumSet<T, K> {
  const all = Object.freeze(values.slice());
  const indexed = new Map<K, T>();

  all.forEach((value, i) => {
    const key = (indexBy ? indexBy(value) : (i as unknown as K)) as K;
    indexed.set(key, value);
  });

  return {
    all,
    each(fn: (value: T) => void): void {
      all.forEach((value) => fn(value));
    },
    get(identifier: K): T | undefined {
      return indexed.get(identifier);
    },
    [Symbol.iterator](): Iterator<T> {
      return all[Symbol.iterator]();
    },
  };
}
