/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * The second part of `walk-d.test.tsx`, split so each part runs alone under its
 * budget: generated device 10, holding the floors `walk-d.test.tsx`'s own
 * devices leave unreached.
 *
 * Home A walked through the root (`test/home-walk.ts`), part j: device 0
 * of seed 10, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, the done state's `Practice anyway` taken, a plant's tap on
 * a plan item, on a planted verse and on a verse not planted, a landed
 * remove, a landed add over an open visit, a return to the foreground on
 * Today, the morning's and evening's greetings, and a relaunch that lands
 * on home.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'card:Practice anyway',
  'home:anyway',
  'root:no-begin',
  'root:relaunch-home',
  'home:remove',
];

describe('home A, walked (j)', () => {
  it('shows the furrows, the card, a plant’s start and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(10, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
