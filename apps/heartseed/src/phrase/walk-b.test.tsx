/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned whole over a garden that holds
 * the old pieces main's build cut them into, walked through the root
 * (`test/phrase-rig.tsx`), part b, file one: generated device 2, four
 * days, each launch through home's `Start`, held to the walk's oracle
 * after every step. Its floors: verses begun in old pieces reviewed, a
 * new verse of 35 words or more read by Listen with each word lit in
 * turn and recited whole, a making while such a verse's recital listens,
 * and `Start` taken from home. The part's other file is
 * `walk-b2.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('long verses whole on Today, walked (b)', () => {
  it('reads, lights and keeps a verse of 35 words or more whole, and reviews verses begun in old pieces by their own plant', async () => {
    const { failure, cover } = await walkPhrases([2]);
    expect(failure).toBeNull();
    const floors = {
      'today:begun-review': 8,
      'today:long-review': 4,
      'today:long-new': 1,
      'listen:long': 1,
      'record:long': 5,
      'held:long-made': 1,
      'home:begin': 5,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
