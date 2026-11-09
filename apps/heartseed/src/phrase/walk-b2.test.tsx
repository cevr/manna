/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned as phrases, walked through the
 * root (`test/phrase-rig.tsx`), part b, file two: generated device 3,
 * seven days, each launch through home's `Begin`, held to the walk's
 * oracle after every step. Its floors: Listen on a phrase, a making while
 * a phrase's recital listens (at the session seam), a launch later on a
 * day a new phrase was
 * said (no second new piece), six days after the first, and `Begin` taken
 * from home.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('phrases on Today, walked (b2)', () => {
  it('reads a phrase, makes the plan while it listens, and sows no second piece that day', async () => {
    const { failure, cover } = await walkPhrases([3], 7);
    expect(failure).toBeNull();
    const floors = {
      'listen:phrase': 1,
      'held:phrase-made': 2,
      'day:later-after-new-phrase': 1,
      'day:next': 6,
      'home:begin': 5,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
