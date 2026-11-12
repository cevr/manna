/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part e: device 0
 * of seed 205, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, the done state's `Practice anyway`, a plant's tap on a
 * plan item, on a seed, on a verse not planted, on a verse whose old
 * pieces an earlier build stored (learned whole) and over an open visit, a
 * minutes choice made in the Settings sheet, a return to the foreground
 * while Today shows an open visit, the morning's and evening's greetings,
 * and a relaunch that lands on home.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:begun',
  'start:learn',
  'tap:not planted',
  'home:anyway',
  'root:no-begin',
  'greeting:morning',
  'greeting:evening',
  'root:begin',
  'root:start',
  'root:back',
  'root:relaunch-home',
  'start:plan',
  'start:over-visit',
  'tap:seed',
  'made:minutes',
  'today:wake',
  'wake:over-visit',
  'wake:today-over-visit',
];

describe('home A, walked (e)', () => {
  it('shows the furrows, the card, a plant’s start and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(205, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
