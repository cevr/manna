/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part e: device 0
 * of seed 14, fourteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, `Practice` on a phrase of the plan and on a planted
 * verse, and the afternoon's greeting. `Start` tapped while a said result
 * is held, which this device no longer draws, is `walk-g.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:plan',
  'start:phrase',
  'start:plant',
  'greeting:afternoon',
  'root:start',
];

describe('home A, walked (e)', () => {
  it('shows the furrows, the choice, the card and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(14, [0], 14);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
