/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part b: device 0
 * of seed 10, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: planted plants without a dot,
 * `Begin` shown and held back in the done state, a landed remove, the
 * evening's greeting, and When I need… opened from home and left by a
 * promise. A moved choice and `Start here` on a planted verse, which this
 * device no longer draws, are `walk-g.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:no-dot',
  'home:begin',
  'home:no-begin',
  'home:remove',
  'greeting:evening',
  'root:no-begin',
  'root:need-from-home',
  'root:need-visit',
];

describe('home A, walked (b)', () => {
  it('shows the furrows, the choice, the foot and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(10, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
