/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned as phrases, walked through the
 * root (`test/phrase-rig.tsx`), part c, file one: generated device 4, four
 * days, each launch through home's `Start`, held to the walk's oracle
 * after every step. Its floors: joined verses reviewed, a join under first
 * letters, Listen on a whole verse, `Start` taken from home, and the end
 * of a run (`The field is tended`) with one and several verses grown. The
 * part's other file is `walk-c2.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('phrases on Today, walked (c)', () => {
  it('joins a verse under first letters once its phrases ripen, and keeps the phrases apart', async () => {
    const { failure, cover } = await walkPhrases([4]);
    expect(failure).toBeNull();
    const floors = {
      'today:joined-review': 8,
      'today:join': 1,
      'today:join-under-letters': 1,
      'listen:verse': 1,
      'home:begin': 5,
      'end:one': 1,
      'end:many': 1,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
