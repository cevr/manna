/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned as phrases, walked through the
 * root (`test/phrase-rig.tsx`), part c, file two: generated device 5 (its
 * layer teaching Fear), four days, each launch through home's `Begin`,
 * held to the walk's oracle after every step. Its floors: Fear's phrases
 * reviewed, a making while a phrase's recital listens (at the session
 * seam), the phrases' records, `Begin` taken from home, and the end of a
 * run (`The field is tended`) with several verses grown, one of them grown
 * by its phrase.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('phrases on Today, walked (c2)', () => {
  it('reviews Fear’s phrases day after day, each its own piece', async () => {
    const { failure, cover } = await walkPhrases([5]);
    expect(failure).toBeNull();
    const floors = {
      'device:fear': 1,
      'today:phrase-review': 6,
      'today:fear-phrase': 4,
      'held:phrase-made': 2,
      'record:phrase': 6,
      'home:begin': 5,
      'end:many': 1,
      'end:phrase': 1,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
