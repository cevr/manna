/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned whole over a garden that holds
 * the old pieces main's build cut them into, walked through the root
 * (`test/phrase-rig.tsx`), part a: generated device 1, four days, each
 * launch through home's `Start`, held to the walk's oracle after every
 * step (home's counts line and `Start`; Today's item, counts, action,
 * Listen and cue; the voice's text and lit words; the summary; the
 * record; the disk; the root's frame rule). Its floors: verses main cut,
 * new and reviewed, among them verses begun in old pieces; a verse of 35
 * words or more recited whole; a making while a recital listens (at the
 * session seam); a launch later on a day a begun verse was learned;
 * `Start` taken from home; and the end of a run (`The field is tended`)
 * with nothing, one and several verses grown, one of them begun in old
 * pieces.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('long verses whole on Today, walked (a)', () => {
  it('offers, reads, hears and keeps each verse whole, its old pieces never an item, day after day', async () => {
    const { failure, cover } = await walkPhrases([1]);
    expect(failure).toBeNull();
    const floors = {
      'today:cut-new': 2,
      'today:cut-review': 8,
      'today:begun-new': 1,
      'today:begun-review': 3,
      'record:long': 1,
      'record:verse': 10,
      'held:verse-made': 3,
      'day:later-after-new-begun': 1,
      'home:begin': 5,
      'end:none': 1,
      'end:one': 1,
      'end:many': 1,
      'end:begun': 1,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
