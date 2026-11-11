/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned as phrases, walked through the
 * root (`test/phrase-rig.tsx`), part a: generated device 1, four days,
 * each launch through home's `Start`, held to the walk's oracle after
 * every step (home's counts line and `Start`; Today's item, counts,
 * action, Listen and cue; the voice's text and lit words; the summary; the
 * record; the disk; the root's frame rule). Its floors: new and reviewed
 * phrases, Listen on a phrase, a making while a phrase's recital listens
 * (at the session seam), a join under first letters, a launch later on a
 * day a new phrase was said, Chatham, `Start` taken from home, and the
 * end of a run (`The field is tended`) with nothing, one and several
 * verses grown, one of them grown by its phrase.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('phrases on Today, walked (a)', () => {
  it('offers, reads, hears and keeps each phrase as its own piece, day after day', async () => {
    const { failure, cover } = await walkPhrases([1]);
    expect(failure).toBeNull();
    const floors = {
      'today:phrase-new': 2,
      'today:phrase-review': 8,
      'listen:phrase': 1,
      'record:phrase': 10,
      'held:phrase-made': 4,
      'next:after-phrase': 10,
      'today:join': 1,
      'today:join-under-letters': 1,
      'zone:Pacific/Chatham': 1,
      'day:later-after-new-phrase': 1,
      'home:begin': 5,
      'end:none': 1,
      'end:one': 1,
      'end:many': 1,
      'end:phrase': 1,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
