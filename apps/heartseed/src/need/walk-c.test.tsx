/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part c: two generated devices of seed 6, eight commands each, held to the
 * walk's oracle after every command and to the screens' rules on every
 * frame. Its floors: a visit through to its next verse, a visit over a
 * plan item, one dropped by a Minutes tap and by a relaunch, one kept over
 * the field, and the bar's way back.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

describe('When I need…, walked (c)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(6, 2, 8);
    expect(failure).toBeNull();
    expect({
      nextVerse: (cover['visit:next-verse'] ?? 0) >= 1,
      planItem: (cover['visit:plan-item'] ?? 0) >= 2,
      making: (cover['visit:dropped-by-making'] ?? 0) >= 1,
      relaunch: (cover['visit:dropped-by-relaunch'] ?? 0) >= 1,
      field: (cover['visit:kept-over-field'] ?? 0) >= 1,
      back: (cover['need:back'] ?? 0) >= 1,
      said: (cover['visit:said'] ?? 0) >= 3,
    }).toEqual({
      nextVerse: true,
      planItem: true,
      making: true,
      relaunch: true,
      field: true,
      back: true,
      said: true,
    });
  });
});
