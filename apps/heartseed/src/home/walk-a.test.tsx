/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part a: device 0
 * of seed 30, fourteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Begin`, a choice let go and moved, `Start here` on a plan item, on
 * a phrase and over an open visit, the morning's greeting, Today's `Your field`, and a relaunch that lands on
 * home. Parts b to g walk other devices.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'home:letgo',
  'home:moved',
  'start:plan',
  'start:phrase',
  'start:over-visit',
  'greeting:morning',
  'root:begin',
  'root:start',
  'root:back',
  'root:relaunch-home',
];

describe('home A, walked (a)', () => {
  it('shows the furrows, the choice, the foot and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(30, [0], 14);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
