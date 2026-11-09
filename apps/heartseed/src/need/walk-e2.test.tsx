/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part e2: generated device 0 of seed 107, twenty-six commands, held to
 * the walk's oracle on the screen its model names after every command and
 * to the screens' and the root's rules on every frame. Its floors, the
 * rest of `walk-e.test.tsx`'s: a visit dropped by a relaunch the next
 * morning, three visits said, and a relaunch that lands on home.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:relaunch-home'];

describe('When I need…, walked (e2)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(107, [0], 26);
    expect(failure).toBeNull();
    expect({
      relaunch: (cover['visit:dropped-by-relaunch'] ?? 0) >= 1,
      said: (cover['visit:said'] ?? 0) >= 3,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({ relaunch: true, said: true, root: ROOT });
  });
});
