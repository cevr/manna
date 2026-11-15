/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part c: device 0
 * of seeds 32 and 94, eighteen commands each from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start` shown and held back in the done state, where the Today card
 * offers `Practice anyway` and it is taken, a plant's tap on a plan item,
 * on a seed, on a planted verse, on a verse not planted, on a verse whose
 * old pieces an earlier build stored (learned whole) and over an open
 * visit, a landed add, returns to the foreground on Today over an open
 * visit, the afternoon's greeting, and a relaunch that lands on home.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:begun',
  'start:plant',
  'start:learn',
  'tap:not planted',
  'card:Practice anyway',
  'home:anyway',
  'root:no-begin',
  'root:begin',
  'root:start',
  'root:back',
  'root:relaunch-home',
  'start:plan',
  'start:over-visit',
  'tap:seed',
  'greeting:afternoon',
  'home:add',
  'today:wake',
  'wake:over-visit',
  'wake:today-over-visit',
];

describe('home A, walked (c)', () => {
  it('shows the furrows, the card, a plant’s start and the greeting as the models give them', async () => {
    const first = await walkHome(32, [0], 18);
    expect(first.failure).toBeNull();
    const second = await walkHome(94, [0], 18);
    expect(second.failure).toBeNull();
    const reached = (kind: string) => (first.cover[kind] ?? 0) + (second.cover[kind] ?? 0);
    expect(FLOORS.filter((kind) => reached(kind) >= 1)).toEqual(FLOORS);
  });
});
