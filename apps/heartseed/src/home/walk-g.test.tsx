/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part g: device 0
 * of seed 38, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, a plant's tap on a plan item and over a result held, a
 * landed add, returns to the foreground on home over an
 * open visit and over a result held, the morning's and afternoon's
 * greetings, and a relaunch that lands on home.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:plan',
  'start:over-held',
  'greeting:morning',
  'greeting:afternoon',
  'root:begin',
  'root:start',
  'root:back',
  'root:relaunch-home',
  'home:add',
  'home:wake',
  'wake:over-visit',
  'wake:over-held',
];

describe('home A, walked (g)', () => {
  it('shows the furrows, the card, a plant’s start and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(38, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
