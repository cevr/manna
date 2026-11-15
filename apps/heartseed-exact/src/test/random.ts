/* oxlint-disable effect/noNewError, effect/noNullish, effect/noThrowStatement -- Exact's app folder cannot import effect (docs/exact.md): a test helper; picking from an empty list is a broken test, said by a throw. */

/**
 * Seeded randomness for the property and model tests, so a red run names
 * its seed and replays: a mulberry32 stream in [0, 1) and the picks the
 * tests draw from it.
 */

export interface Random {
  /** A number in [0, 1). */
  readonly next: () => number;
  /** A whole number in [0, n). */
  readonly below: (n: number) => number;
  /** One of `items`, which is not empty. */
  readonly pick: <A>(items: readonly A[]) => A;
  /** True with probability `p`. */
  readonly chance: (p: number) => boolean;
}

/** The stream seeded by `seed`. */
export const seeded = (seed: number): Random => {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const below = (n: number) => Math.floor(next() * n);
  const pick = <A>(items: readonly A[]): A => {
    const item = items[below(items.length)];
    if (item === undefined) throw new Error('pick: no items');
    return item;
  };
  return { next, below, pick, chance: (p) => next() < p };
};
