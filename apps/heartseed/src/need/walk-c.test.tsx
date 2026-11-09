/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part c: two generated devices of seed 193, eight commands each, held to
 * the walk's oracle on the screen its model names after every command and
 * to the screens' and the root's rules on every frame. Its floors: a visit
 * over a plan item, one kept over home, and the bar's way back. A visit
 * through to its next verse and one dropped by a minutes choice are
 * `walk-e.test.tsx`'s; one dropped by a relaunch and three said are
 * `walk-e2.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:need-back', 'root:need-visit', 'root:relaunch-home'];

describe('When I need…, walked (c)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(193, [0, 1], 8);
    expect(failure).toBeNull();
    expect({
      planItem: (cover['visit:plan-item'] ?? 0) >= 2,
      field: (cover['visit:kept-over-field'] ?? 0) >= 1,
      back: (cover['need:back'] ?? 0) >= 1,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({ planItem: true, field: true, back: true, root: ROOT });
  });
});
