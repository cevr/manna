/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned as phrases, walked through the
 * root (`test/phrase-rig.tsx`), part b: generated devices 2 (its layer
 * teaching Fear) and 3, four days each, held to the walk's oracle after
 * every step. Its floors: Fear's phrases and joins on Today, joined verses
 * reviewed, Listen on a phrase, a making while a phrase's recital listens,
 * and a launch later on a day a new phrase was said (no second new piece).
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('phrases on Today, walked (b)', () => {
  it('teaches Fear in phrases and joins, and reviews joined verses whole', async () => {
    const { failure, cover } = await walkPhrases([2, 3]);
    expect(failure).toBeNull();
    const floors = {
      'device:fear': 1,
      'today:fear-phrase': 4,
      'today:fear-join': 8,
      'today:joined-review': 8,
      'listen:phrase': 1,
      'held:phrase-made': 2,
      'record:phrase': 10,
      'day:later-after-new-phrase': 1,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
