/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * When I need… and a visit walked through the root (`test/need-walk.ts`),
 * part b's visits: generated device 2 of seed 10, ten commands, held to
 * the walk's oracle on the screen its model names after every command and
 * to the screens' and the root's rules on every frame. Its floors: three
 * visits of other collections, two visits said, Fear's card with none
 * known, and When I need… opened from home and left by a promise.
 */

import { describe, expect, it } from 'bun:test';

import { walkNeed } from '../test/need-walk';

const ROOT = ['root:need-from-home', 'root:need-visit'];

describe('When I need…, walked (b, the visits)', () => {
  it('shows the cards, the visit and the plan as the models give them', async () => {
    const { failure, cover } = await walkNeed(10, [2], 10);
    expect(failure).toBeNull();
    expect({
      noneKnown: (cover['need:fear-none-known'] ?? 0) >= 2,
      other: (cover['visit:other-collection'] ?? 0) >= 3,
      said: (cover['visit:said'] ?? 0) >= 2,
      root: ROOT.filter((kind) => (cover[kind] ?? 0) >= 1),
    }).toEqual({ noneKnown: true, other: true, said: true, root: ROOT });
  });
});
