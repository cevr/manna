/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part d: device 0
 * of seed 636, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, a choice let go, `Practice` on a plan item and on a
 * phrase, `Learn`, a landed add and a landed remove, returns to the
 * foreground on home and on Today, one over a result held, and the
 * morning's and evening's greetings.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'home:letgo',
  'start:plan',
  'start:phrase',
  'card:Learn',
  'greeting:morning',
  'greeting:evening',
  'root:begin',
  'root:start',
  'root:back',
  'home:remove',
  'home:add',
  'home:wake',
  'today:wake',
  'wake:over-held',
];

describe('home A, walked (d)', () => {
  it('shows the furrows, the choice, the card and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(636, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
