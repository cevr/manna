/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned whole over a garden that holds
 * the old pieces main's build cut them into, walked through the root
 * (`test/phrase-rig.tsx`), part c, file one: generated device 4, four
 * days, each launch through home's `Start`, held to the walk's oracle
 * after every step. Its floors: verses begun in old pieces learned new
 * under the full text and reviewed by their own plant, Listen on a long
 * verse and on a short one, `Start` taken from home, and the end of a run
 * (`The field is tended`) with one and several verses grown, one of them
 * begun in old pieces. The part's other file is `walk-c2.test.tsx`.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('long verses whole on Today, walked (c)', () => {
  it('learns a verse begun in old pieces whole under the full text, and reviews it by its own plant alone', async () => {
    const { failure, cover } = await walkPhrases([4]);
    expect(failure).toBeNull();
    const floors = {
      'today:begun-new': 2,
      'today:begun-review': 4,
      'listen:long': 1,
      'listen:verse': 1,
      'home:begin': 5,
      'end:one': 1,
      'end:many': 1,
      'end:begun': 2,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
