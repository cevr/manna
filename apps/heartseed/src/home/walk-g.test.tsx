/* oxlint-disable effect/noAsyncFunction -- the part awaits the walk's promise-based run of the root. */

/**
 * Home A walked through the root (`test/home-walk.ts`), part g: device 0
 * of seed 119, fourteen commands from its launch on home, held to the
 * walk's oracle on the screen its model names after every command and to
 * the screens', the root's and home A's rules on every frame. Its floors,
 * those that parts b, d and e's devices reached while the walk began on
 * Today: a moved choice, `Start here` on a planted verse and over an open
 * visit, and `Begin` tapped while a said result is held (Today must still
 * show that result and its `Next`), with `Your field` taken with it held.
 */

import { describe, expect, it } from 'bun:test';

import { walkHome } from '../test/home-walk';

const FLOORS = [
  'home:moved',
  'start:plant',
  'start:over-visit',
  'home:begin-held',
  'root:back-held',
  'root:start',
  'root:need-from-home',
];

describe('home A, walked (g)', () => {
  it('shows the furrows, the choice, the foot and the greeting as the models give them', async () => {
    const { failure, cover } = await walkHome(119, [0], 14);
    expect(failure).toBeNull();
    expect(FLOORS.filter((kind) => (cover[kind] ?? 0) >= 1)).toEqual(FLOORS);
  });
});
