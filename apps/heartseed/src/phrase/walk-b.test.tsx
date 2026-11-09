/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned as phrases, walked through the
 * root (`test/phrase-rig.tsx`), part b, file one: generated device 2 (its
 * layer teaching Fear), four days, each launch through home's `Begin`,
 * held to the walk's oracle after every step. Its floors: Fear's phrases
 * and joins on Today, joined verses reviewed, the phrases' records, and
 * `Begin` taken from home. The part's other file is `walk-b2.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('phrases on Today, walked (b)', () => {
  it('teaches Fear in phrases and joins, and reviews joined verses whole', async () => {
    const { failure, cover } = await walkPhrases([2]);
    expect(failure).toBeNull();
    const floors = {
      'device:fear': 1,
      'today:fear-phrase': 4,
      'today:fear-join': 8,
      'today:joined-review': 8,
      'record:phrase': 10,
      'home:begin': 5,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
