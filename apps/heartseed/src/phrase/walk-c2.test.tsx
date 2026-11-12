/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned whole over a garden that holds
 * the old pieces main's build cut them into, walked through the root
 * (`test/phrase-rig.tsx`), part c, file two: generated device 5 (its
 * layer teaching Fear), four days, each launch through home's `Start`,
 * held to the walk's oracle after every step. Its floors: Fear's long
 * verses reviewed whole, verses begun in old pieces new and reviewed, a
 * making while a recital listens (at the session seam), the long verses'
 * records, `Start` taken from home, and the end of a run (`The field is
 * tended`) with several verses grown, one of them begun in old pieces.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('long verses whole on Today, walked (c2)', () => {
  it('reviews Fear’s long verses whole, and keeps each record under the verse’s own reference', async () => {
    const { failure, cover } = await walkPhrases([5]);
    expect(failure).toBeNull();
    const floors = {
      'device:fear': 1,
      'today:fear-long': 4,
      'today:begun-new': 3,
      'today:begun-review': 8,
      'record:long': 5,
      'held:verse-made': 2,
      'home:begin': 5,
      'end:many': 1,
      'end:begun': 2,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
