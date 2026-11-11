/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part a: device 0
 * of seed 572, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, a choice let go and moved, `Practice` on a phrase, on a
 * planted verse and over a result held, `Learn` on a verse not planted,
 * the Today card's `Practice anyway` in the done state, a landed remove,
 * a return to the foreground on home, the morning's and the evening's
 * greetings, Today's `Your field`, and a relaunch that lands on home.
 * Parts b to g walk other devices.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'home:letgo',
  'home:moved',
  'start:phrase',
  'start:over-held',
  'start:plant',
  'start:learn',
  'card:Learn',
  'card:Practice anyway',
  'home:anyway',
  'root:no-begin',
  'greeting:morning',
  'greeting:evening',
  'root:begin',
  'root:start',
  'root:back',
  'root:relaunch-home',
  'home:remove',
  'home:wake',
];

describe('home A, walked (a)', () => {
  it('shows the furrows, the choice, the card and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(572, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
