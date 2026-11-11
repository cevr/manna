/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part e: device 0
 * of seed 444, eighteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * from the counts the device reaches: gold dots and planted plants without
 * one, `Start`, a moved choice, `Practice` on a plan item, on a phrase, on
 * a planted verse and over an open visit, `Learn` on a verse not planted,
 * a landed remove, a return to the foreground while Today shows an open
 * visit, and the morning's greeting.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'home:moved',
  'start:plan',
  'start:phrase',
  'start:over-visit',
  'start:plant',
  'start:learn',
  'card:Learn',
  'greeting:morning',
  'root:begin',
  'root:start',
  'root:back',
  'home:remove',
  'today:wake',
  'wake:over-visit',
  'wake:today-over-visit',
];

describe('home A, walked (e)', () => {
  it('shows the furrows, the choice, the card and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(444, [0], 18);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
