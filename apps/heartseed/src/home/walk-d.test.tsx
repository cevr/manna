/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part d: device 0
 * of seeds 5 and 10, eighteen commands each from its launch on home, held to the
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
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:plant',
  'tap:not planted',
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
  'start:plan',
  'today:wake',
  'home:add',
  'add:over-visit',
];

describe('home A, walked (d)', () => {
  it('shows the furrows, the card, a plant’s start and the greeting as the models give them', async () => {
    const first = await walkHome(5, [0], 18);
    expect(first.failure).toBeNull();
    const second = await walkHome(10, [0], 18);
    expect(second.failure).toBeNull();
    const reached = (kind: string) => (first.cover[kind] ?? 0) + (second.cover[kind] ?? 0);
    expect(FLOORS.filter((kind) => reached(kind) >= 1)).toEqual(FLOORS);
  });
});
