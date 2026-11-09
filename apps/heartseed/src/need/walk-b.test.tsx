/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part b: two generated devices of seed 4, ten commands each, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens' and the root's rules on every frame. Its floors: the first
 * minute's day, Fear's card with none known, visits of other collections,
 * a visit dropped by a Minutes tap and by a relaunch the next morning, two
 * visits said, When I need… opened from home and left by a promise, and a
 * relaunch that lands on home. The bar's way back, which these devices no
 * longer draw, is `walk-e.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:need-from-home', 'root:need-visit', 'root:relaunch-home'];

describe('When I need…, walked (b)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(4, [0, 1], 10);
    expect(failure).toBeNull();
    expect({
      firstDay: (cover['gen:first-minute-day'] ?? 0) >= 1,
      noneKnown: (cover['need:fear-none-known'] ?? 0) >= 2,
      other: (cover['visit:other-collection'] ?? 0) >= 3,
      making: (cover['visit:dropped-by-making'] ?? 0) >= 1,
      relaunch: (cover['visit:dropped-by-relaunch'] ?? 0) >= 1,
      said: (cover['visit:said'] ?? 0) >= 2,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({
      firstDay: true,
      noneKnown: true,
      other: true,
      making: true,
      relaunch: true,
      said: true,
      root: ROOT,
    });
  });
});
