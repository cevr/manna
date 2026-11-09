/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part e: generated device 0 of seed 729, twenty-six commands, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens' and the root's rules on every frame. Its floors, those that
 * `walk-b.test.tsx`'s and `walk-c.test.tsx`'s devices reached while When I
 * need… was a way from Today: a visit through to its next verse, one
 * dropped by a Minutes tap and by a relaunch, three said, and the bar's
 * way back, now to home.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:need-back', 'root:relaunch-home'];

describe('When I need…, walked (e)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(729, [0], 26);
    expect(failure).toBeNull();
    expect({
      nextVerse: (cover['visit:next-verse'] ?? 0) >= 1,
      making: (cover['visit:dropped-by-making'] ?? 0) >= 1,
      relaunch: (cover['visit:dropped-by-relaunch'] ?? 0) >= 1,
      said: (cover['visit:said'] ?? 0) >= 3,
      back: (cover['need:back'] ?? 0) >= 1,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({
      nextVerse: true,
      making: true,
      relaunch: true,
      said: true,
      back: true,
      root: ROOT,
    });
  });
});
