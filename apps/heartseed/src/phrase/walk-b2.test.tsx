/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Today over days with long verses learned whole over a garden that holds
 * the old pieces main's build cut them into, walked through the root
 * (`test/phrase-rig.tsx`), part b, file two: generated device 8 (its
 * layer teaching Fear, every piece before Fear's first verse of 35 words
 * or more planted, so that verse is the new piece), four days, each
 * launch through home's `Start`, held to the walk's oracle after every
 * step. Its floors: Fear's long verses on Today, the long verse offered
 * new, read by Listen with each word lit in turn, and recited whole, a
 * making while a long verse's recital listens, a launch later on a day a
 * begun verse was learned, and `Start` taken from home.
 */

import { describe, expect, it } from 'bun:test';

import { walkPhrases } from '../test/phrase-rig';

describe('long verses whole on Today, walked (b2)', () => {
  it('offers Fear’s long verse new, whole, and reads, lights and keeps it whole', async () => {
    const { failure, cover } = await walkPhrases([8]);
    expect(failure).toBeNull();
    const floors = {
      'device:fear': 1,
      'gen:long-next': 1,
      'today:fear-long': 4,
      'today:long-new': 1,
      'listen:long': 1,
      'record:long': 5,
      'held:long-made': 1,
      'day:later-after-new-begun': 1,
      'home:begin': 5,
    };
    expect(Object.entries(floors).filter(([kind, floor]) => (cover[kind] ?? 0) < floor)).toEqual(
      [],
    );
  });
});
