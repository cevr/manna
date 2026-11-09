/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part d2: generated device 0 of seed 297, twenty-eight commands, held to
 * the walk's oracle on the screen its model names after every command and
 * to the screens' and the root's rules on every frame. Its floors, the
 * rest of `walk-d.test.tsx`'s visits' counts: two visits said, three over
 * a held result, and the way back to home by Today's `Your field`.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:back'];

describe('When I need…, walked (d2)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(297, [0], 28);
    expect(failure).toBeNull();
    expect({
      said: (cover['visit:said'] ?? 0) >= 2,
      afterHeld: (cover['visit:after-held'] ?? 0) >= 3,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({ said: true, afterHeld: true, root: ROOT });
  });
});
