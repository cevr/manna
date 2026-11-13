/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part e: device 0
 * of seed 250, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, a plant's tap on a verse not planted (learned whole), a
 * minutes choice made in the Settings sheet, `Your field` over a result
 * before `Next`, which lets it go unwritten, and then `Start`, a landed
 * add, returns to the foreground on home and on Today over a result held,
 * the morning's and
 * evening's greetings, and a relaunch that lands on home.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'field:let-go',
  'home:dot',
  'home:no-dot',
  'home:begin',
  'start:learn',
  'tap:not planted',
  'greeting:morning',
  'greeting:evening',
  'root:begin',
  'root:start',
  'root:back',
  'root:relaunch-home',
  'home:wake',
  'today:wake',
  'wake:over-held',
  'made:minutes',
  'home:add',
];

describe('home A, walked (e)', () => {
  it('shows the furrows, the card, a plant’s start and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(250, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
