/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part a: device 0
 * of seed 10, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, a plant's tap straight into Today on a plan item, on a
 * planted verse and on a verse not planted (learned whole), the Today
 * card's `Practice anyway` in the done state, a landed remove, returns to
 * the foreground on home and on Today over an open visit and a result
 * held, the morning's and the evening's greetings, Today's `Your field`,
 * and a relaunch that lands on home. Parts b to g walk other devices.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:plant',
  'start:learn',
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
  'home:wake',
  'start:plan',
  'today:wake',
  'wake:over-visit',
  'wake:over-held',
  'wake:today-over-visit',
];

describe('home A, walked (a)', () => {
  it('shows the furrows, the card, a plant’s start and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(10, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
