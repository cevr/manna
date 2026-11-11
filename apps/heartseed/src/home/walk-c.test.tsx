/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part c: device 0
 * of seed 10, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start` shown and held back in the done state, where the Today card
 * offers `Practice anyway` and it is taken, `Practice` on a planted verse,
 * a landed add and a return to the foreground on Today, each over an open
 * visit, a landed remove, the three greetings, and a relaunch that lands
 * on home.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:plant',
  'card:Practice anyway',
  'home:anyway',
  'root:no-begin',
  'greeting:morning',
  'greeting:afternoon',
  'greeting:evening',
  'root:begin',
  'root:start',
  'root:back',
  'root:relaunch-home',
  'home:remove',
  'home:add',
  'today:wake',
  'add:over-visit',
  'wake:over-visit',
];

describe('home A, walked (c)', () => {
  it('shows the furrows, the choice, the card and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(10, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
