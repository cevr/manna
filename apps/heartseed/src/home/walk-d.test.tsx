/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A's field walked through the root (`test/home-walk.ts`), part d:
 * device 0 of seed 74, fourteen commands, held to the walk's oracle after
 * every command and to the screens' and home A's rules on every frame. Its
 * floors, from the counts the device reaches: gold dots and planted plants
 * without one, `Begin`, a moved choice, `Start here` on a plan item, on a
 * phrase, on a planted verse and over an open visit, a verse with nothing
 * to start, a landed remove, and the morning's greeting.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:dot',
  'home:no-dot',
  'home:begin',
  'home:moved',
  'start:plan',
  'start:plant',
  'start:none',
  'start:phrase',
  'start:over-visit',
  'home:remove',
  'greeting:morning',
];

describe('home A, walked (d)', () => {
  it('shows the furrows, the choice, the foot and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(74, [0], 14);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
