/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part d3: generated device 0 of seed 382, sixteen commands, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens' and the root's rules on every frame. Its floors, the rest
 * of the visits' counts over home's way in that `walk-d.test.tsx` leaves:
 * the cards opened twice more and two more visits replaced.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:need-from-home', 'root:need-visit'];

describe('When I need…, walked (d3)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(382, [0], 16);
    expect(failure).toBeNull();
    expect({
      opened: (cover['need:opened'] ?? 0) >= 2,
      replaced: (cover['visit:replaced'] ?? 0) >= 2,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({
      opened: true,
      replaced: true,
      root: ROOT,
    });
  });
});
