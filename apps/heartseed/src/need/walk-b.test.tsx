/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part b: generated device 2 of seed 18, ten commands, held to the walk's
 * oracle on the screen its model names after every command and to the
 * screens' and the root's rules on every frame. Its floors: the first
 * minute's day, Fear's card with none known, a visit dropped by a Minutes
 * tap and by a relaunch the next morning, When I need… opened from home,
 * and a relaunch that lands on home. Visits of other collections and two
 * visits said are `walk-b2.test.tsx`'s; the bar's way back is
 * `walk-e.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:need-from-home', 'root:need-visit', 'root:relaunch-home'];

describe('When I need…, walked (b)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(18, [2], 10);
    expect(failure).toBeNull();
    expect({
      firstDay: (cover['gen:first-minute-day'] ?? 0) >= 1,
      noneKnown: (cover['need:fear-none-known'] ?? 0) >= 2,
      making: (cover['visit:dropped-by-making'] ?? 0) >= 1,
      relaunch: (cover['visit:dropped-by-relaunch'] ?? 0) >= 1,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({
      firstDay: true,
      noneKnown: true,
      making: true,
      relaunch: true,
      root: ROOT,
    });
  });
});
