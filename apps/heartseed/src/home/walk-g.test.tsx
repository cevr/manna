/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part g: device 0
 * of seed 317, fourteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * those that parts b, d and e's devices reached while the walk began on
 * Today: a moved choice, `Practice` on a planted verse and over an open
 * visit, `Learn` on a verse not planted, and a minutes choice made in the
 * Settings sheet. `Start` tapped while a said result is held, with `Your
 * field` taken with it held, is `walk-c.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:moved',
  'start:plant',
  'start:over-visit',
  'root:start',
  'start:learn',
  'card:Learn',
  'made:minutes',
];

describe('home A, walked (g)', () => {
  it('shows the furrows, the choice, the card and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(317, [0], 14);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
