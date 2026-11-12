/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part b: device 0
 * of seed 282, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, a moved choice, `Practice` on a plan item, on a phrase, on
 * a planted verse and over an open visit, `Learn`, a minutes choice made
 * in the Settings sheet, `Your field` with a result held and then `Start`,
 * a landed add over a result held, returns to the foreground on home and
 * on Today, and the morning's, afternoon's and evening's greetings.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'home:moved',
  'start:plan',
  'start:begun',
  'start:over-visit',
  'start:plant',
  'card:Learn',
  'greeting:morning',
  'greeting:afternoon',
  'greeting:evening',
  'root:begin',
  'root:start',
  'root:back',
  'root:back-held',
  'home:begin-held',
  'made:minutes',
  'home:add',
  'home:wake',
  'today:wake',
  'add:over-held',
];

describe('home A, walked (b)', () => {
  it('shows the furrows, the choice, the card and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(282, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
