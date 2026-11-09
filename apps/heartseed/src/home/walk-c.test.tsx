/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part c: device 0
 * of seed 69, fourteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Begin`, `Start here` on a phrase of the plan over a result held,
 * the afternoon's greeting, and `Your field` with a result held, then
 * `Begin`, which must show that result again with its `Next`.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:plan',
  'start:phrase',
  'start:over-held',
  'greeting:afternoon',
  'root:back-held',
  'root:relaunch-home',
];

describe('home A, walked (c)', () => {
  it('shows the furrows, the choice, the foot and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(69, [0], 14);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
