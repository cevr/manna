/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned as phrases, walked through the
 * root (`test/phrase-rig.tsx`), part c: generated devices 4 and 5 (its
 * layer teaching Fear), four days each, held to the walk's oracle after
 * every step. Its floors: phrases reviewed, Fear's phrases, joined verses
 * reviewed, a join under first letters, Listen on a whole verse and a
 * making while a phrase's recital listens.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('phrases on Today, walked (c)', () => {
  it('joins a verse under first letters once its phrases ripen, and keeps the phrases apart', async () => {
    const { failure, cover } = await walkPhrases([4, 5]);
    expect(failure).toBeNull();
    const floors = {
      'device:fear': 1,
      'today:phrase-review': 6,
      'today:fear-phrase': 4,
      'today:joined-review': 8,
      'today:join': 1,
      'today:join-under-letters': 1,
      'listen:verse': 1,
      'held:phrase-made': 2,
      'record:phrase': 6,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
