// ruby: lib/calendarium-romanum/sanctorale_factory.rb

import { Sanctorale } from './sanctorale.js';
import type { SanctoraleMetadata } from './sanctorale.js';
import { SanctoraleLoader } from './sanctorale-loader.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Loads {@link Sanctorale} instances from several sources and builds a single
 * one by layering them over each other.
 */
export const SanctoraleFactory = {
  /**
   * Takes several {@link Sanctorale} instances and returns a new one created by
   * merging them all together (using {@link Sanctorale.update}).
   *
   * ruby: the metadata merge starts from a dup of the *first* Hash metadata and
   * then merges **every** Hash metadata (including that first one again) in
   * order; `'extends'` is always deleted and `'components'` always overwritten
   * with the raw metadata of every instance, `null`s and non-Hashes included.
   */
  createLayered(...instances: Sanctorale[]): Sanctorale {
    const r = new Sanctorale();
    for (const instance of instances) {
      r.update(instance);
    }

    const hashes = instances.map((i) => i.metadata).filter(isPlainObject);
    const merged: Record<string, unknown> = { ...(hashes[0] ?? {}) };
    for (const hash of hashes) {
      Object.assign(merged, hash);
    }
    delete merged.extends;
    merged.components = instances.map((i) => i.metadata);

    r.metadata = merged as SanctoraleMetadata;
    return r;
  },

  /**
   * Loads a {@link Sanctorale} from each of the given data-file contents and
   * merges them with {@link SanctoraleFactory.createLayered}.
   *
   * ruby: `.load_layered_from_files` takes filesystem paths; this port has no
   * filesystem, so it takes the file contents (see {@link Data}).
   */
  loadLayeredFromStrings(...sources: string[]): Sanctorale {
    const loader = new SanctoraleLoader();
    const instances = sources.map((source) => loader.load(source));
    return SanctoraleFactory.createLayered(...instances);
  },

  /**
   * ruby: `.load_with_parents` — resolves the `extends` key of the YAML front
   * matter. `resolve` maps a data-file name (e.g. `universal-en.txt`) to that
   * file's contents; see `Data[siglum].loadWithParents()`.
   */
  loadWithParents(source: string, resolve: (name: string) => string): Sanctorale {
    const hierarchy = loadParentHierarchy(source, resolve, new SanctoraleLoader());
    if (hierarchy.length === 1) return hierarchy[0];
    return SanctoraleFactory.createLayered(...hierarchy);
  },
};

function loadParentHierarchy(
  source: string,
  resolve: (name: string) => string,
  loader: SanctoraleLoader,
): Sanctorale[] {
  const main = loader.load(source);
  const metadata = main.metadata;
  if (!isPlainObject(metadata) || !('extends' in metadata)) {
    return [main];
  }

  let toMerge: Sanctorale[] = [main];
  const rawParents = metadata.extends;
  const parents: string[] = Array.isArray(rawParents)
    ? (rawParents as string[])
    : [rawParents as string];

  for (const parentName of [...parents].reverse()) {
    const subtree = loadParentHierarchy(resolve(parentName), resolve, loader);
    toMerge = subtree.concat(toMerge);
  }

  return toMerge;
}
