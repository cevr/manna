/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part d: device 0
 * of seed 74, fourteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Begin`, a moved choice, `Start here` on a plan item and on a
 * phrase, a verse with nothing to start, the morning's greeting, and
 * relaunches that land on home. `Start here` on a planted verse and over
 * an open visit, and a landed remove, which this device no longer draws,
 * are `walk-g.test.tsx`'s, `walk-e.test.tsx`'s and `walk-b.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'home:moved',
  'start:plan',
  'start:none',
  'start:phrase',
  'greeting:morning',
  'root:start',
  'root:relaunch-home',
];

describe('home A, walked (d)', () => {
  it('shows the furrows, the choice, the foot and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(74, [0], 14);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
