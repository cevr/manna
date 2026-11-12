/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part b: device 0
 * of seed 5, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, a plant's tap on a plan item, on a seed, on a planted
 * verse, on a verse not planted and over a result held, a minutes choice
 * made in the Settings sheet, `Your field` with a result held and then
 * `Start`, a landed add over a result held and over an open visit, a
 * return to the foreground on Today, and the morning's and evening's
 * greetings.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:over-held',
  'start:plant',
  'tap:not planted',
  'greeting:morning',
  'greeting:evening',
  'root:begin',
  'root:start',
  'root:back',
  'start:plan',
  'tap:seed',
  'root:back-held',
  'home:begin-held',
  'made:minutes',
  'home:add',
  'today:wake',
  'add:over-held',
  'add:over-visit',
];

describe('home A, walked (b)', () => {
  it('shows the furrows, the card, a plant’s start and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(5, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
